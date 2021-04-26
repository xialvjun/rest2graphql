import got from 'got';

type Serve = string | {
  dist: string,
  path?: string,
  index?: string,
}

interface Config {
  serve?: Serve | Record<string, Serve>
  schema: string; // content or file path
  resolver: {
    query: {
      a_user_by_id: {
        path: '/a_user_by_id/<req.id>',
        data: '<res.data>',
        error: '<res.message>',
      },
      b_user_by_id: {},
      me: {
        data: 'res.data',
        error: 'res.message'
      },
    }
  }
}


// 有了这个之后，客户端可以使用 npm shell-interval 之类的工具，定时 graph-code-generator 避免后端通知不到位
// 使用 cosmiconfig + ts-plugin
export default {
  serve: 'dist',
  proxy: 'http-proxy-options', // 有些接口就是做代理用的，例如 redirect 之类的，就纯粹的 proxy 就好了。。。
  // 否则就通过 x_cookie 在 client js 层面发出请求，跳转 redirect。。。 
  // merge 层面，response header 默认透传，但也可以根据 res，设置全新的 header，即看有没有 header_full, 只是普通的 header 就 merge
  // 有 serve, 有 endpoint, 所以其实是 handlers ... 
  // 整个 config = [{path:'/',type:'serve',serve:'dist'},{path:'/graphql',type:'graphql',xxxx},{path:'/xxx',type:'proxy',proxy}]
  end_point: '/graphql',
  // 默认 request 的 header，response 的 header 是直接继承的，request 的 header 还能被 req merge，相当于一次 preset
  experimental_x_cookie: false,
  schema: `
  type User {
    id: String!
    name: String!
  }
  type Query {
    a_user_by_id(id: ID!): User!
    b_user_by_id(id: ID!): User!
    c_user_by_id(id: ID!): User!
    d_user_by_id(id: ID!): User!
    me: User!
  }
  `,
  presets: {
    a: '',
    query: [],
    mutation: '',
    default: '',
  },
  resolver: {
    host: '',
    query: {
      host: '',
      // 如果是对象，就 a_user_by_id: { extend: preset, req: got.options as ejs, res: {error:ejs,data:ejs} }
      // 如果是函数，就是正儿八经的 resolver，a_user_by_id(args, ctx, got) { return data or throw error }
      // 提供类似 http-proxy 一般的完整日志，方便调试
      // 现在有 preset，ejs，http-proxy like log 三者需要设计。。。
      // 因为支持 function，但想表示为配置文件形式，所以 function 需要能用 string 表示，ejs 模板正好可以定义 function
      // 还有 host
      a_user_by_id: {
        host: '',
        path: '/a_user_by_id/<req.id>',
        method: 'get',
        data: '<res.data>',
        error: '<res.message>',
      },
      b_user_by_id: {
        path: '/b_user_by_id?id=<req.id>',
        method: 'get',
        data: '<res.data>',
        error: '<res.message>',
      },
      c_user_by_id: {
        path: '/c_user_by_id',
        method: 'post',
        body: {"id":"<req.id>"},
        data: '<res.data>',
        error: '<res.success ? "" : res.message>',
      },
      o_user_by_id(args: any, json: any, req: any, res: any) {
        // got()
        got('/d_user_by_id', {
          json
        })
        return {
          path: '/d_user_by_id',
          method: 'post',
          body: {"id":args.id},
          data: json.data,
          error: json.message,
        }
      },
      me: {
        path: '/me',
        method: 'get',
        data: 'res.data',
        error: 'res.message'
      },
    }
  }
};

// export default {
//   serve: Serve | Record<>
// }
