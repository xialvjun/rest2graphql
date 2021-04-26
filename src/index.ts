import Koa from 'koa';
import got from 'got';
import { cosmiconfigSync } from 'cosmiconfig';
import _ from 'lodash-es';

const app = new Koa();

app.use(async (ctx,next) => {
  if (ctx.path === '/graphql') {
    
  }
});

// got({
//   searchParams: {},
//   method: 'get',
// })

const server_config = {
  routes: [
    {
      path: '/graphql',
      type: 'graphql',
      typeDefs: `schema.gql`,
      resolvers: {
        presets: {
          // preset 必定是函数, 所以它可以是 字符串(eval 为函数), 字符串数组(里面的字符串是名字), 如果在 js 文件中, 可以直接就是函数
          // default: `async (opts, got) => {}`,
          // 不对, preset 不是函数, preset 其实是适应于 {origin:ejs,path:ejs,method:ejs,body:ejs,json:ejs,form:ejs,headers:ejs,data:ejs,error:ejs} 这样的一种 merge
          // 然后 单个 query/mutation 可以设置 extends 某个 preset... 在 extends 结束后,用 zod 检验是否齐全
          // 没有 extends 就默认 default(如果未来多 server, 多 path, 分 query/mutation/subscription 之类的, 就最近的 default).
          // 这是 整个系统的 default
          default: { method: 'get', path: '/' },
          // 因为 [1] 处可能有复杂逻辑, 例如不传 headers 给服务器, 不传 headers 给客户端, 选择传 headers, 转换响应 等, 所以还是需要函数.
          // 则 函数 preset 与 对象 merge preset 不兼容, 至少对象 preset 不能放在后面, 因为暂时找不到那种 ctx 的表达结构, 用 完全体的 request 对象来表达又似乎太复杂了
          // ? 也许可以用完全体的 req res 对象... 这样的话, 就叫  middlewares 吧...
          // 暂时先不实现 middlewares 的功能, 就把普通的 ejs 表达实现出来
        },
        Query: {
          a_user_by_id: {
            // method: 'get',
            prefixUrl: '',
            url: '/a_user_by_id/<%=args.id%>',
            // 这里有个麻烦的地方是 ejs 是渲染得到字符串, 所以 url 部分很合适它.
            // 但假如我们需要的是 js 值的话, 就不能用 ejs... 然后用 eval, 但 eval 字符串如何区分于固定死的字符串...
            // 先不想转义的事情, 就定义为 `js:args.id` 好了 ...则, 遇到字符串, 先看是否 js: 开头, 不是就直接 ejs
            searchParams: { id: 'js: args.id' },
            headers: {}, // [1]
            body: '<%=JSON.stringify(args)%>',
            form: 'js: args',
            json: 'js: args',

            data: 'js: json.data',
            error: 'js: json.success ? null : json.message',
          },
        },
      },
    },
  ],
};

export {};
import ts_loader from '@endemolshinegroup/cosmiconfig-typescript-loader';
const explorer = cosmiconfigSync('rest-graphql', {
  loaders: {
    '.ts': ts_loader,
  },
});
const config_result = process.argv[2]
  ? explorer.load(process.argv[2])
  : explorer.search();

import * as z from 'zod';
got({
  searchParams: '',
  headers: {},
  body: '',
  form: {},
});


const z_function_string = z.string().refine(v => v.startsWith('js:'), 'should be a js:function string');
const z_selector_string = z.string().refine(v => v.startsWith('js:'), 'should be a js:selector string');

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
const z_resolver = z.union([z_resolver_object, z.function(), z_function_string]);
const z_resolver_preset = z.union([
  z_resolver_object.partial().omit({preset: true}),
  z
    .string()
    .refine((v) => v.startsWith('js:'), 'should be a js:function string'), // js function
  z.array(z.string()),
  z.function(),
]);
type Preset = z.infer<typeof z_resolver_preset>;
const z_graphql_config = z.object({
  typeDefs: z.string(), // it's either a gql file path or the gql content
  presets: z.record(z_resolver_preset),
  resolvers: z.record(z.record(z_resolver)),
});
import { cloneDeepWith } from 'lodash-es';
const cloneWithData = (json: any, data: any) => cloneDeepWith(json, v => {
  if (typeof v === 'string') {
    // const env = {args,req:ctx.req,root,ctx};
    // v.startsWith('js:') ? (0,eval)('({args,req,root,ctx}) => '+v.slice(3))(env) : ejs(v)(env)
    return v.startsWith('js:') ? (0,eval)('({args,req,root,ctx}) => '+v.slice(3)) : ejs(v)
  }
})
const cc = _.cloneDeepWith(opts, v => {
  if (typeof v === 'function') {
    return v({args,req:ctx.req,root,ctx}) || v({json:res.json,res})
  }
})

// # 假如我想让它支持 x_cookie, 又能有其他简易设置, 例如设置 prefixUrl, 或者默认加个 searchParams={r2g:'this_r2g'}, 那就必须要有 pipe 了
// ! 一个 graphql 请求进来, 它先生成一个 got options {headers:{...req.headers}} 对象, 这个对象与 resolver object api 合并, 到 preset 上, ... 
// 算了, 把 preset 与 plugin 区分开... preset 也许只有 object api... 但 preset 无需 pipe... 而 plugin 则 pipe...plugin 面向的是
const a = {
  typeDefs: '',
  presets: {
    normal: async(empty_option, req, next) => {  res = next(full_option(empty_option, req));  }, 
    // 不对, 这与 preset 是 object, resolver 是 object 时的 data selector 语义不同. 它应该是 resolver 的 data selector 覆盖 preset 的...
    // 而且, full_option 是否会改变 url 呢...当然 graphql 没有 url... preset 的目的只有 req.header 的预处理或后处理(后处理,知道根据是 form/json 来替换 header), 以及 
    // res 的处理... 首先 resolver 响应的肯定是 json, 只能在 res.header 上做文章, 可以去掉响应的 header 或者替换... 其实逻辑不多,所以无需 pipe, 
    default: () => {},
  },
  resolvers: {
    Query: {
      a_user_by_id: {
        // method: 'get',
        prefixUrl: '',
        url: '/a_user_by_id/<%=args.id%>',
        // 这里有个麻烦的地方是 ejs 是渲染得到字符串, 所以 url 部分很合适它.
        // 但假如我们需要的是 js 值的话, 就不能用 ejs... 然后用 eval, 但 eval 字符串如何区分于固定死的字符串...
        // 先不想转义的事情, 就定义为 `js:args.id` 好了 ...则, 遇到字符串, 先看是否 js: 开头, 不是就直接 ejs
        // searchParams: { id: 'js: args.id' },
        headers: {authorization:'js:args.token'}, // [1] 算了, object api 就不放 header 了, 就只有 url, form/json, data, error 
        // body: '<%=JSON.stringify(args)%>',
        // form: 'js: args',
        // json: 'js: args',

        // data: 'js: json.data',
        // error: 'js: json.success ? null : json.message',
      },
    }
  }
}

// ! 可以先不管 plugins, 不管 headers, 让 headers 进出都完全复制, 除了 Content-Type, preset 只有 object
function abc(root: any, args: any, ctx: Koa.Context) {
  const req = ctx.request;
  // ctx.req
  const headers = {...ctx.headers};
  const plugins = [function() {}, function() {}, function() {}];
  const preset = {} || function() {};
  const resolver = {} || function() {};

  if (typeof resolver === 'string') {
    resolver = (0, eval)(resolver.slice(3));
  }
  if (typeof resolver === 'function') {
    
  }
  if (typeof resolver === 'object') {
    // const opts = {...preset, ...resolver};
    const {data, error, ...req_opts } = {...preset, ...resolver} as {data:any,error:any};
    const res_opts = {data, error};
    const options = cloneDeepWith(req_opts, v => {
      if (typeof v === 'string') {
        if (v.startsWith('js:')) {
          return (0, eval)(`({args,req,root,ctx})=>`+v.slice(3))
        }
      }
    });
    // got()

  }
  return 
}

import compose from 'koa-compose';
import { ApolloServer } from 'apollo-server-koa';
// 伪代码
function make_middleware(config: any) {
  var server = new ApolloServer({
    typeDefs: config.typeDefs,
    resolvers: _.cloneWith(config.resolvers, ObjectType => {
      return _.cloneWith(ObjectType, field_resolver => {
        if (typeof field_resolver === 'string') {
          field_resolver = (0, eval)(field_resolver.slice(3));
        }
        if (typeof field_resolver === 'function') {
          return field_resolver;
        }
        // compose([(ctx,next) => ])
        // now field_resolver is object-api
        return async (root, args, ctx, info) => {
          // for (const plugin of config.plugins) {
          //   await plugin(ctx)
          // }
          // 
          const req_opts = _.omit(field_resolver, 'data','error');
          plugin1_in(ctx, req_opts);
          plugin2_in(ctx, req_opts);
          req_opts.headers = {..._.omit(ctx.headers, 'Content-Type'), ...req_opts.headers}
          const got_res = await got(req_opts);
          const res_opts = _.pick(field_resolver, 'data','error');
          ctx.res.headers = got_res.headers;
          // ctx.res.headers['Content-Type'] = 'application/json';
          plugin2_out(ctx, req_opts, got_res);
          plugin1_out(ctx, req_opts, got_res);
        }
      });
    })
  })

  server.getMiddleware()
}
