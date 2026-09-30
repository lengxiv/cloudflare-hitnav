import worker from "../worker.mjs";
import { writeFileSync } from "node:fs";

// 模拟 KV + 管理密码,用于本地渲染预览
const store = new Map();
store.set(
  "dispatch_config",
  JSON.stringify({
    lines: [
      { url: "https://example.com", name: "主线路" },
      { url: "https://example.org", name: "" },
      { url: "https://example.net", name: "" }
    ],
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
const base = "http://dispatch.local";

async function render(req) {
  const res = await worker.fetch(req, env);
  return res.text();
}

// 公共调度页
writeFileSync(
  new URL("./preview.html", import.meta.url),
  await render(new Request(base + "/"))
);

// 后台登录页(未带会话 Cookie)
writeFileSync(
  new URL("./preview-admin-login.html", import.meta.url),
  await render(new Request(base + "/admin"))
);

// 已登录后台:先调用登录接口拿会话 Cookie
const loginRes = await worker.fetch(
  new Request(base + "/admin/api/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ password: "test1234" })
  }),
  env
);
if (loginRes.status !== 200) {
  throw new Error("预览登录失败,状态码 " + loginRes.status);
}
const cookie = (loginRes.headers.get("set-cookie") || "").split(";")[0];
writeFileSync(
  new URL("./preview-admin.html", import.meta.url),
  await render(new Request(base + "/admin", { headers: { cookie } }))
);

console.log("previews written; login status:", loginRes.status);
