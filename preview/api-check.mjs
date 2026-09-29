import worker from "../worker.mjs";

const store = new Map();
store.set(
  "dispatch_config",
  JSON.stringify({ lines: ["https://a.com", "https://b.com", "https://c.com"], announcement: "" })
);
const env = {
  ADMIN_PASSWORD: "pw123",
  CONFIG: {
    get: async (k) => store.get(k) ?? null,
    put: async (k, v) => { store.set(k, v); }
  }
};

const bad = await worker.fetch(
  new Request("http://x/admin/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "wrong" })
  }),
  env
);
console.log("wrong password:", bad.status, await bad.text());

const login = await worker.fetch(
  new Request("http://x/admin/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "pw123" })
  }),
  env
);
const cookie = login.headers.get("set-cookie").split(";")[0];

const noAuth = await worker.fetch(
  new Request("http://x/admin/api/config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lines: ["https://hack.com"], announcement: "x" })
  }),
  env
);
console.log("save without auth:", noAuth.status, await noAuth.text());

const reorder = await worker.fetch(
  new Request("http://x/admin/api/config", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      lines: [
        { url: "https://c.com", name: "备线" },
        { url: "https://a.com", name: "主线" },
        "https://b.com"
      ],
      announcement: "ok",
      autoRedirect: false,
      redirectDelay: 5
    })
  }),
  env
);
console.log("reorder + name:", reorder.status, JSON.stringify((await reorder.json()).config));

const dedupe = await worker.fetch(
  new Request("http://x/admin/api/config", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      lines: ["https://a.com", "a.com", "https://a.com/", "ftp://x.com", "https://ok.io/path?q=1"],
      announcement: ""
    })
  }),
  env
);
console.log("sanitize:", dedupe.status, JSON.stringify((await dedupe.json()).config));
