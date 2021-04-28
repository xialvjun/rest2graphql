#!/usr/bin/env node

// import * as z from "zod";
import { accessSync, constants, readFileSync } from "fs";
import { cosmiconfigSync } from "cosmiconfig";
import ejs from "ejs";
import koa from "koa";
import koaSend from "koa-send";
import koaConnect from "koa-connect";
import { createProxyMiddleware } from "http-proxy-middleware";
import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import { setGlobalConfig, requestLogger, responseLogger, errorLogger } from "axios-logger";
import { ApolloServer, Config as ApolloServerConfig, ServerRegistration as ApolloServerRegistration, ApolloError } from "apollo-server-koa";
import { IFieldResolver as AskIFieldResolver, IEnumResolver as AskIEnumResolver } from "apollo-server-koa";
import { GraphQLScalarType } from "graphql";

type JsEval = `js:${string}`;
type AxiosInterceptor = JsEval | ((axios: AxiosInstance, ctx: koa.Context) => any);
type AxiosPreset = AxiosRequestConfig & { res?: { data?: JsEval; error?: JsEval }; interceptors?: string[] };
type AxiosRequest = Omit<AxiosPreset, "interceptors"> & { preset?: string | false };

type IFieldResolver<C> = AskIFieldResolver<any, C> | AxiosRequest;
type IResolvers<C> = Record<string, Record<string, IFieldResolver<C>> | GraphQLScalarType | AskIEnumResolver>;

type ServeConfig = string | ({ path?: string; historyApiFallback?: false } & koaSend.SendOptions);
type ProxyConfig = Parameters<typeof createProxyMiddleware>;

type GraphqlConfig = Omit<ApolloServerConfig, "resolvers" | "context"> & {
  resolvers: IResolvers<{ ctx: koa.Context; axios: AxiosInstance; interceptors: Record<string, Exclude<AxiosInterceptor, JsEval>> }>;
  axiosPresets?: Record<string, AxiosPreset>;
  serverRegistration?: ApolloServerRegistration;
};

export type Config = {
  debug?: boolean;
  port: number;
  graphql?: GraphqlConfig;
  proxy?: ProxyConfig[];
  serve?: ServeConfig | ServeConfig[];
  axios?: {
    logger?: Parameters<typeof setGlobalConfig>[0];
    interceptors?: Record<string, AxiosInterceptor>;
  };
};

// const z_js_eval = z.custom<`js:${string}`>(d => typeof d === 'string' && d.startsWith('js:'))
// const z_config_proxy = z.array(z.tuple([z.any(), z.any()]));
// const z_serve_config = z.object({
//   path: z.string().optional(),
//   root: z.string(),
// }).nonstrict();
// const z_config_serve = z.union([z_serve_config, z.array(z_serve_config)]);
// const z_config_axios = z.object({
//   logger: z.object({}).nonstrict().optional(),
// });

const geval = eval;

const explorer = cosmiconfigSync("rest-graphql");
const result = process.argv[2] ? explorer.load(process.argv[2]) : explorer.search();
const config: Config = result?.config;

const app = new koa();
config.debug ??= process.env.NODE_ENV !== "production";
if (config.axios) {
  if (config.axios.logger) {
    setGlobalConfig(config.axios.logger);
  }
  config.axios.interceptors = cloneDeepWith(config.axios.interceptors || {}, (v, k, o, s) => {
    if (s?.size === 1) {
      if (typeof v === "string" && v.startsWith("js:")) {
        return geval(`(${v.slice(3)})`);
      }
    }
  });
}
if (config.graphql) {
  let apollo_config = cloneDeepWith(config.graphql, (v, k, o, s) => {
    if (s?.size === 1) {
      if (k === "typeDefs") {
        if (Array.isArray(v)) {
          return v.map(it => (typeof it === "string" ? getTypeDefs(it) : it));
        }
        if (typeof v === "string") {
          return getTypeDefs(v);
        }
        return v;
      }
      if (k === "resolvers") {
        return cloneDeepWith(v, (v, k, o, s) => {
          if (s?.size === 2 && typeof v.url === "string") {
            let { res: res_config, ...req_config }: AxiosRequest = v;
            let preset: AxiosPreset | undefined =
              req_config.preset === false ? undefined : config.graphql!.axiosPresets?.[req_config.preset || "default"];
            let interceptors =
              preset?.interceptors?.map(it => {
                const interceptor = config.axios?.interceptors?.[it];
                if (!interceptor) {
                  throw new Error(`axios interceptor (${it}) is not found, please declare it`);
                }
                return interceptor;
              }) || [];
            return (async (source, args, { ctx }, info) => {
              const axios_ins = axios.create(preset);
              addAxiosLogger(axios_ins);
              interceptors.forEach(it => (it as Function)(axios_ins, ctx));
              const req_env = { source, args, ctx, info };
              const res = await axios_ins(
                cloneDeepWith(req_config, (v, k, o, s) => {
                  if (typeof v === "string") {
                    if (v.startsWith("js:")) {
                      return geval(`({ source, args, ctx, info }) => (${v.slice(3)})`)(req_env);
                    }
                    return ejs.render(v, req_env);
                  }
                }),
              );
              const res_env = { res, data: res.data };
              const { data, error } = cloneDeepWith(
                {
                  data: res_config?.data ?? preset?.res?.data ?? "js:data.data",
                  error: res_config?.error ?? preset?.res?.error ?? "js:data.error",
                },
                (v, k, o, s) => {
                  if (typeof v === "string") {
                    if (v.startsWith("js:")) {
                      const result = geval(`({ res, data }) => (${v.slice(3)})`)(res_env);
                      // mustn't return undefined even if js code is evaluated to undefined
                      // because cloneDeepWith treat undefined as no change
                      // and data shouldn't return undefined too
                      return result === undefined ? null : result;
                    }
                    return ejs.render(v, res_env);
                  }
                },
              );
              if (error) {
                throw new ApolloError(error);
              }
              return data;
            }) as AskIFieldResolver<any, { ctx: koa.Context; axios: AxiosInstance }>;
          }
        });
      }
    }
  });
  apollo_config.context = ({ ctx }: any) => {
    const axios_ins = axios.create();
    addAxiosLogger(axios_ins);
    return { ctx, axios: axios_ins, interceptors: { ...config.axios?.interceptors } };
  };
  const apollo_server = new ApolloServer(apollo_config);
  apollo_server.applyMiddleware({ ...apollo_config.serverRegistration, app });
}

if (config.proxy) {
  config.proxy.forEach(proxy_config => app.use(koaConnect(createProxyMiddleware(...proxy_config) as any)));
}

if (config.serve) {
  const createServeMiddleware = (config: Exclude<ServeConfig, string>) => async (ctx: koa.Context, next: koa.Next) => {
    const path = config.path || "";
    if (ctx.path.startsWith(path)) {
      try {
        await koaSend(ctx, ctx.path.replace(path, ""), config);
      } catch (error) {
        if (config.historyApiFallback === false) {
          throw error;
        }
        await koaSend(ctx, config.index || "index.html", config);
      }
    }
  };
  const serve_configs = Array.isArray(config.serve) ? config.serve : [config.serve];
  serve_configs.forEach(serve_config => {
    if (typeof serve_config === "string") {
      serve_config = { root: serve_config };
    }
    app.use(createServeMiddleware(serve_config));
  });
}

app.listen(config.port, () => {
  console.log(`rest2graphql is listening on http://127.0.0.1:${config.port} http://0.0.0.0:${config.port}`);
});

function getTypeDefs(typeDefs: string) {
  try {
    accessSync(typeDefs, constants.R_OK);
    return readFileSync(typeDefs, "utf8");
  } catch (error) {
    return typeDefs;
  }
}

function addAxiosLogger(axios: AxiosInstance) {
  if (config.debug) {
    axios.interceptors.request.use(requestLogger, errorLogger);
    axios.interceptors.response.use(responseLogger, errorLogger);
  }
}

function cloneDeepWith(obj: any, customizer: (v: any, k: PropertyKey | undefined, o: any, s: { size: number }) => any) {
  return recursive(obj, undefined, undefined, { size: 0 });
  function recursive(v: any, k: PropertyKey | undefined, o: any, s: { size: number }): any {
    const result = customizer(v, k, o, s);
    if (result !== undefined) {
      return result;
    }
    if (typeof v !== "object") {
      return v;
    }
    if (Array.isArray(v)) {
      return v.map((v, k, o) => recursive(v, k, o, { size: s.size + 1 }));
    }
    return Object.fromEntries(Object.entries(v).map(([k, f]) => [k, recursive(f, k, v, { size: s.size + 1 })]));
  }
}
