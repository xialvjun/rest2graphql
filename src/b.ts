// import * as z from "zod";
import { accessSync, constants, readFileSync } from "fs";
import { cosmiconfigSync } from "cosmiconfig";
import koa from "koa";
import koaSend from "koa-send";
import koaConnect from "koa-connect";
import { createProxyMiddleware } from "http-proxy-middleware";
import { cloneDeepWith, merge } from "lodash-es";
import { ApolloServer, Config as ApolloServerConfig, ServerRegistration as ApolloServerRegistration } from "apollo-server-koa";
import { IFieldResolver as AskIFieldResolver, IEnumResolver as AskIEnumResolver } from "apollo-server-koa";
import ejs from "ejs";
import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import { setGlobalConfig } from "axios-logger";
import { GraphQLScalarType } from "graphql";
// import ts_loader from '@endemolshinegroup/cosmiconfig-typescript-loader';

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
const config = ((process.argv[2] ? explorer.load(process.argv[2]) : explorer.search()) as any) as Config;

const app = new koa();

if (config.axios) {
  if (config.axios.logger) {
    setGlobalConfig(config.axios.logger);
  }
  config.axios.interceptors = cloneDeepWith(config.axios.interceptors || {}, (v, k, o, s) => {
    if (s.size === 1) {
      if (typeof v === "string" && v.startsWith("js:")) {
        return geval(`(${v.slice(3)})`);
      }
    }
  });
}

if (config.graphql) {
  let apollo_config = cloneDeepWith(config.graphql, (v, k, o, s) => {
    if (s.size === 1) {
      if (k === "typeDefs" && typeof v === "string") {
        return getTypeDefs(v);
      }
      if (k === "resolvers") {
        return cloneDeepWith(v, (v, k, o, s) => {
          if (s.size === 2 && typeof v.url === "string") {
            let request: AxiosRequest = v;
            let preset: AxiosPreset | undefined =
              request.preset === false ? undefined : config.graphql!.axiosPresets?.[request.preset || "default"];
            let interceptors =
              preset?.interceptors?.map((it) => {
                const interceptor = config.axios?.interceptors?.[it];
                if (!interceptor) {
                  throw new Error(`axios interceptor (${it}) is not found, please declare it`);
                }
                return interceptor;
              }) || [];
            return (async (source, args, { ctx }, info) => {
              const axios_ins = axios.create(preset);
              interceptors.forEach((it) => (it as Function)(axios_ins, ctx));
              const req_env = { source, args, ctx, info };
              const res = await axios_ins(
                cloneDeepWith(request, (v, k, o, s) => {
                  if (typeof v === "string") {
                    if (v.startsWith("js:")) {
                      return geval(`({ source, args, ctx, info }) => (${v.slice(3)})`)(req_env);
                    }
                    return ejs.render(v, req_env);
                  }
                })
              );
              const res_env = { res, data: res.data };
              const { data, error } = cloneDeepWith(
                merge({ data: "js:res.data.data", error: "js:res.data.error" }, preset?.res, request.res),
                (v, k, o, s) => {
                  if (typeof v === "string") {
                    if (v.startsWith("js:")) {
                      return geval(`({ res, data }) => (${v.slice(3)})`)(res_env);
                    }
                    return ejs.render(v, res_env);
                  }
                }
              );
              if (error) {
                throw error;
              }
              return data;
            }) as AskIFieldResolver<any, { ctx: koa.Context }>;
          }
        });
      }
    }
  });
  apollo_config.context = ({ ctx }: any) => ({ ctx, axios: axios.create(), interceptors: { ...config.axios?.interceptors } });
  const apollo_server = new ApolloServer(apollo_config);
  apollo_server.applyMiddleware({ ...apollo_config.serverRegistration, app });
}

if (config.proxy) {
  config.proxy.forEach((proxy_config) => app.use(koaConnect(createProxyMiddleware(...proxy_config) as any)));
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
  serve_configs.forEach((serve_config) => {
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
