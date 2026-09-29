import worker from "../worker.mjs";

const store = new Map();
store.set(
  "dispatch_config",
  JSON.stringify({ lines: [{ url: "https://example.com", name: "主线路" }], announcement: "" })
);
const env = {
  ADMIN_PASSWORD: "x",
  CONFIG: {
    get: async (k) => store.get(k) ?? null,
    put: async (k, v) => { store.set(k, v); }
  }
};
const login = await worker.fetch(
  new Request("http://x/admin/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "x" })
  }),
  env
);
const cookie = login.headers.get("set-cookie").split(";")[0];

const cfgBody = { lines: [{ url: "https://example.com", name: "主线路" }] };
await worker.fetch(
  new Request("http://x/admin/api/config", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ ...cfgBody, autoRedirect: false, redirectDelay: 3 })
  }),
  env
);
const off = await (await worker.fetch(new Request("http://x/"), env)).text();
console.log(
  "off_page:",
  /AUTO_REDIRECT = false/.test(off),
  /REDIRECT_DELAY = 3000/.test(off),
  off.includes("请点击下方按钮进入")
);

await worker.fetch(
  new Request("http://x/admin/api/config", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ ...cfgBody, autoRedirect: true, redirectDelay: 1.6 })
  }),
  env
);
const on = await (await worker.fetch(new Request("http://x/"), env)).text();
console.log(
  "on_page:",
  /AUTO_REDIRECT = true/.test(on),
  /REDIRECT_DELAY = 1600/.test(on),
  on.includes("即将自动进入")
);
process.exit(0);
