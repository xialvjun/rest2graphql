# rest2graphql

A cli tool to transform *RESTful API* to *GraphQL* with one js config file.

## Installing

Global install:
```
npm i -g rest2graphql
```

Local install:
```
npm i -D rest2graphql
```

## Usage

### Step 1

Write your *RESTful API* server, or you already have got one.

### Step 2

Write the *GraphQL Schema* file, each rest api maps to one `Query/Mutation` field.
> Choosing between `Query/Mutation` isn't important, just semantic difference. Or maybe some idempotence difference on other community tools.

### Step 3

Write the config file, maps those field resolver to rest api queries sent by `axios`.
> Copy the config file in the example is smart. 😉

### Step 4

Run it: `rest2graphql config.js` or shorter `r2g config.js`.

## Example

```js
/** @type {import('../src/index').Config} */
// if you install `rest2graphql` locally, you can take advantage of its type with the first line
module.exports = {
  debug: true, // defaults to `process.env.NODE_ENV !== 'production'`, and maybe future logging operations
  port: 3000,
  // serve static files
  // it's `koa-send` options plus `path`(defaults to '') and `historyApiFallback`(defaults to true if index is set)
  // or just a string act as root
  // and we can serve multiple directories with an array
  serve: {
    root: 'demo',
    index: 'index.html',
  },
  // `http-middleware-proxy` parameters array
  proxy: [
    [
      "/api", 
      {
        target: "http://127.0.0.1:4000",
        pathRewrite: { '^/api': '' }
      }
    ]
  ],
  axios: {
    // `axios-logger` global config: https://github.com/hg-pyun/axios-logger
    logger: {},
    // `config.axios.interceptors` is just:
    // `Record<string, (axios:AxiosInstance, ctx:Koa.Context) => any>`
    // you can do things to them and give it a name in the key.
    // see `config.graphql.axiosPresets[presetName].interceptors`
    interceptors: {
      // transmit cookie in both directions
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
  // `apollo-server-koa Config`, but you can not control the `context`
  graphql: {
    // schema content or scheme file name like 'schema.gql'
    // you can offer an array, so you can split the schema and resolvers to multiple file
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
    // axios presets used in `axios.create(preset)`
    // each preset has a name
    axiosPresets: {
      default: {
        baseURL: "http://127.0.0.1:3000/api",
        interceptors: ["cookie"], // use interceptors declared in `config.axios.interceptors`
      },
    },
    // `apollo-server-koa` `ApolloServer.applyMiddleware` options
    serverRegistration: {
      path: '/graphql',
      cors: true,
    },
    // you can split the resolvers to multiple files and require and spread them in this main config if the schema is too big
    resolvers: {
      Query: {
        // axios request config
        // all strings in this axios request config will be evaluated in js(startsWith 'js:') or rendered by ejs with `{source, args, ctx, info}`
        user: {
          // preset: "default", // defaults to 'default' or set to false to not use a preset
          url: "/get_user_by_id",
          method: 'post',
          params: { id: "js:args.id", a: 'abc<%= args.id %>defg' },
          data: { id: "js:args.id", a: 'abc<%= args.id %>defg' },
          // data selector from axios response
          // strings will be evaluated with `{res, data:res.data}`
          // you can do data select in preset or even interceptors
          res: { // defaults to this value
            data: "js:res.data.data",
            // if (error) throw error
            error: "js:res.data.error"
          }
        },
      },
    },
  },
};
```
