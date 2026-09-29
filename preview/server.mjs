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

createServer(async (req, res) => {
  const u = new URL(req.url, "http://preview.local");

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v != null) headers.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const init = { method: req.method, headers };
  if (body.length) init.body = body;

  const workerRes = await worker.fetch(new Request(u.href, init), env);
  let out = Buffer.from(await workerRes.arrayBuffer());

  // 公共页 + ?mock:注入演示脚本
  if (u.searchParams.has("mock")) {
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
  res.end(out);
}).listen(8791, "127.0.0.1", () => console.log("serving http://127.0.0.1:8791/"));
