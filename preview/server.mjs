import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import worker from "../worker.mjs";

// 模拟 KV + 管理密码:让预览服务器完整模拟 Worker 行为
const store = new Map();
store.set(
  "dispatch_config",
  JSON.stringify({
    lines: [
      { url: "https://example.com", name: "主线路" },
      { url: "https://example.org", name: "" },
      { url: "https://example.net", name: "" }
    ],
    siteName: "",
    siteDesc: "",
    enterText: "",
    announcement:
      "示例公告:页面会自动测速并跳转至最快线路;如全部超时,可点击「重新检测」或稍后再试。"
  })
);
const env = {
  ADMIN_PASSWORD: "test1234",
  CONFIG: {
    get: async (k) => store.get(k) ?? null,
    put: async (k, v) => { store.set(k, v); }
  }
};

// ?mock:注入 stub fetch(550ms 响应)并拦下 1600ms 自动跳转,便于确定性演示
const mockScript = `<script>
window.fetch = function () {
  return new Promise(function (resolve) {
    setTimeout(function () { resolve(new Response("", { status: 200 })); }, 550);
  });
};
(function () {
  var orig = window.setTimeout;
  window.setTimeout = function (fn, ms) {
    if (ms === 1600) return 0;
    return orig(fn, ms);
  };
})();
</script>`;

const NO_BODY_METHODS = new Set(["GET", "HEAD"]);

createServer(async (req, res) => {
  // 必须沿用真实 Host:Worker 的同源校验会比较 Origin 与请求 URL 的 host,
  // 写死成 preview.local 会让浏览器发来的 Origin 校验失败,后台直接不可用。
  const host = req.headers.host || "preview.local";
  const u = new URL(req.url, "http://" + host);

  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v != null) headers.set(k, Array.isArray(v) ? v.join(",") : String(v));
    }
    const init = { method: req.method, headers };
    // GET/HEAD 带 body 会让 new Request 抛 TypeError;未捕获时会直接终止本进程
    if (body.length && !NO_BODY_METHODS.has(req.method)) init.body = body;

    const workerRes = await worker.fetch(new Request(u.href, init), env);
    let out = Buffer.from(await workerRes.arrayBuffer());

    // ?mock 只注入前台:注入到 /admin 会把后台的 fetch 换成桩,登录与保存全部失败
    if (u.searchParams.has("mock") && !u.pathname.startsWith("/admin")) {
      const text = out.toString("utf8");
      if (text.includes("<body>")) {
        out = Buffer.from(text.replace("<body>", "<body>" + mockScript), "utf8");
      }
    }

    const headersOut = {};
    workerRes.headers.forEach((v, k) => { headersOut[k] = v; });
    const cookies = workerRes.headers.getSetCookie ? workerRes.headers.getSetCookie() : [];
    if (cookies.length) {
      // 本地预览是 http,去掉 Secure 以便浏览器接受会话 Cookie
      headersOut["set-cookie"] = cookies.map((c) => c.replace(/;\s*Secure/i, ""));
    }

    res.writeHead(workerRes.status, headersOut);
    res.end(req.method === "HEAD" ? undefined : out);
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain;charset=UTF-8" });
    res.end("preview server error: " + ((err && err.message) || String(err)));
  }
}).listen(8791, "127.0.0.1", () => console.log("serving http://127.0.0.1:8791/"));
