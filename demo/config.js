/** @type {import('../src/index').Config} */
module.exports = {
  port: 3000,
  serve: {
    root: 'demo',
    index: 'index.html',
  },
  proxy: [["/api", { target: "http://127.0.0.1:4000", pathRewrite: { '^/api': '' } }]],
  axios: {
    // logger: {},
    interceptors: {
      cookie: (axios, ctx) => {
        axios.interceptors.request.use(config => {
          if (ctx.req.headers.cookie) {
            config.headers = { ...config.headers, cookie: ctx.req.headers.cookie };
          }
          return config;
        });
        axios.interceptors.response.use(res => {
          if (res.headers["set-cookie"]) {
            ctx.set({ "set-cookie": res.headers["set-cookie"] });
          }
          return res;
        });
      },
    },
  },
  graphql: {
    typeDefs: `
    type User {
      id: ID!
      name: String!
      age: Int!
    }
    type Query {
      user(id: ID!): User!
    }
    `,
    axiosPresets: {
      default: {
        baseURL: "http://127.0.0.1:3000/api",
        interceptors: ["cookie"],
      },
    },
    // `apollo-server-koa` `ApolloServer.applyMiddleware` options
    serverRegistration: {
      path: '/graphql',
      cors: true,
    },
    resolvers: {
      Query: {
        user: {
          url: "/get_user_by_id",
          method: 'post',
          params: { id: "js:args.id", a: 'abc<%= args.id %>defg' },
          data: { id: "js:args.id", a: 'abc<%= args.id %>defg' },
        },
      },
    },
  },
};
