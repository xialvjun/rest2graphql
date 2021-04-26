import * as z from "zod";
// import got, { Response as GotResponse } from 'got';
import koa from "koa";
import koa_send from "koa-send";
import { cloneDeepWith, merge, omit, pick } from "lodash-es";
import { ApolloServer, Config as ApolloServerConfig, ServerRegistration as ApolloServerRegistration } from "apollo-server-koa";
import * as ask from "apollo-server-koa";
import { accessSync, constants, readFileSync } from "fs";
import ejs from "ejs";
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosInterceptorManager } from "axios";
// { AxiosInstance, AxiosInterceptorManager, AxiosRequestConfig, AxiosResponse }
import { createProxyMiddleware } from "http-proxy-middleware";
import { setGlobalConfig } from "axios-logger";
import { GraphQLScalarType } from "graphql";
import koaConnect from "koa-connect";

// type Route = {
//   path: proxy.Filter
// }
// axios.create();
type AxiosRequest = AxiosRequestConfig & { preset?: string | false; interceptors?: string[] };

type IFieldResolver<TSource, TContext, TArgs = Record<string, any>> = ask.IFieldResolver<TSource, TContext, TArgs> | AxiosRequest;
type IResolverObject<TSource = any, TContext = any, TArgs = any> = {
  [key: string]: IFieldResolver<TSource, TContext, TArgs> | ask.IResolverOptions<TSource, TContext> | IResolverObject<TSource, TContext>;
};
type IResolvers<TSource = any, TContext = any> = {
  [key: string]:
    | (() => any)
    | IResolverObject<TSource, TContext>
    | ask.IResolverOptions<TSource, TContext>
    | GraphQLScalarType
    | ask.IEnumResolver;
};

type JsEval = `js:${string}`;

type ServeConfig = string | ({ path?: string; historyApiFallback?: false } & koa_send.SendOptions);
type ProxyConfig = Parameters<typeof createProxyMiddleware>;
type GraphqlConfig = Omit<ApolloServerConfig, "resolvers" | "context"> & {
  // typeDefs: ApolloServerConfig['typeDefs'];
  resolvers: IResolvers<any, { ctx: koa.Context & { state: { config: Config } } }>; // | Array<IResolvers>;
  axios?: Record<string, Omit<AxiosRequest, "preset">>;
  serverRegistration?: ApolloServerRegistration;
};

type AxiosInterceptorReq = (value: AxiosRequestConfig) => AxiosRequestConfig | Promise<AxiosRequestConfig>;
type AxiosInterceptorRes = (value: AxiosResponse) => AxiosResponse | Promise<AxiosResponse>;
type AxiosInterceptorError = (error: any) => any;
type AxiosInterceptor =
  | JsEval
  | ((axios: AxiosInstance) => any)
  | {
      req?: AxiosInterceptorReq | [AxiosInterceptorReq, AxiosInterceptorError];
      res?: AxiosInterceptorRes | [AxiosInterceptorRes, AxiosInterceptorError];
    };
export type Config = {
  debug?: boolean;
  port: number;
  graphql?: GraphqlConfig;
  proxy?: ProxyConfig[];
  serve?: ServeConfig | ServeConfig[];
  axios?: {
    logger?: Parameters<typeof setGlobalConfig>[0];
    // 纯粹由 axios.interceptors 来处理 preset，包括 ctx.res.header 因为 rest2graphql 直接用 axios.res.header, graphql.data/error 也由 interceptors 来处理，
    // interceptors 返回一个 {data:any, error:any} 的对象。。。每来一个请求就生成一个 axios 实例
    interceptors?: Record<string, AxiosInterceptor>;
  };
};

let config: Config = null!;

let a: GraphqlConfig["resolvers"] = {
  resolvers: {
    Query: {
      me: (root, args, ctx, info) => {
        // ctx.ctx.state.config
      },
      abc: {
        url: "saf",
        baseURL: "",
      },
    },
  },
};
let b: GraphqlConfig["axios"] = {
  default: {
    baseURL: "http://www.xxxx",
    interceptors: ["same_cookie", "res_data_a"],
  },
  abc: {},
};
console.log(a);

const geval = eval;

const app = new koa();
app.use((ctx, next) => {
  ctx.state.config = config;
  return next();
});

if (config.axios) {
  if (config.axios.logger) {
    setGlobalConfig(config.axios.logger);
  }
  config.axios.interceptors = cloneDeepWith(config.axios.interceptors || {}, (v, k, o, s) => {
    if (s.size === 1) {
      if (typeof v === "string" && v.startsWith("js:")) {
        v = geval(`(${v.slice(3)})`);
      }
      if (typeof v === "object") {
        const { req, res } = v;
        v = (ins: AxiosInstance) => {
          req && ins.interceptors.request.use(req[0] || req, req[1]);
          res && ins.interceptors.response.use(res[0] || res, res[1]);
        };
      }
      return v;
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
            let req_conf: AxiosRequest = v;
            let preset: Omit<AxiosRequest, "preset"> | undefined =
              req_conf.preset === false ? undefined : config.graphql!.axios?.[req_conf.preset || "default"];
            let preset_interceptors = preset?.interceptors?.map((it) => config.axios?.interceptors?.[it]);
            // todo: defaults
            // req_conf = merge({}, req_conf.extends === false ? {} : config.graphql!.axios?.[req_conf.extends || "default"], req_conf);
            // let opts = {
            //   ...req_conf,
            //   interceptors:
            //     req_conf.interceptors?.map((it) => {
            //       const interceptor = config.axios?.interceptors![it];
            //       if (!interceptor) {
            //         console.warn(`try to reference a not exist interceptor: ${it}`);
            //       }
            //       return interceptor;
            //     }) || [],
            // };
            // let base_axios = axios.create(preset);

            return ((root, args, { ctx }, info) => {
              const axios_ins = axios.create(preset);

              // axios.create(req_conf.extends === false ? {} : config.graphql!.axios?.[req_conf.extends || "default"]);
            }) as ask.IFieldResolver<any, { ctx: koa.Context & { state: { config: Config } } }>;
          }
        });
        let a = {
          resolver: {
            query: {
              abc: {
                url: "asf",
              },
            },
          },
        };
      }
    }
  });
  // if (typeof config.graphql.typeDefs === "string") {
  //   config.graphql.typeDefs = getTypeDefs(config.graphql.typeDefs);
  // }
  // if (config.graphql.resolvers) {
  // }
  apollo_config.context = ({ ctx }: any) => ({ ctx, axios: axios.create() });
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
        await koa_send(ctx, ctx.path.replace(path, ""), config);
      } catch (error) {
        if (config.historyApiFallback === false) {
          throw error;
        }
        await koa_send(ctx, config.index || "index.html", config);
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

// type GraphqlConfig = ApolloServerConfig
// axios.interceptors.request.use();

// // import fetch from 'node-fetch';
// // axios('', {
// //   data: {}
// // }).then(res => {
// //   // res.data
// //   res.headers
// // })
// //  silentJSONParsing
// //  npm i axios-logger
// // roarr

// const z_function_string = z
//   .string()
//   .refine((v) => v.startsWith('js:'), 'should be a js:function string');
// const z_selector_string = z
//   .string()
//   .refine((v) => v.startsWith('js:'), 'should be a js:selector string');

// const z_resolver_object = z.object({
//   preset: z.string().optional(),
//   method: z.enum(['get', 'post', 'put', 'patch', 'head', 'delete']).optional(),
//   prefixUrl: z.string().optional(),
//   url: z.string(),
//   headers: z.record(z.union([z.string(), z.array(z.string())])).optional(),
//   body: z.string().optional(),
//   form: z.any().optional(),
//   json: z.any().optional(),
//   data: z_selector_string,
//   error: z_selector_string,
// });
// const z_resolver = z.union([
//   z_resolver_object,
//   z.function(),
//   z_function_string,
// ]);
// const z_graphql_config = z.object({
//   typeDefs: z.string(), // it's either a gql file path or the gql content
//   presets: z
//     .record(z_resolver_object.partial().omit({ preset: true }))
//     .optional(),
//   resolvers: z.record(z.record(z_resolver)),
// });

// // new ApolloServer()

// type GraphqlConfig = z.infer<typeof z_graphql_config>;
// type ResolverObject = z.infer<typeof z_resolver_object>;
// type ReqEnv = { root: any; args: any; ctx: Koa.Context };
// type ResEnv = { res: GotResponse; text: string; json: any };

// // type A = Omit<ApolloServerConfig, 'typeDefs'>

// export function make_middleware(config: GraphqlConfig): ApolloServer {
//   return new ApolloServer({
//     typeDefs: getTypeDefs(config.typeDefs),
//     resolvers: cloneDeepWith(config.resolvers, (v, key, obj, stack) => {
//       if (stack.size === 1) {
//         // const ObjectType = v;
//         return;
//       }
//       if (stack.size === 2) {
//         const resolver = v;
//         if (typeof resolver === 'object') {
//           const resolver_obj: ResolverObject = resolver;
//           const preset_obj = config.presets?.[resolver_obj.preset || 'default'];
//           const get_req = (obj: ResolverObject) => {
//             const req_obj = omit(obj, 'data', 'error');
//             return (env: ReqEnv) =>
//               cloneDeepWith(req_obj, (v) => {
//                 if (typeof v === 'string') {
//                   if (v.startsWith('js:')) {
//                     return (0, eval)('({root, args, ctx}) => ' + v.slice(3))(
//                       env,
//                     );
//                   }
//                   return ejs.render(v, env);
//                 }
//               });
//           };
//           const get_res = (obj: ResolverObject) => {
//             const res_obj = pick(obj, 'data', 'error');
//             return (env: ResEnv) =>
//               cloneDeepWith(res_obj, (v) => {
//                 if (typeof v === 'string') {
//                   if (v.startsWith('js:')) {
//                     return (0, eval)('({root, args, ctx}) => ' + v.slice(3))(
//                       env,
//                     );
//                   }
//                   return ejs.render(v, env);
//                 }
//               });
//           };
//           // fetch()
//           const merged_obj = merge({}, preset_obj, resolver_obj);
//           // 好像可以 middlewares, 构建一个自己的 ctx 对象即可, 再用上 koa-compose...  object_resolver 等同于一个 fn_resolver...
//           // 可以有 { uses: ['a', 'b'], fn: async (ctx: {args,koa_ctx, got_req}, next) => ctx.got_res = xxx } fn 在 ab 之前
//           // 直接用 node-fetch@next 好了
//           return async (root: any, args: any, ctx: Koa.Context, info: any) => {
//             const req_env = { root, args, ctx };
//             const req = get_req(merged_obj)(req_env);
//             req.headers = merge({}, ctx.request.headers, req.headers);
//             Object.keys(req.headers)
//               .filter((it) => it.toLowerCase() === 'content-type')
//               .forEach((ctkey) => delete req.headers[ctkey]);
//             const res = await got(req);
//             ctx.response.set(res.headers as any);
//             const res_env = {
//               res,
//               text: res.body,
//               json: safeJsonParse(res.body),
//             };
//             const { data, error } = get_res(merged_obj)(res_env);
//             if (error) {
//               throw new Error(error);
//             }
//             return data;
//           };
//         }
//         return resolver;
//       }
//     }),
//   });
// }

function getTypeDefs(typeDefs: string) {
  try {
    accessSync(typeDefs, constants.R_OK);
    return readFileSync(typeDefs, "utf8");
  } catch (error) {
    return typeDefs;
  }
}
function safeJsonParse(str: string) {
  try {
    return JSON.parse(str);
  } catch (error) {
    return;
  }
}
