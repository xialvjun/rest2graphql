const koa = require("koa");
const app = new koa();

app.use(async (ctx, next) => {
  console.log("header cookie: ", ctx.req.headers.cookie);
  console.log("url: ", ctx.url);
  console.log("body: ", ctx.request.body);
  await next();
  ctx.cookies.set("test", "123456789");
});

app.use(async (ctx, next) => {
  if (ctx.path === "/api/get_user_by_id") {
    // if schema id is ID type, then it will be change to a string
    return (ctx.body = { data: { id: 1, name: "xialvjun", age: 30 }, error: "" });
  }
  return next();
});

app.listen(3001, () => {
  console.log("listen on 3001");
});
