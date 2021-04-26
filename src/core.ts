import * as z from 'zod';
import got, { Response as GotResponse } from 'got';
import Koa from 'koa';
import { cloneDeepWith, merge, omit, pick } from 'lodash-es';
import { ApolloServer, gql, Config as ApolloServerConfig } from 'apollo-server-koa';
import * as fs from 'fs';
import ejs from 'ejs';
import axios from 'axios';

// import fetch from 'node-fetch';
// axios('', {
//   data: {}
// }).then(res => {
//   // res.data
//   res.headers
// })
//  silentJSONParsing
//  npm i axios-logger
// roarr

const z_function_string = z
  .string()
  .refine((v) => v.startsWith('js:'), 'should be a js:function string');
const z_selector_string = z
  .string()
  .refine((v) => v.startsWith('js:'), 'should be a js:selector string');

const z_resolver_object = z.object({
  preset: z.string().optional(),
  method: z.enum(['get', 'post', 'put', 'patch', 'head', 'delete']).optional(),
  prefixUrl: z.string().optional(),
  url: z.string(),
  headers: z.record(z.union([z.string(), z.array(z.string())])).optional(),
  body: z.string().optional(),
  form: z.any().optional(),
  json: z.any().optional(),
  data: z_selector_string,
  error: z_selector_string,
});
const z_resolver = z.union([
  z_resolver_object,
  z.function(),
  z_function_string,
]);
const z_graphql_config = z.object({
  typeDefs: z.string(), // it's either a gql file path or the gql content
  presets: z
    .record(z_resolver_object.partial().omit({ preset: true }))
    .optional(),
  resolvers: z.record(z.record(z_resolver)),
});

// new ApolloServer()

type GraphqlConfig = z.infer<typeof z_graphql_config>;
type ResolverObject = z.infer<typeof z_resolver_object>;
type ReqEnv = { root: any; args: any; ctx: Koa.Context };
type ResEnv = { res: GotResponse; text: string; json: any };

// type A = Omit<ApolloServerConfig, 'typeDefs'>

export function make_middleware(config: GraphqlConfig): ApolloServer {
  return new ApolloServer({
    typeDefs: getTypeDefs(config.typeDefs),
    resolvers: cloneDeepWith(config.resolvers, (v, key, obj, stack) => {
      if (stack.size === 1) {
        // const ObjectType = v;
        return;
      }
      if (stack.size === 2) {
        const resolver = v;
        if (typeof resolver === 'object') {
          const resolver_obj: ResolverObject = resolver;
          const preset_obj = config.presets?.[resolver_obj.preset || 'default'];
          const get_req = (obj: ResolverObject) => {
            const req_obj = omit(obj, 'data', 'error');
            return (env: ReqEnv) =>
              cloneDeepWith(req_obj, (v) => {
                if (typeof v === 'string') {
                  if (v.startsWith('js:')) {
                    return (0, eval)('({root, args, ctx}) => ' + v.slice(3))(
                      env,
                    );
                  }
                  return ejs.render(v, env);
                }
              });
          };
          const get_res = (obj: ResolverObject) => {
            const res_obj = pick(obj, 'data', 'error');
            return (env: ResEnv) =>
              cloneDeepWith(res_obj, (v) => {
                if (typeof v === 'string') {
                  if (v.startsWith('js:')) {
                    return (0, eval)('({root, args, ctx}) => ' + v.slice(3))(
                      env,
                    );
                  }
                  return ejs.render(v, env);
                }
              });
          };
          // fetch()
          const merged_obj = merge({}, preset_obj, resolver_obj);
          // 好像可以 middlewares, 构建一个自己的 ctx 对象即可, 再用上 koa-compose...  object_resolver 等同于一个 fn_resolver...
          // 可以有 { uses: ['a', 'b'], fn: async (ctx: {args,koa_ctx, got_req}, next) => ctx.got_res = xxx } fn 在 ab 之前
          // 直接用 node-fetch@next 好了
          return async (root: any, args: any, ctx: Koa.Context, info: any) => {
            const req_env = { root, args, ctx };
            const req = get_req(merged_obj)(req_env);
            req.headers = merge({}, ctx.request.headers, req.headers);
            Object.keys(req.headers)
              .filter((it) => it.toLowerCase() === 'content-type')
              .forEach((ctkey) => delete req.headers[ctkey]);
            const res = await got(req);
            ctx.response.set(res.headers as any);
            const res_env = {
              res,
              text: res.body,
              json: safeJsonParse(res.body),
            };
            const { data, error } = get_res(merged_obj)(res_env);
            if (error) {
              throw new Error(error);
            }
            return data;
          };
        }
        return resolver;
      }
    }),
  });
}

function getTypeDefs(typeDefs: string) {
  try {
    fs.accessSync(typeDefs, fs.constants.R_OK);
    return fs.readFileSync(typeDefs, 'utf8');
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
