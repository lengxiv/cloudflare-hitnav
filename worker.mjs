// 智能线路调度 Worker(含 /admin 后台)
// 前台:按统一设计系统实现,tokens 全部语义化、暗色默认 + 亮色成对覆盖。
// 后台:密码登录(HMAC Cookie 会话),KV 存储线路与公告,前台自动生效。
//
// 部署前置:
//   1. 绑定 KV 命名空间,变量名 CONFIG(不绑定时前台用内置默认线路,后台不可用)
//   2. 添加变量 ADMIN_PASSWORD(建议用"机密"类型),作为后台登录密码

// ============ 可调常量 ============

const CONFIG_KEY = "dispatch_config";
const MAX_LINES = 20;
const MAX_NOTICE = 2000;
const MAX_LINE_NAME = 20;
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 登录会话 7 天
const COOKIE_NAME = "admin_token";
// 占位示例线路:部署后请在后台配置,或直接替换为你的线路
const DEFAULT_LINES = [
  "https://example.com",
  "https://example.org",
  "https://example.net"
];

// ============ 共享样式(设计系统) ============

const SHARED_CSS = `
/* ---------- 设计变量(亮色) ---------- */
:root {
  color-scheme: light;
  --bg: #ffffff;
  --bg-subtle: #f8f9fa;
  --card: rgba(255, 255, 255, 0.72);
  --border: rgba(0, 0, 0, 0.08);
  --text-1: #111111;
  --text-2: #6b7280;
  --text-3: #9ca3af;
  --accent: #111111;
  --accent-text: #ffffff;
  --success: #15803d;
  --danger: #dc2626;
  --warn: #b45309;
  --info: #1d4ed8;
  --success-bg: rgba(21, 128, 61, 0.08);
  --success-border: rgba(21, 128, 61, 0.28);
  --danger-bg: rgba(220, 38, 38, 0.06);
  --danger-border: rgba(220, 38, 38, 0.28);
  --warn-bg: rgba(180, 83, 9, 0.08);
  --warn-border: rgba(180, 83, 9, 0.28);
  --info-bg: rgba(29, 78, 216, 0.06);
  --info-border: rgba(29, 78, 216, 0.28);
  --hover: rgba(0, 0, 0, 0.05);
  --mask: rgba(0, 0, 0, 0.4);
  --skeleton: rgba(0, 0, 0, 0.06);
  --radius-sm: 10px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-full: 999px;
  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(0, 0, 0, 0.06);
  --blur: 12px;
  --dur-fast: 140ms;
  --dur-normal: 220ms;
  --dur-breathe: 1600ms;
  --stagger: 40ms;
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}

/* ---------- 设计变量(暗色) ---------- */
[data-theme="dark"] {
  color-scheme: dark;
  --bg: #0a0a0a;
  --bg-subtle: #111113;
  --card: rgba(255, 255, 255, 0.045);
  --border: rgba(255, 255, 255, 0.08);
  --text-1: #f5f5f5;
  --text-2: #a1a1aa;
  --text-3: #8a8a92;
  --accent: #f5f5f5;
  --accent-text: #0a0a0a;
  --success: #4ade80;
  --danger: #f87171;
  --warn: #fbbf24;
  --info: #60a5fa;
  --success-bg: rgba(74, 222, 128, 0.1);
  --success-border: rgba(74, 222, 128, 0.3);
  --danger-bg: rgba(248, 113, 113, 0.1);
  --danger-border: rgba(248, 113, 113, 0.3);
  --warn-bg: rgba(251, 191, 36, 0.1);
  --warn-border: rgba(251, 191, 36, 0.3);
  --info-bg: rgba(96, 165, 250, 0.1);
  --info-border: rgba(96, 165, 250, 0.3);
  --hover: rgba(255, 255, 255, 0.06);
  --mask: rgba(0, 0, 0, 0.55);
  --skeleton: rgba(255, 255, 255, 0.08);
  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.5), 0 8px 24px rgba(0, 0, 0, 0.45);
}

/* ---------- 基础样式 ---------- */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
body {
  min-height: 100vh;
  background: var(--bg);
  color: var(--text-1);
  font-family: var(--font);
  font-size: 15px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  transition: background-color var(--dur-normal) var(--ease), color var(--dur-normal) var(--ease);
}
button {
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
[hidden] { display: none !important; }
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* ---------- 页面骨架 ---------- */
.page {
  min-height: 100vh;
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 20px 96px;
}
.page-top { justify-content: flex-start; }

/* ---------- 卡片 ---------- */
.card {
  width: 100%;
  max-width: 460px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  backdrop-filter: blur(var(--blur));
  -webkit-backdrop-filter: blur(var(--blur));
  padding: 28px;
  animation: rise var(--dur-normal) var(--ease) both;
  transition: background-color var(--dur-normal) var(--ease), border-color var(--dur-normal) var(--ease);
}
.card-title { font-size: 20px; font-weight: 700; }
.card-subtitle { margin-top: 8px; font-size: 14px; color: var(--text-2); }
.section-title { font-size: 17px; font-weight: 600; }

/* ---------- 工具栏 ---------- */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 24px 0 12px;
}
.toolbar-meta { font-size: 13px; color: var(--text-3); }

/* ---------- 两行式列表行 ---------- */
.list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.row {
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  animation: rise var(--dur-normal) var(--ease) both;
  animation-delay: calc(var(--stagger) * var(--i, 0));
  transition: background-color var(--dur-normal) var(--ease), border-color var(--dur-normal) var(--ease);
}
.row-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.row-title { font-size: 15px; font-weight: 600; }
.row-right { display: flex; align-items: center; gap: 8px; }
.row-sub {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.row-meta {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.time {
  min-width: 48px;
  text-align: right;
  font-family: var(--mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
}
.time.is-timeout { color: var(--danger); }

/* ---------- 徽章 ---------- */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--badge-fg);
  background: var(--badge-bg);
  border: 1px solid var(--badge-border);
  border-radius: var(--radius-sm);
}
.badge::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: currentColor;
}
.badge-success { --badge-fg: var(--success); --badge-bg: var(--success-bg); --badge-border: var(--success-border); }
.badge-danger  { --badge-fg: var(--danger);  --badge-bg: var(--danger-bg);  --badge-border: var(--danger-border); }
.badge-warn    { --badge-fg: var(--warn);    --badge-bg: var(--warn-bg);    --badge-border: var(--warn-border); }
.badge-info    { --badge-fg: var(--info);    --badge-bg: var(--info-bg);    --badge-border: var(--info-border); }

/* ---------- 横幅 ---------- */
.banner {
  margin-top: 16px;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--banner-fg);
  background: var(--banner-bg);
  border: 1px solid var(--banner-border);
  border-left: 3px solid var(--banner-fg);
  border-radius: var(--radius-md);
  animation: rise var(--dur-normal) var(--ease) both;
}
.banner-success { --banner-fg: var(--success); --banner-bg: var(--success-bg); --banner-border: var(--success-border); }
.banner-danger  { --banner-fg: var(--danger);  --banner-bg: var(--danger-bg);  --banner-border: var(--danger-border); }
.banner-warn    { --banner-fg: var(--warn);    --banner-bg: var(--warn-bg);    --banner-border: var(--warn-border); }
.banner-info    { --banner-fg: var(--info);    --banner-bg: var(--info-bg);    --banner-border: var(--info-border); }
.line-height-2 { line-height: 2; }

/* ---------- 按钮 ---------- */
.btn-primary {
  display: block;
  width: 100%;
  padding: 14px 20px;
  font-size: 16px;
  font-weight: 600;
  color: var(--accent-text);
  background: var(--accent);
  border-radius: var(--radius-md);
  transition:
    opacity var(--dur-fast) var(--ease),
    transform var(--dur-fast) var(--ease),
    background-color var(--dur-normal) var(--ease),
    color var(--dur-normal) var(--ease);
  animation: rise var(--dur-normal) var(--ease) both;
}
.btn-primary:hover { opacity: 0.88; }
.btn-primary:active { transform: scale(0.98); }
.btn-primary[disabled] { opacity: 0.5; cursor: not-allowed; }

.btn-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-1);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition:
    background-color var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease),
    transform var(--dur-fast) var(--ease),
    opacity var(--dur-fast) var(--ease);
}
.btn-ghost:hover { background: var(--hover); }
.btn-ghost:active { transform: scale(0.98); }
.btn-ghost[disabled] { opacity: 0.5; cursor: not-allowed; }
.btn-ghost.is-confirm {
  color: var(--danger);
  background: var(--danger-bg);
  border-color: var(--danger-border);
}

.actions { margin-top: 24px; }
.card-actions { margin-top: 20px; }

/* ---------- 骨架屏 ---------- */
.skeleton {
  display: inline-block;
  background: var(--skeleton);
  border-radius: var(--radius-sm);
  animation: breathe var(--dur-breathe) var(--ease) infinite;
}
.skeleton-time { width: 48px; height: 13px; }

/* ---------- 表单字段 ---------- */
.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.field-label { font-size: 13px; font-weight: 500; color: var(--text-2); }
.input {
  width: 100%;
  padding: 12px;
  font: inherit;
  font-size: 14px;
  color: var(--text-1);
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: border-color var(--dur-fast) var(--ease), background-color var(--dur-fast) var(--ease);
}
.input::placeholder { color: var(--text-3); }
.textarea {
  min-height: 112px;
  resize: vertical;
  line-height: 1.7;
}
.add-row {
  display: flex;
  align-items: stretch;
  gap: 8px;
  margin-top: 16px;
}
.add-row .input { flex: 1; min-width: 0; }

/* ---------- 后台布局 ---------- */
.admin-shell {
  width: 100%;
  max-width: 900px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.admin-shell .card { max-width: none; }
.admin-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.admin-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.admin-shell .banner { margin-top: 0; }
.empty {
  padding: 32px 16px;
  text-align: center;
  font-size: 14px;
  color: var(--text-3);
  line-height: 2;
}

/* ---------- 主题切换按钮 ---------- */
.theme-toggle {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 50;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-1);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-card);
  backdrop-filter: blur(var(--blur));
  -webkit-backdrop-filter: blur(var(--blur));
  transition: background-color var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
}
.theme-toggle:hover { background: var(--hover); }
.theme-toggle:active { transform: scale(0.98); }
.theme-toggle .icon-sun { display: none; }
.theme-toggle .icon-moon { display: block; }
[data-theme="dark"] .theme-toggle .icon-sun { display: block; }
[data-theme="dark"] .theme-toggle .icon-moon { display: none; }

/* ---------- 弹窗 ---------- */
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--mask);
  animation: fade var(--dur-normal) var(--ease) both;
}
.modal {
  width: 100%;
  max-width: 360px;
  padding: 28px;
  text-align: center;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  backdrop-filter: blur(var(--blur));
  -webkit-backdrop-filter: blur(var(--blur));
  animation: rise var(--dur-normal) var(--ease) both;
}
.modal-title { font-size: 17px; font-weight: 600; }
.modal-text {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-2);
}
.modal-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 20px;
}
.modal .field { text-align: left; }
.modal-actions .btn-primary {
  width: auto;
  padding: 8px 24px;
}

/* ---------- 响应式 ---------- */
@media (max-width: 640px) {
  .page { padding: 32px 16px 64px; }
}
@media (max-width: 560px) {
  .card,
  .modal { padding: 20px; }
  .row { padding: 12px; }
  .admin-head { flex-direction: column; }
}

/* ---------- 动效与无障碍 ---------- */
@keyframes rise {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes breathe {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;

// ============ 小工具 ============

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign(
      { "content-type": "application/json;charset=UTF-8", "cache-control": "no-store" },
      headers
    )
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (e) {
    return null;
  }
}

function normalizeUrl(raw) {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  const candidate =
    lower.indexOf("http://") === 0 || lower.indexOf("https://") === 0 ? s : "https://" + s;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname || u.hostname.indexOf(".") === -1) return null;
    return u.protocol + "//" + u.host;
  } catch (e) {
    return null;
  }
}

const SITE_NAME_DEFAULT = "智能线路调度";
const SITE_DESC_DEFAULT = "自动检测最快线路,稍后自动进入";
const ENTER_TEXT_DEFAULT = "进入主站";

function pickText(input, key, max, fallback) {
  const v = input && typeof input[key] === "string" ? input[key].trim().slice(0, max) : "";
  return v || fallback;
}

function sanitizeConfig(input) {
  const rawLines = input && Array.isArray(input.lines) ? input.lines : [];
  const seen = new Set();
  const lines = [];
  for (const raw of rawLines) {
    // 兼容旧格式(纯字符串)与新格式({ url, name })
    let url = null;
    let name = "";
    if (typeof raw === "string") {
      url = normalizeUrl(raw);
    } else if (raw && typeof raw === "object") {
      url = normalizeUrl(raw.url);
      if (typeof raw.name === "string") name = raw.name.trim().slice(0, MAX_LINE_NAME);
    }
    if (!url || seen.has(url)) continue;
    seen.add(url);
    lines.push({ url, name });
    if (lines.length >= MAX_LINES) break;
  }
  const announcement =
    input && typeof input.announcement === "string" ? input.announcement.slice(0, MAX_NOTICE) : "";
  return {
    lines,
    announcement,
    siteName: pickText(input, "siteName", 40, SITE_NAME_DEFAULT),
    siteDesc: pickText(input, "siteDesc", 120, SITE_DESC_DEFAULT),
    enterText: pickText(input, "enterText", 20, ENTER_TEXT_DEFAULT)
  };
}

async function hmacHex(key, msg) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(msg));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

async function isAuthed(request, env) {
  if (!env || !env.ADMIN_PASSWORD) return false;
  const cookies = request.headers.get("cookie") || "";
  const m = cookies.match(new RegExp("(?:^|;\\s*)" + COOKIE_NAME + "=([^;]+)"));
  if (!m) return false;
  const parts = m[1].split(".");
  if (parts.length !== 2) return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expect = await hmacHex(env.ADMIN_PASSWORD, "admin:" + exp);
  return parts[0] === expect;
}

// ============ 配置读写(KV) ============

let cfgCache = { at: 0, data: null };
const CACHE_TTL = 10 * 1000;

function defaultConfig() {
  return sanitizeConfig({ lines: DEFAULT_LINES, announcement: "" });
}

async function getConfig(env, { fresh = false } = {}) {
  if (!env || !env.CONFIG) return defaultConfig();
  const now = Date.now();
  if (!fresh && cfgCache.data && now - cfgCache.at < CACHE_TTL) return cfgCache.data;
  try {
    const raw = await env.CONFIG.get(CONFIG_KEY);
    const data = raw ? sanitizeConfig(JSON.parse(raw)) : defaultConfig();
    cfgCache = { at: now, data };
    return data;
  } catch (e) {
    return cfgCache.data || defaultConfig();
  }
}

async function saveConfig(env, input) {
  const clean = sanitizeConfig(input);
  if (env && env.CONFIG) {
    await env.CONFIG.put(CONFIG_KEY, JSON.stringify(clean));
  }
  cfgCache = { at: Date.now(), data: clean };
  return clean;
}

// ============ 页面公共片段 ============

const THEME_INIT_JS = `
(function () {
  try {
    var t = localStorage.getItem("hitnav-theme");
    document.documentElement.setAttribute("data-theme", t === "light" ? "light" : "dark");
  } catch (e) {}
})();
`;

const THEME_SCRIPT = `<script>${THEME_INIT_JS}</script>`;

const THEME_TOGGLE_HTML = `
<button type="button" class="theme-toggle" id="themeToggle" aria-label="切换主题">
  <svg class="icon-sun" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>
  </svg>
  <svg class="icon-moon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>
  </svg>
</button>`;

const THEME_BIND_JS = `
(function () {
  try {
    document.getElementById("themeToggle").addEventListener("click", function () {
      var root = document.documentElement;
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("hitnav-theme", next); } catch (e) {}
    });
  } catch (e) {}
})();
`;

// ============ 公共调度页 ============

async function handleHome(request, env) {
  const url = new URL(request.url);
  const f = url.searchParams.get("f");
  const tg = f ? `?f=${encodeURIComponent(f)}` : "";

  const cfg = await getConfig(env);
  const lines = cfg.lines;
  const hasLines = lines.length > 0;
  const siteName = escHtml(cfg.siteName);
  const siteDesc = escHtml(cfg.siteDesc);
  const enterText = escHtml(cfg.enterText);

  const noticeBanner = cfg.announcement
    ? `<div class="banner banner-info">${escHtml(cfg.announcement).replace(/\n/g, "<br>")}</div>`
    : "";

  const rows = lines
    .map((item, i) => {
      const host = new URL(item.url).host;
      const label = escHtml(item.name || `线路 ${i + 1}`);
      return `
        <li class="row" style="--i:${i}">
          <div class="row-main">
            <span class="row-title">${label}</span>
            <span class="row-right">
              <span class="time" id="time${i}"><span class="skeleton skeleton-time"></span></span>
              <button type="button" class="btn-ghost" id="enter${i}" hidden>进入</button>
            </span>
          </div>
          <div class="row-sub">
            <span class="badge badge-info" id="badge${i}">检测中</span>
            <span class="row-meta">${escHtml(host)}</span>
          </div>
        </li>`;
    })
    .join("");

  const linesJson = JSON.stringify(lines).replace(/</g, "\\u003c");
  const emptyBanner = `<div class="banner banner-warn">暂无可用线路,请稍后再试</div>`;

  const html = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${siteName}</title>
${THEME_SCRIPT}
<style>${SHARED_CSS}</style>
</head>
<body>
<main class="page">
  <section class="card" id="mainCard" aria-labelledby="cardTitle">
    <h1 class="card-title" id="cardTitle">${siteName}</h1>
    <p class="card-subtitle">${siteDesc}</p>

    <noscript>
      <div class="banner banner-warn">当前浏览器未启用 JavaScript,无法检测线路</div>
    </noscript>
    <div class="banner" id="banner" role="status" aria-live="polite" hidden></div>
    ${noticeBanner}
${hasLines ? `
    <div class="toolbar" id="toolbar">
      <span class="toolbar-meta" id="count" role="status">正在检测线路…</span>
      <button type="button" class="btn-ghost" id="retry" disabled>重新检测</button>
    </div>

    <ul class="list" id="list">${rows}</ul>

    <div class="actions" id="actionsWrap" hidden>
      <button type="button" class="btn-primary" id="enter" hidden>${enterText}</button>
    </div>` : emptyBanner}
  </section>
</main>
${THEME_TOGGLE_HTML}

<div class="modal-mask" id="wechatModal" hidden>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="wechatTitle">
    <div class="modal-title" id="wechatTitle">请在浏览器中打开</div>
    <p class="modal-text">点击右上角菜单,选择「在浏览器中打开」,即可正常访问。</p>
    <div class="modal-actions">
      <button type="button" class="btn-ghost" id="wechatClose">我知道了</button>
    </div>
  </div>
</div>

<script>
(function () {
  "use strict";
  var sites = ${linesJson};
  var tg = "${tg}";
  var PING_TIMEOUT = 5000;
  var USABLE_MS = 900;
  var REDIRECT_DELAY = 1600;

  function $(id) { return document.getElementById(id); }
  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }

  var bannerEl = $("banner");
  var listEl = $("list");
  var bestUrl = "";
  var redirectTimer = null;

  // 主题切换:即点即换并写入偏好
  ${THEME_BIND_JS}
  // 微信 / QQ 内置浏览器:不测速,弹窗引导去系统浏览器
  var ua = navigator.userAgent.toLowerCase();
  if (ua.indexOf("micromessenger") > -1 || ua.indexOf("qq/") > -1) {
    hide($("mainCard"));
    show($("wechatModal"));
    $("wechatClose").addEventListener("click", function () {
      hide($("wechatModal"));
      show($("mainCard"));
      hide(listEl);
      hide($("toolbar"));
      banner("warn", "请在系统浏览器中打开后使用");
    });
    return;
  }

  function setBadge(i, kind, text) {
    var b = $("badge" + i);
    b.className = "badge badge-" + kind;
    b.textContent = text;
  }

  function setRowLoading(i) {
    var t = $("time" + i);
    t.classList.remove("is-timeout");
    t.innerHTML = '<span class="skeleton skeleton-time"></span>';
    setBadge(i, "info", "检测中");
    hide($("enter" + i));
  }

  function banner(kind, text) {
    bannerEl.className = "banner banner-" + kind;
    bannerEl.textContent = text;
    show(bannerEl);
  }

  function ping(url) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, PING_TIMEOUT);
    var start = Date.now();
    return fetch(url + "/favicon.ico", { mode: "no-cors", cache: "no-cache", signal: controller.signal })
      .then(function () { return Date.now() - start; })
      .catch(function () { return Infinity; })
      .finally(function () { clearTimeout(timer); });
  }

  function go(target) {
    if (target) location.href = target;
  }

  if (!sites.length) return;

  var countEl = $("count");
  var retryBtn = $("retry");
  var enterBtn = $("enter");
  var actionsWrap = $("actionsWrap");

  function run() {
    clearTimeout(redirectTimer);
    bestUrl = "";
    hide(bannerEl);
    hide(actionsWrap);
    hide(enterBtn);
    retryBtn.disabled = true;
    countEl.textContent = "正在检测线路…";
    listEl.setAttribute("aria-busy", "true");

    var jobs = sites.map(function (item, i) {
      setRowLoading(i);
      return ping(item.url).then(function (ms) { return { i: i, url: item.url, ms: ms }; });
    });

    Promise.all(jobs).then(function (results) {
      listEl.removeAttribute("aria-busy");
      results.sort(function (a, b) { return a.ms - b.ms; });

      var usable = 0;
      results.forEach(function (r, rank) {
        var t = $("time" + r.i);
        if (r.ms < USABLE_MS) {
          usable++;
          var isBest = rank === 0;
          setBadge(r.i, isBest ? "success" : "info", isBest ? "最优" : "可用");
          t.textContent = Math.round(r.ms) + "ms";
          show($("enter" + r.i));
          if (isBest) bestUrl = r.url + tg;
        } else {
          t.textContent = "超时";
          t.classList.add("is-timeout");
          setBadge(r.i, "danger", "超时");
        }
      });

      countEl.textContent = "可用线路 " + usable + " / " + sites.length;
      retryBtn.disabled = false;

      if (bestUrl) {
        banner("success", "已锁定最佳节点 · " + Math.round(results[0].ms) + "ms,即将自动进入");
        enterBtn.disabled = false;
        show(actionsWrap);
        show(enterBtn);
        redirectTimer = setTimeout(function () { go(bestUrl); }, REDIRECT_DELAY);
      } else {
        banner("warn", "当前所有线路响应缓慢,请稍后再试");
      }
    });
  }

  sites.forEach(function (item, i) {
    $("enter" + i).addEventListener("click", function () {
      clearTimeout(redirectTimer);
      go(item.url + tg);
    });
  });

  enterBtn.addEventListener("click", function () {
    clearTimeout(redirectTimer);
    go(bestUrl);
  });
  retryBtn.addEventListener("click", run);

  run();
})();
</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html;charset=UTF-8",
      "cache-control": "no-store, no-cache, must-revalidate"
    }
  });
}

// ============ 后台:接口 ============

async function apiLogin(request, env) {
  if (!env || !env.ADMIN_PASSWORD || !env.CONFIG) {
    return json({ ok: false, error: "后台未配置" }, 404);
  }
  const body = await readJson(request);
  const input = body && typeof body.password === "string" ? body.password : "";
  const a = await hmacHex("cmp", env.ADMIN_PASSWORD);
  const b = await hmacHex("cmp", input);
  if (a !== b) return json({ ok: false, error: "密码错误,请重试" }, 401);

  const exp = Date.now() + SESSION_TTL;
  const sig = await hmacHex(env.ADMIN_PASSWORD, "admin:" + exp);
  const cookie =
    COOKIE_NAME + "=" + sig + "." + exp +
    "; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=" + Math.floor(SESSION_TTL / 1000);
  return json({ ok: true }, 200, { "set-cookie": cookie });
}

function apiLogout() {
  const cookie =
    COOKIE_NAME + "=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0";
  return json({ ok: true }, 200, { "set-cookie": cookie });
}

async function apiSaveConfig(request, env) {
  if (!(await isAuthed(request, env))) {
    return json({ ok: false, error: "未登录或登录已过期" }, 401);
  }
  const body = await readJson(request);
  const cfg = await saveConfig(env, body || {});
  return json({ ok: true, config: cfg });
}

// ============ 后台:页面 ============

function renderAdminSetup(env) {
  const missing = [];
  if (!env || !env.ADMIN_PASSWORD) {
    missing.push("未设置管理密码:在 Workers → 设置 → 变量和机密 中添加变量 ADMIN_PASSWORD(建议用「机密」类型)");
  }
  if (!env || !env.CONFIG) {
    missing.push("未绑定 KV:创建一个 KV 命名空间,在 设置 → 变量和机密 → KV 命名空间绑定 中绑定为 CONFIG");
  }
  const html = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>后台配置 - 线路调度</title>
${THEME_SCRIPT}
<style>${SHARED_CSS}</style>
</head>
<body>
<main class="page">
  <section class="card">
    <h1 class="card-title">后台尚未配置</h1>
    <p class="card-subtitle">完成以下配置后刷新本页即可登录</p>
    <div class="banner banner-warn line-height-2">${missing.map(escHtml).join("<br><br>")}</div>
  </section>
</main>
${THEME_TOGGLE_HTML}
<script>${THEME_BIND_JS}</script>
</body>
</html>`;
  return new Response(html, {
    headers: { "content-type": "text/html;charset=UTF-8", "cache-control": "no-store" }
  });
}

function renderAdminLogin() {
  const html = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>后台登录 - 线路调度</title>
${THEME_SCRIPT}
<style>${SHARED_CSS}</style>
</head>
<body>
<main class="page">
  <section class="card">
    <h1 class="card-title">管理员登录</h1>
    <p class="card-subtitle">智能线路调度后台</p>

    <div class="banner banner-danger" id="err" hidden></div>

    <div class="field" style="margin-top: 24px;">
      <label class="field-label" for="pw">管理密码</label>
      <input class="input" id="pw" type="password" autocomplete="current-password" placeholder="请输入管理密码">
    </div>
    <div class="card-actions">
      <button type="button" class="btn-primary" id="loginBtn">登录</button>
    </div>
  </section>
</main>
${THEME_TOGGLE_HTML}
<script>
${THEME_BIND_JS}
(function () {
  "use strict";
  var pw = document.getElementById("pw");
  var err = document.getElementById("err");

  function submit() {
    fetch("/admin/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: pw.value })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok) { location.reload(); return; }
        err.textContent = (res.j && res.j.error) || "密码错误,请重试";
        err.hidden = false;
      })
      .catch(function () {
        err.textContent = "网络错误,请重试";
        err.hidden = false;
      });
  }

  document.getElementById("loginBtn").addEventListener("click", submit);
  pw.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
  });
})();
</script>
</body>
</html>`;
  return new Response(html, {
    headers: { "content-type": "text/html;charset=UTF-8", "cache-control": "no-store" }
  });
}

function renderAdminApp(cfg) {
  const cfgJson = JSON.stringify(cfg).replace(/</g, "\\u003c");
  const html = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>线路调度后台</title>
${THEME_SCRIPT}
<style>${SHARED_CSS}</style>
</head>
<body>
<main class="page page-top">
  <div class="admin-shell">
    <div class="admin-head">
      <div>
        <h1 class="card-title">线路调度后台</h1>
        <p class="card-subtitle">保存后即时生效;KV 同步到全部节点可能有短暂延迟</p>
      </div>
      <button type="button" class="btn-ghost" id="logoutBtn">退出登录</button>
    </div>

    <div class="banner" id="adminBanner" role="status" aria-live="polite" hidden></div>

    <section class="card">
      <h2 class="section-title">前台文案</h2>
      <div class="field" style="margin-top: 16px;">
        <label class="field-label" for="siteNameInput">站点名称(浏览器标题与页面主标题),留空用默认</label>
        <input class="input" id="siteNameInput" type="text" maxlength="40" placeholder="${SITE_NAME_DEFAULT}" autocomplete="off">
      </div>
      <div class="field" style="margin-top: 16px;">
        <label class="field-label" for="siteDescInput">前台说明(主标题下的副标题),留空用默认</label>
        <input class="input" id="siteDescInput" type="text" maxlength="120" placeholder="${SITE_DESC_DEFAULT}" autocomplete="off">
      </div>
      <div class="field" style="margin-top: 16px;">
        <label class="field-label" for="enterTextInput">进入按钮文案,留空用默认</label>
        <input class="input" id="enterTextInput" type="text" maxlength="20" placeholder="${ENTER_TEXT_DEFAULT}" autocomplete="off">
      </div>
      <div class="card-actions">
        <button type="button" class="btn-primary" id="saveTexts">保存文案</button>
      </div>
    </section>

    <section class="card">
      <h2 class="section-title">公告说明</h2>
      <div class="field" style="margin-top: 16px;">
        <label class="field-label" for="announceInput">访客打开调度页时展示的公告,留空则不显示;可换行</label>
        <textarea class="input textarea" id="announceInput" placeholder="例如:老线路如无法访问,请等待自动跳转至最快线路"></textarea>
      </div>
      <div class="card-actions">
        <button type="button" class="btn-primary" id="saveAnnounce">保存公告</button>
      </div>
    </section>

    <section class="card">
      <div class="admin-row-head">
        <h2 class="section-title">线路管理</h2>
        <span class="toolbar-meta" id="lineCount"></span>
      </div>
      <ul class="list" id="lineList"></ul>
      <div class="add-row">
        <input class="input" id="addInput" type="text" inputmode="url" placeholder="https://www.example.com" autocomplete="off">
        <button type="button" class="btn-ghost" id="addBtn">添加线路</button>
      </div>
    </section>
  </div>
</main>
${THEME_TOGGLE_HTML}

<div class="modal-mask" id="editModal" hidden>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="editTitle">
    <div class="modal-title" id="editTitle">编辑线路</div>
    <div class="field" style="margin-top: 20px;">
      <label class="field-label" for="editName">线路名称(可选,留空显示「线路 N」)</label>
      <input class="input" id="editName" type="text" maxlength="20" placeholder="例如:电信线路" autocomplete="off">
    </div>
    <div class="field" style="margin-top: 16px;">
      <label class="field-label" for="editUrl">线路地址</label>
      <input class="input" id="editUrl" type="text" inputmode="url" placeholder="https://www.example.com" autocomplete="off">
    </div>
    <div class="modal-actions">
      <button type="button" class="btn-ghost" id="editCancel">取消</button>
      <button type="button" class="btn-primary" id="editSave">保存</button>
    </div>
  </div>
</div>
<script>
${THEME_BIND_JS}
(function () {
  "use strict";
  var cfg = ${cfgJson};
  var MAX_LINES = ${MAX_LINES};

  function $(id) { return document.getElementById(id); }
  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function normalizeLine(raw) {
    raw = String(raw || "").trim();
    if (!raw) return null;
    var lower = raw.toLowerCase();
    var candidate = (lower.indexOf("http://") === 0 || lower.indexOf("https://") === 0) ? raw : "https://" + raw;
    try {
      var u = new URL(candidate);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      if (!u.hostname || u.hostname.indexOf(".") === -1) return null;
      return u.protocol + "//" + u.host;
    } catch (e) {
      return null;
    }
  }

  var bannerEl = $("adminBanner");
  var listEl = $("lineList");
  var countEl = $("lineCount");
  var announceEl = $("announceInput");
  var addInput = $("addInput");
  var hideTimer = null;

  function showBanner(kind, text, auto) {
    bannerEl.className = "banner banner-" + kind;
    bannerEl.textContent = text;
    bannerEl.hidden = false;
    if (hideTimer) clearTimeout(hideTimer);
    if (auto) hideTimer = setTimeout(function () { bannerEl.hidden = true; }, 2600);
  }

  function render() {
    if (!cfg.lines.length) {
      listEl.innerHTML = '<li class="empty">暂无线路<br>使用下方表单添加第一条线路</li>';
    } else {
      listEl.innerHTML = cfg.lines.map(function (item, i) {
        var label = item.name || "线路 " + (i + 1);
        return '<li class="row" style="--i:' + i + '">'
          + '<div class="row-main">'
          + '<span class="row-title">' + esc(label) + '</span>'
          + '<span class="row-right">'
          + '<button type="button" class="btn-ghost" data-act="edit" data-i="' + i + '">编辑</button>'
          + '<button type="button" class="btn-ghost" data-act="up" data-i="' + i + '"' + (i === 0 ? " disabled" : "") + '>上移</button>'
          + '<button type="button" class="btn-ghost" data-act="down" data-i="' + i + '"' + (i === cfg.lines.length - 1 ? " disabled" : "") + '>下移</button>'
          + '<button type="button" class="btn-ghost" data-act="del" data-i="' + i + '">删除</button>'
          + '</span></div>'
          + '<div class="row-sub"><span class="row-meta">' + esc(item.url) + '</span></div>'
          + '</li>';
      }).join("");
    }
    countEl.textContent = "共 " + cfg.lines.length + " 条线路";
    $("siteNameInput").value = cfg.siteName;
    $("siteDescInput").value = cfg.siteDesc;
    $("enterTextInput").value = cfg.enterText;
    announceEl.value = cfg.announcement;
  }

  function save(msg) {
    return fetch("/admin/api/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lines: cfg.lines,
        announcement: announceEl.value,
        siteName: $("siteNameInput").value,
        siteDesc: $("siteDescInput").value,
        enterText: $("enterTextInput").value
      })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) {
          showBanner("danger", (res.j && res.j.error) || "保存失败,请重新登录后重试");
          return;
        }
        cfg = res.j.config;
        render();
        showBanner("success", msg || "已保存", true);
      })
      .catch(function () { showBanner("danger", "网络错误,保存失败"); });
  }

  // 删除按钮:两击确认,3 秒无操作自动还原
  function armConfirm(btn) {
    if (btn.dataset.armed === "1") return true;
    btn.dataset.armed = "1";
    btn.dataset.label = btn.textContent;
    btn.classList.add("is-confirm");
    btn.textContent = "再次确认";
    setTimeout(function () {
      if (btn.dataset.armed === "1") {
        btn.dataset.armed = "";
        btn.classList.remove("is-confirm");
        btn.textContent = btn.dataset.label;
      }
    }, 3000);
    return false;
  }

  listEl.addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-act]");
    if (!btn || btn.disabled) return;
    var act = btn.getAttribute("data-act");
    var i = Number(btn.getAttribute("data-i"));
    if (act === "edit") {
      openEdit(i);
    } else if (act === "up" && i > 0) {
      cfg.lines.splice(i - 1, 0, cfg.lines.splice(i, 1)[0]);
      save("线路顺序已更新");
    } else if (act === "down" && i < cfg.lines.length - 1) {
      cfg.lines.splice(i + 1, 0, cfg.lines.splice(i, 1)[0]);
      save("线路顺序已更新");
    } else if (act === "del") {
      if (!armConfirm(btn)) return;
      cfg.lines.splice(i, 1);
      save("已删除该线路");
    }
  });

  $("addBtn").addEventListener("click", function () {
    var raw = addInput.value.trim();
    if (!raw) { showBanner("warn", "请输入线路地址"); return; }
    var norm = normalizeLine(raw);
    if (!norm) { showBanner("danger", "线路地址无效,请检查后重试"); return; }
    var dup = cfg.lines.some(function (l) { return l.url === norm; });
    if (dup) { showBanner("warn", "该线路已存在"); return; }
    if (cfg.lines.length >= MAX_LINES) { showBanner("warn", "最多支持 " + MAX_LINES + " 条线路"); return; }
    cfg.lines.push({ url: norm, name: "" });
    addInput.value = "";
    save("已添加线路");
  });
  addInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); $("addBtn").click(); }
  });

  // 编辑线路:弹窗内修改名称与地址
  var editIndex = -1;
  function openEdit(i) {
    editIndex = i;
    $("editName").value = cfg.lines[i].name || "";
    $("editUrl").value = cfg.lines[i].url;
    show($("editModal"));
  }
  function closeEdit() {
    editIndex = -1;
    hide($("editModal"));
  }
  $("editCancel").addEventListener("click", closeEdit);
  $("editModal").addEventListener("click", function (e) {
    if (e.target === $("editModal")) closeEdit();
  });
  $("editSave").addEventListener("click", function () {
    if (editIndex < 0) return;
    var name = $("editName").value.trim().slice(0, 20);
    var norm = normalizeLine($("editUrl").value);
    if (!norm) { showBanner("danger", "线路地址无效,请检查后重试"); return; }
    var dup = cfg.lines.some(function (l, idx) { return idx !== editIndex && l.url === norm; });
    if (dup) { showBanner("warn", "该地址已存在于其他线路"); return; }
    cfg.lines[editIndex] = { url: norm, name: name };
    closeEdit();
    save("已更新线路");
  });
  $("editUrl").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); $("editSave").click(); }
  });

  $("saveAnnounce").addEventListener("click", function () { save("公告已保存"); });
  $("saveTexts").addEventListener("click", function () { save("前台文案已保存"); });

  $("logoutBtn").addEventListener("click", function () {
    fetch("/admin/api/logout", { method: "POST" }).finally(function () { location.reload(); });
  });

  render();
})();
</script>
</body>
</html>`;
  return new Response(html, {
    headers: { "content-type": "text/html;charset=UTF-8", "cache-control": "no-store" }
  });
}

// ============ 后台:路由 ============

async function handleAdmin(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === "/admin/api/login" && method === "POST") return apiLogin(request, env);
  if (path === "/admin/api/logout" && method === "POST") return apiLogout();
  if (path === "/admin/api/config" && method === "POST") return apiSaveConfig(request, env);
  if (path !== "/admin" && path !== "/admin/") {
    return new Response("Not found", { status: 404 });
  }

  if (!env || !env.ADMIN_PASSWORD || !env.CONFIG) return renderAdminSetup(env);
  if (!(await isAuthed(request, env))) return renderAdminLogin();
  const cfg = await getConfig(env, { fresh: true });
  return renderAdminApp(cfg);
}

// ============ 入口 ============

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
      return handleAdmin(request, env);
    }
    return handleHome(request, env);
  }
};
