const koa = require("koa");
const app = new koa();

app.use(async (ctx, next) => {
  console.log("href: ", ctx.href);
  console.log("cookie: ", ctx.cookies.get('test'));
  // console.log("body: ", ctx.request.body);
  await next();
  ctx.cookies.set("test", "test test");
});

app.use(async (ctx, next) => {
  if (ctx.path === "/get_user_by_id") {
    return (ctx.body = { data: { id: "1", name: "xialvjun", age: 30 }, error: "" });
  }
  return next();
});

app.listen(4000, () => {
  console.log("listen on 4000");
});
