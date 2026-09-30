// 跳转设置自检:断言注入到前台的 AUTO_REDIRECT / REDIRECT_DELAY,
// 以及"配置不可用时不得自动跳转"这条安全约束。
// 运行:node preview/redirect-check.mjs
import assert from "node:assert/strict";
import worker from "../worker.mjs";

const BASE = "http://dispatch.local";

function makeEnv(seed, { broken = false } = {}) {
  const store = new Map();
  if (seed !== undefined) {
    store.set("dispatch_config", broken ? seed : JSON.stringify(seed));
  }
  return {
    env: {
      ADMIN_PASSWORD: "pw123",
      CONFIG: {
        get: async (k) => store.get(k) ?? null,
        put: async (k, v) => { store.set(k, v); }
      }
    }
  };
}
const errEnv = () => ({
  ADMIN_PASSWORD: "pw123",
  CONFIG: {
    get: async () => { throw new Error("KV unavailable"); },
    put: async () => { throw new Error("KV unavailable"); }
  }
});

function post(path, body, cookie) {
  return new Request(BASE + path, {
    method: "POST",
    headers: Object.assign({ origin: BASE, "content-type": "application/json" }, cookie ? { cookie } : {}),
    body: JSON.stringify(body)
  });
}
const page = async (env) => (await worker.fetch(new Request(BASE + "/"), env)).text();
const flag = (html) => (/var AUTO_REDIRECT = (true|false);/.exec(html) || [])[1];
const delay = (html) => (/var REDIRECT_DELAY = (\d+);/.exec(html) || [])[1];

let passed = 0;
function ok(label, cond) {
  assert.ok(cond, label);
  passed++;
  console.log("  \u2713 " + label);
}

const SEED = { lines: [{ url: "https://example.com", name: "主线路" }], announcement: "" };

console.log("可正常读取的配置");
{
  const { env } = makeEnv(SEED);
  const login = await worker.fetch(post("/admin/api/login", { password: "pw123" }), env);
  const cookie = login.headers.get("set-cookie").split(";")[0];

  await worker.fetch(post("/admin/api/config", { autoRedirect: false, redirectDelay: 3 }, cookie), env);
  let html = await page(env);
  ok("关闭自动跳转 -> AUTO_REDIRECT = false", flag(html) === "false");
  ok("延迟 3 秒 -> REDIRECT_DELAY = 3000", delay(html) === "3000");

  await worker.fetch(post("/admin/api/config", { autoRedirect: true, redirectDelay: 1.6 }, cookie), env);
  html = await page(env);
  ok("开启自动跳转 -> AUTO_REDIRECT = true", flag(html) === "true");
  ok("延迟 1.6 秒 -> REDIRECT_DELAY = 1600", delay(html) === "1600");
}

console.log("未绑定 KV(部署后尚未配置)");
{
  const html = await page({ ADMIN_PASSWORD: "pw123" });
  ok("绝不自动跳转到占位线路", flag(html) === "false");
  ok("展示占位示例线路并给出提示", html.includes("example.com") && html.includes("尚未配置线路"));
}

console.log("配置不可用(损坏 / 读失败)");
{
  const corrupt = await page(makeEnv("{not json", { broken: true }).env);
  ok("JSON 损坏 -> 停止自动跳转", flag(corrupt) === "false");
  ok("JSON 损坏 -> 不再把占位线路当真实线路", !corrupt.includes("example.com"));
  ok("JSON 损坏 -> 展示故障提示", corrupt.includes("配置暂时不可用"));

  const broken = await page(errEnv());
  ok("KV 读失败 -> 停止自动跳转", flag(broken) === "false");
  ok("KV 读失败 -> 展示故障提示", broken.includes("配置暂时不可用"));
}

console.log("?f= 透传");
{
  const { env } = makeEnv(SEED);
  const html = await page(env);
  ok("页面内注入 tg 变量", /var tg = "";/.test(html));
  const withF = await (await worker.fetch(new Request(BASE + "/?f=abc"), env)).text();
  ok("f 参数被编码后透传", withF.includes('var tg = "?f=abc";'));
  const long = await (await worker.fetch(new Request(BASE + "/?f=" + "A".repeat(500)), env)).text();
  ok("超长 f 被截断到 32 字符", long.includes('var tg = "?f=' + "A".repeat(32) + '";'));
}

console.log("\nredirect-check: " + passed + " 项断言全部通过");
