/* v3.7.103：账号后端可达性探测 + 欢迎页「如实说明」的验收。
 *
 * 动机（实现在 src/ui-ge-api.js 的 probeAccountBackend 与
 * src/render-overview.js 的 _fillAuthBackendNotice）：
 * 账号入口对用户是可见可点的，但本仓库只含客户端、不含后端
 * （见 docs/product-scope.md 的「可选账号与云同步」）。
 * 此前 SSO 两条路径（微信扫码 / GitHub）已有「当前环境无后端」的提示，
 * 唯独邮箱登录 / 注册这条**主路径**没有 —— 用户会把表单一路填完、
 * 点提交，才拿到一句笼统的「离线模式」，于是跑去检查自己的网络。
 * 同一个页面对同一个事实给出两种口径，是本文件要钉住的东西。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

/* 读源码文件一律用绝对字符串路径：本机沙箱的 fs shim 不接受 file:// URL
   （实测 TypeError: The URL must be of scheme file），与其它测试的写法一致。 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let win;

afterEach(() => {
  if (win) win.close();
  win = undefined;
  vi.restoreAllMocks();
});

async function boot() {
  win = loadApp();
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  return win;
}

async function startPage(page, setup) {
  await boot();
  if (setup) setup(win);
  win.__test.setActive(page);
  win.__test.render();
  return win.document;
}

/* 探测函数在 window 上；jsdom 默认没有 fetch，赋值即创建。
   若某天 loadApp 把它定义成只读属性，这里会显式报错而不是静默不生效。 */
function setFetch(impl) {
  Object.defineProperty(win, "fetch", { value: impl, configurable: true, writable: true });
}

describe("probeAccountBackend：可达性判据", () => {
  it("health 返回 2xx 判可达，且请求打到 apiBase + /api/health", async () => {
    await boot();
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    setFetch(f);
    await expect(win.probeAccountBackend()).resolves.toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0][0])).toMatch(/\/api\/health$/);
  });

  it("返回 503 判不可达（服务在但坏了，对用户同样是「用不了」）", async () => {
    await boot();
    setFetch(vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(win.probeAccountBackend()).resolves.toBe(false);
  });

  it("返回 404 判不可达（这个端口被别的东西占着）", async () => {
    await boot();
    setFetch(vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(win.probeAccountBackend()).resolves.toBe(false);
  });

  it("fetch 抛错（端口无人监听）判不可达，且本函数自己不抛", async () => {
    await boot();
    setFetch(vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(win.probeAccountBackend()).resolves.toBe(false);
  });

  it("超时经 AbortController 中止后判不可达", async () => {
    await boot();
    /* 让 3s 定时器立即触发：signal 在 fetch 收到它之前就已 abort，
       等价于「等满 3s 无响应」，但测试不必真的等 3 秒。
       第二个分支返回永不结算的 Promise：万一 abort 没生效，用例会以
       超时暴露问题，而不是「碰巧通过」。 */
    vi.spyOn(win, "setTimeout").mockImplementation((fn) => { fn(); return 1; });
    setFetch(vi.fn((url, opts) => {
      if (opts && opts.signal && opts.signal.aborted) return Promise.reject(new Error("aborted"));
      return new Promise(() => {});
    }));
    await expect(win.probeAccountBackend()).resolves.toBe(false);
  });
});

describe("欢迎页：探测不到后端就如实说明", () => {
  it("不可达时显示说明块，文案点明「未检测到账号服务」并给出部署指引", async () => {
    const doc = await startPage("authwelcome", (w) => {
      w.probeAccountBackend = vi.fn().mockResolvedValue(false);
    });
    const box = doc.getElementById("authBackendNotice");
    await vi.waitFor(() => expect(box.classList.contains("u-hidden")).toBe(false));
    expect(box.textContent).toContain("未检测到账号服务");
    expect(box.textContent).toContain("部署");
    expect(box.textContent).toContain("本地功能完全不受影响");
  });

  it("可达时说明块保持隐藏（不打扰已自行部署后端的用户）", async () => {
    let settle;
    const probe = vi.fn(() => new Promise((r) => { settle = r; }));
    const doc = await startPage("authwelcome", (w) => { w.probeAccountBackend = probe; });
    await vi.waitFor(() => expect(probe).toHaveBeenCalled());
    settle(true);
    await Promise.resolve();
    await Promise.resolve();
    const box = doc.getElementById("authBackendNotice");
    expect(box.classList.contains("u-hidden")).toBe(true);
    expect(box.textContent).toBe("");
  });

  it("探测函数不存在时不抛错，页面照常可用（例如浏览器里跑的是旧产物）", async () => {
    const doc = await startPage("authwelcome", (w) => {
      Object.defineProperty(w, "probeAccountBackend", { value: undefined, configurable: true });
    });
    expect(doc.getElementById("authPageGoLogin")).toBeTruthy();
    expect(doc.getElementById("authBackendNotice").classList.contains("u-hidden")).toBe(true);
  });
});

describe("邮箱登录 / 注册遇网络失败：口径与欢迎页一致", () => {
  const offlineErr = () => Object.assign(new Error("network error"), { offline: true });

  it("登录遇网络失败 → 提示「账号服务」，不再说「离线模式」", async () => {
    const doc = await startPage("authlogin");
    doc.getElementById("authPageLoginEmail").value = "user@example.com";
    doc.getElementById("authPageLoginPassword").value = "12345678";
    win.apiLogin = vi.fn().mockRejectedValue(offlineErr());
    doc.getElementById("authPageLoginForm").onsubmit({ preventDefault() {} });
    const err = doc.getElementById("authPageLoginError");
    await vi.waitFor(() => expect(err.textContent).not.toBe(""));
    expect(err.textContent).toContain("账号服务");
    expect(err.textContent).not.toContain("离线模式");
  });

  it("注册遇网络失败 → 同样指向账号服务", async () => {
    const doc = await startPage("authregister");
    doc.getElementById("authPageRegName").value = "张三";
    doc.getElementById("authPageRegEmail").value = "user@example.com";
    doc.getElementById("authPageRegCode").value = "123456";
    doc.getElementById("authPageRegPassword").value = "12345678";
    doc.getElementById("authPageRegPassword2").value = "12345678";
    win.apiRegister = vi.fn().mockRejectedValue(offlineErr());
    doc.getElementById("authPageRegisterForm").onsubmit({ preventDefault() {} });
    const err = doc.getElementById("authPageRegisterError");
    await vi.waitFor(() => expect(err.textContent).not.toBe(""));
    expect(err.textContent).toContain("账号服务");
  });

  it("非网络类失败仍说「登录失败」（不把服务端的拒绝也归因成没有后端）", async () => {
    const doc = await startPage("authlogin");
    doc.getElementById("authPageLoginEmail").value = "user@example.com";
    doc.getElementById("authPageLoginPassword").value = "12345678";
    win.apiLogin = vi.fn().mockRejectedValue(new Error("boom"));
    doc.getElementById("authPageLoginForm").onsubmit({ preventDefault() {} });
    const err = doc.getElementById("authPageLoginError");
    await vi.waitFor(() => expect(err.textContent).not.toBe(""));
    expect(err.textContent).toContain("登录失败");
    expect(err.textContent).not.toContain("账号服务");
  });
});

describe("i18n：新增文案中英双份且英文不留中文", () => {
  const core = readFileSync(join(ROOT, "src", "core.js"), "utf8");
  const keys = [
    "api.accountServiceUnreachable",
    "auth.backendMissingTitle",
    "auth.backendMissingBody",
    "auth.backendMissingHint",
  ];

  it.each(keys)("%s 在 zh 与 en 两个字典里都定义了", (key) => {
    const hits = core.match(new RegExp('"' + key.replace(/\./g, "\\.") + '"\\s*:', "g")) || [];
    expect(hits.length, key + " 应恰好定义两次（zh + en），实际 " + hits.length).toBe(2);
  });

  it.each(keys)("%s 的英文条目不含中文字符（防止漏译被中文回填）", (key) => {
    const all = [...core.matchAll(new RegExp('"' + key.replace(/\./g, "\\.") + '":\\s*"([^"]*)"', "g"))];
    expect(all.length).toBe(2);
    expect(all[1][1]).not.toMatch(/[\u4e00-\u9fa5]/);
  });
});
