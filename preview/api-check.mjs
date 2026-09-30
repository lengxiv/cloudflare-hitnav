// 后台接口自检:全部为断言,失败即以非 0 退出(可直接挂 CI)
// 运行:node preview/api-check.mjs
import assert from "node:assert/strict";
import worker from "../worker.mjs";

const BASE = "http://dispatch.local";

function makeEnv(seed) {
  const store = new Map();
  if (seed !== undefined) store.set("dispatch_config", JSON.stringify(seed));
  return {
    store,
    env: {
      ADMIN_PASSWORD: "pw123",
      CONFIG: {
        get: async (k) => store.get(k) ?? null,
        put: async (k, v) => { store.set(k, v); }
      }
    },
    read: () => JSON.parse(store.get("dispatch_config") || "null")
  };
}

// 后台接口现在要求同源 + application/json
function post(path, body, opts = {}) {
  const headers = Object.assign(
    { origin: BASE, "content-type": "application/json" },
    opts.cookie ? { cookie: opts.cookie } : {},
    opts.headers || {}
  );
  return new Request(BASE + path, {
    method: "POST",
    headers,
    body: opts.raw !== undefined ? opts.raw : JSON.stringify(body)
  });
}

const FULL = {
  lines: [{ url: "https://a.com", name: "主线" }, { url: "https://b.com", name: "" }],
  announcement: "重要公告",
  siteName: "我的站",
  siteDesc: "我的描述",
  enterText: "进入",
  autoRedirect: false,
  redirectDelay: 5
};

let passed = 0;
function ok(label, cond) {
  assert.ok(cond, label);
  passed++;
  console.log("  \u2713 " + label);
}
async function login(env) {
  const res = await worker.fetch(post("/admin/api/login", { password: "pw123" }), env);
  assert.equal(res.status, 200, "登录应成功");
  return res.headers.get("set-cookie").split(";")[0];
}

console.log("登录与来源校验");
{
  const { env } = makeEnv(FULL);
  ok("错误密码 -> 401", (await worker.fetch(post("/admin/api/login", { password: "wrong" }), env)).status === 401);
  ok("非 JSON 请求体 -> 415",
    (await worker.fetch(post("/admin/api/login", null, { headers: { "content-type": "text/plain" }, raw: "{}" }), env)).status === 415);
  ok("跨站来源 -> 403",
    (await worker.fetch(post("/admin/api/login", { password: "pw123" }, { headers: { origin: "https://evil.example" } }), env)).status === 403);
  ok("缺少 Origin 的裸调用 -> 403",
    (await worker.fetch(new Request(BASE + "/admin/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), env)).status === 403);

  const res = await worker.fetch(post("/admin/api/login", { password: "pw123" }), env);
  const sc = res.headers.get("set-cookie") || "";
  ok("正确密码 -> 200", res.status === 200);
  ok("Cookie 带 HttpOnly/Secure/SameSite=Strict",
    /HttpOnly/i.test(sc) && /;\s*Secure/i.test(sc) && /SameSite=Strict/i.test(sc));
  ok("未绑定 KV 的登录 -> 503",
    (await worker.fetch(post("/admin/api/login", { password: "pw123" }), { ADMIN_PASSWORD: "pw123" })).status === 503);
}

console.log("配置保存:畸形与部分请求体不得清空数据");
{
  const bad = ["", "{not json", "null", "[]", '{"lines":"https://a.com"}', '{"lines":{"0":"x"}}', '"str"'];
  for (const raw of bad) {
    const { env, read } = makeEnv(FULL);
    const cookie = await login(env);
    const res = await worker.fetch(post("/admin/api/config", null, { cookie, raw }), env);
    ok(`拒绝畸形请求体 ${JSON.stringify(raw.slice(0, 18))} -> 400`, res.status === 400);
    assert.deepEqual(read(), FULL, "畸形请求体不得改动存储");
    passed++;
  }
}
{
  const { env, read } = makeEnv(FULL);
  const cookie = await login(env);
  const res = await worker.fetch(post("/admin/api/config", { announcement: "只有公告" }, { cookie }), env);
  ok("只提交 announcement -> 200", res.status === 200);
  const after = read();
  ok("未提交的字段保持原值(不再被重置为默认)",
    after.siteName === "我的站" && after.autoRedirect === false && after.redirectDelay === 5 && after.lines.length === 2);
  ok("提交的字段被更新", after.announcement === "只有公告");

  const env2 = makeEnv(FULL);
  const cookie2 = await login(env2.env);
  ok("lines 类型错误 -> 400",
    (await worker.fetch(post("/admin/api/config", { lines: "x" }, { cookie: cookie2 }), env2.env)).status === 400);
  ok("autoRedirect 类型错误 -> 400",
    (await worker.fetch(post("/admin/api/config", { autoRedirect: "true" }, { cookie: cookie2 }), env2.env)).status === 400);
  ok("redirectDelay=null -> 400",
    (await worker.fetch(post("/admin/api/config", { redirectDelay: null }, { cookie: cookie2 }), env2.env)).status === 400);
}

console.log("鉴权与登出来源校验");
{
  const { env } = makeEnv(FULL);
  ok("未登录保存 -> 401",
    (await worker.fetch(post("/admin/api/config", { announcement: "x" }), env)).status === 401);

  ok("跨站 logout -> 403",
    (await worker.fetch(post("/admin/api/logout", {}, { headers: { origin: "https://evil.example" } }), env)).status === 403);
  const out = await worker.fetch(post("/admin/api/logout", {}), env);
  ok("同源 logout -> 200 且清 Cookie",
    out.status === 200 && /admin_token=;/.test(out.headers.get("set-cookie") || ""));
}

console.log("会话令牌");
{
  const { env } = makeEnv(FULL);
  const cookie = await login(env);
  const [sig, exp] = cookie.split("=")[1].split(".");
  const variants = {
    "规范写法": `${sig}.${exp}`,
    "e0 后缀": `${sig}.${exp}e0`,
    "前导零": `${sig}.0${exp}`,
    "加号": `${sig}.+${exp}`,
    "空格填充": `${sig}. ${exp} `,
    "十六进制": `${sig}.0x${Number(exp).toString(16)}`,
    "过期时间被改": `${sig}.${Number(exp) + 1000}`,
    "Infinity": `${sig}.Infinity`,
    "大写签名": `${sig.toUpperCase()}.${exp}`
  };
  const admin = async (tok) => (await worker.fetch(new Request(BASE + "/admin", { headers: { cookie: "admin_token=" + tok } }), env)).text();
  ok("规范令牌可用", (await admin(variants["规范写法"])).includes('id="logoutBtn"'));
  for (const label of ["e0 后缀", "前导零", "加号", "空格填充", "十六进制"]) {
    ok(`非规范写法被拒:${label}`, !(await admin(variants[label])).includes('id="logoutBtn"'));
  }
  for (const label of ["过期时间被改", "Infinity", "大写签名"]) {
    ok(`无效令牌被拒:${label}`, !(await admin(variants[label])).includes('id="logoutBtn"'));
  }
}

console.log("sanitizeConfig");
{
  const { env, read } = makeEnv(FULL);
  const cookie = await login(env);
  const cfg = (await (await worker.fetch(post("/admin/api/config", {
    lines: ["https://a.com", "a.com", "https://a.com/", "ftp://x.com", "https://ok.io/path?q=1", "javascript:alert(1)"],
    announcement: "x".repeat(2100),
    redirectDelay: 999
  }, { cookie }), env)).json()).config;
  ok("去重 + 去路径 + 拒绝非 http(s)",
    cfg.lines.length === 2 && cfg.lines[0].url === "https://a.com" && cfg.lines[1].url === "https://ok.io");
  ok("公告按 2000 截断", cfg.announcement.length === 2000);
  ok("延迟钳制到 60", cfg.redirectDelay === 60);

  await worker.fetch(post("/admin/api/config", { announcement: "   \n  " }, { cookie }), env);
  ok("纯空白公告被 trim 成空(不再渲染空横幅)", read().announcement === "");

  await worker.fetch(post("/admin/api/config", { lines: ["https://" + "a".repeat(300) + ".com", "https://ok.io"] }, { cookie }), env);
  ok("超长 URL 被拒", read().lines.length === 1 && read().lines[0].url === "https://ok.io");
}

console.log("按码点截断(不劈开 emoji)");
{
  const { env, read } = makeEnv(FULL);
  const cookie = await login(env);
  const emoji = "\u{1F600}";
  await worker.fetch(post("/admin/api/config", {
    lines: [{ url: "https://a.com", name: "a".repeat(19) + emoji }],
    siteName: "b".repeat(39) + emoji
  }, { cookie }), env);
  const cfg = read();
  const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  ok("线路名按码点保留完整 emoji", cfg.lines[0].name === "a".repeat(19) + emoji);
  ok("站点名按码点保留完整 emoji", cfg.siteName === "b".repeat(39) + emoji);
  ok("落库内容不含孤立代理项", !lone.test(cfg.lines[0].name) && !lone.test(cfg.siteName));
}

console.log("路由与响应头");
{
  const { env } = makeEnv(FULL);
  ok("未知路径 -> 404", (await worker.fetch(new Request(BASE + "/whatever/deep"), env)).status === 404);
  ok("/robots.txt -> 200 text/plain",
    await (async () => {
      const r = await worker.fetch(new Request(BASE + "/robots.txt"), env);
      return r.status === 200 && (r.headers.get("content-type") || "").includes("text/plain");
    })());
  ok("/favicon.ico -> 204", (await worker.fetch(new Request(BASE + "/favicon.ico"), env)).status === 204);
  ok("/admin/nope -> 404", (await worker.fetch(new Request(BASE + "/admin/nope"), env)).status === 404);
  ok("POST / -> 405", (await worker.fetch(new Request(BASE + "/", { method: "POST", headers: { origin: BASE } }), env)).status === 405);

  const home = await worker.fetch(new Request(BASE + "/"), env);
  ok("首页含 nosniff", home.headers.get("x-content-type-options") === "nosniff");
  ok("首页含点击劫持防护", /frame-ancestors 'none'/.test(home.headers.get("content-security-policy") || ""));
  ok("首页含 no-referrer", home.headers.get("referrer-policy") === "no-referrer");
  const adminPage = await worker.fetch(new Request(BASE + "/admin"), env);
  ok("后台页同样带头部", adminPage.headers.get("x-frame-options") === "DENY");
  const api = await worker.fetch(post("/admin/api/login", { password: "x" }, { headers: { origin: "https://evil.example" } }), env);
  ok("JSON 响应同样带头部", api.headers.get("x-content-type-options") === "nosniff");
}

console.log("\napi-check: " + passed + " 项断言全部通过");
