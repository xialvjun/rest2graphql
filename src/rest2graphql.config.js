
/** @type {import("./a").Config } */
module.exports = {
  debug: true,
  port: 2222,
  proxy: [
    ['/asfaf', {target: ''}]
  ],
  serve: [
    { root: 'web', path: '/abc' },
    'web',
  ],
  axios: {
    interceptor_store: {
      cookie_and_set_cookie: {
        req: (config) => {
          // todo: config 里需要有 koa_ctx
          config.headers.cookie = config.koa_ctx.req.headers.cookie;
        },
        res: (res) => {
          if (res.headers.set_cookie) {
            res.config.koa_ctx.headers.set_cookie = res.headers.set_cookie;
          }
        }
      }
    }
  },
  graphql: {
    // serverRegistration: {
    //   path: '/graphql',
    // },
    typeDefs: '',
    axios: {
      default: {
        baseURL: 'http://127.0.0.1:1080',
        interceptors: ['']
      }
    },
    resolvers: {
      Query: {
        get_user: {
          preset: 'default',
          url: '/get_me?id=<%= args.id %>',
          res: {
            data: 'js:res.data',
            error: 'js:res.message==="ok" ? "" : res.message',
          }
        }
      },
      Mutation: {

      }
    }
  }
}
