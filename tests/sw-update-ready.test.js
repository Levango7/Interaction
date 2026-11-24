import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const HTML = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "agent-workbench.html"), "utf8");

const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));

function boot() {
  const win = loadApp({ storage: { wb_agent_onboarded: "true" } });
  windows.push(win);
  return win;
}

function bootSw({ waiting = false, liveVersion, cachesMode = "available", cacheDeleteRejects = false, deferRegister = false } = {}) {
  const probe = { updates: 0, fetches: 0, cacheDeletes: [] };
  let activeLiveVersion = liveVersion;
  let activeLiveHtml;
  let offline = false;
  let resolveRegistration;
  probe.setLiveVersion = (value) => { activeLiveVersion = value; };
  probe.setLiveHtml = (value) => { activeLiveHtml = value; };
  probe.setOffline = (value) => { offline = !!value; };
  probe.resolveRegistration = () => resolveRegistration(probe.reg);
  const win = loadApp({
    storage: { wb_agent_onboarded: "true" },
    beforeParse(w) {
      const currentBuild = HTML.match(/BUILD_TAG\s*=\s*"([^"]+)"/)?.[1] || "";
      const reg = new w.EventTarget();
      const installing = new w.EventTarget();
      installing.state = "installing";
      reg.installing = installing;
      reg.waiting = waiting ? {} : null;
      reg.update = () => { probe.updates++; probe.ready = true; };
      Object.defineProperty(w.navigator, "serviceWorker", {
        configurable: true,
        value: {
          register: () => {
            if (!deferRegister) return Promise.resolve(reg);
            return new Promise((resolve) => { resolveRegistration = resolve; });
          },
          getRegistration: () => Promise.resolve(reg)
        }
      });
      if (cachesMode !== "missing") {
        Object.defineProperty(w, "caches", {
          configurable: true,
          value: {
            keys: () => cachesMode === "reject"
              ? Promise.reject(new Error("cache storage unavailable"))
              : Promise.resolve(["workbench-old"]),
            delete: (key) => {
              probe.cacheDeletes.push(key);
              return cacheDeleteRejects
                ? Promise.reject(new Error("cache deletion failed"))
                : Promise.resolve(true);
            }
          }
        });
      }
      Object.defineProperty(w, "fetch", {
        configurable: true,
        writable: true,
        value: (input) => {
          probe.fetches++;
          const url = new w.URL(String(input), w.location.href);
          if (offline) {
            const cached = !url.searchParams.has("wb_update_check");
            return Promise.resolve({
              ok: cached,
              status: cached ? 200 : 504,
              text: () => Promise.resolve('BUILD_TAG="' + currentBuild + '"')
            });
          }
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(activeLiveHtml !== undefined
              ? activeLiveHtml
              : 'BUILD_TAG="' + (activeLiveVersion || currentBuild) + '"')
          });
        }
      });
      Object.assign(probe, { reg, installing });
    }
  });
  probe.win = win;
  windows.push(win);
  return probe;
}

describe("Service Worker 更新事件", () => {
  it("另一标签留下同版本 waiting SW 时不误报更新", async () => {
    const probe = bootSw({ waiting: true });
    await vi.waitFor(() => expect(probe.ready).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(probe.win.swUpdateState()).toBe("idle");
    expect(probe.win.document.getElementById("swUpdateReadyBtn")).toBeNull();
    expect(probe.cacheDeletes).toEqual([]);
  });

  it("另一标签已留下 waiting SW 且线上是新版时显示常驻入口", async () => {
    const probe = bootSw({ waiting: true, deferRegister: true });
    await vi.waitFor(() => expect(probe.fetches).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(probe.win.swUpdateState()).toBe("idle");
    probe.setLiveVersion("next-build");
    probe.resolveRegistration();
    await vi.waitFor(() => expect(probe.win.document.getElementById("swUpdateReadyBtn")).toBeTruthy());
    expect(probe.win.swUpdateState()).toBe("pending");
    expect(probe.cacheDeletes).toEqual([]);
  });

  it("版本哨兵确认同版本时不显示更新入口", async () => {
    const probe = bootSw();
    await vi.waitFor(() => expect(probe.ready).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(probe.win.swUpdateState()).toBe("idle");
    expect(probe.win.document.getElementById("swUpdateReadyBtn")).toBeNull();
    expect(probe.cacheDeletes).toEqual([]);
  });

  it("版本哨兵发现线上新版时促更新并显示常驻入口，不清空新缓存", async () => {
    const probe = bootSw({ liveVersion: "next-build" });
    await vi.waitFor(() => expect(probe.win.document.getElementById("swUpdateReadyBtn")).toBeTruthy());
    expect(probe.updates).toBe(2);
    expect(probe.cacheDeletes).toEqual([]);
  });

  it.each([
    ["缺失", { cachesMode: "missing" }],
    ["keys 拒绝", { cachesMode: "reject" }],
    ["delete 拒绝", { cacheDeleteRejects: true }]
  ])("缓存 API %s 时仍显示已确认的新版入口", async (_label, options) => {
    const probe = bootSw({ liveVersion: "next-build", ...options });
    await vi.waitFor(() => expect(probe.win.document.getElementById("swUpdateReadyBtn")).toBeTruthy());
    expect(probe.win.swUpdateState()).toBe("pending");
    expect(probe.updates).toBe(2);
  });

  it("同版本新 SW activated 时不误报更新", async () => {
    const probe = bootSw();
    await vi.waitFor(() => expect(probe.fetches).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    probe.reg.dispatchEvent(new probe.win.Event("updatefound"));
    probe.installing.state = "activated";
    probe.installing.dispatchEvent(new probe.win.Event("statechange"));
    probe.installing.dispatchEvent(new probe.win.Event("statechange"));
    await vi.waitFor(() => expect(probe.fetches).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(probe.win.swUpdateState()).toBe("idle");
    expect(probe.win.document.getElementById("swUpdateReadyBtn")).toBeNull();
    expect(probe.cacheDeletes).toEqual([]);
  });

  it("新 SW activated 且线上是新版时显示常驻入口并提示刷新", async () => {
    const probe = bootSw();
    await vi.waitFor(() => expect(probe.fetches).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    probe.setLiveVersion("next-build");
    probe.reg.dispatchEvent(new probe.win.Event("updatefound"));
    probe.installing.state = "activated";
    probe.installing.dispatchEvent(new probe.win.Event("statechange"));
    probe.installing.dispatchEvent(new probe.win.Event("statechange"));
    await vi.waitFor(() => expect(probe.win.document.getElementById("swUpdateReadyBtn")).toBeTruthy());
    expect(probe.fetches).toBe(2);
    expect(probe.cacheDeletes).toEqual([]);
    const updateToasts = Array.from(probe.win.document.querySelectorAll("#toasts .toast"))
      .filter((el) => el.textContent.includes("新版本已就绪"));
    expect(updateToasts).toHaveLength(1);
  });
  it("同一线上版本重复激活时不重复促更新", async () => {
    const probe = bootSw({ liveVersion: "next-build" });
    await vi.waitFor(() => expect(probe.win.document.getElementById("swUpdateReadyBtn")).toBeTruthy());
    expect(probe.updates).toBe(2);
    probe.reg.dispatchEvent(new probe.win.Event("updatefound"));
    probe.installing.state = "activated";
    probe.installing.dispatchEvent(new probe.win.Event("statechange"));
    await vi.waitFor(() => expect(probe.fetches).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(probe.updates).toBe(2);
    expect(probe.win.swUpdateState()).toBe("pending");
  });

  it("线上回滚为当前版本时撤销更新入口与刷新提示", async () => {
    const probe = bootSw({ liveVersion: "next-build" });
    await vi.waitFor(() => expect(probe.win.document.getElementById("swUpdateReadyBtn")).toBeTruthy());
    const updateToast = Array.from(probe.win.document.querySelectorAll("#toasts .toast"))
      .find((el) => el.textContent.includes("新版本已就绪"));
    expect(updateToast).toBeTruthy();
    probe.setLiveVersion();
    probe.reg.dispatchEvent(new probe.win.Event("updatefound"));
    probe.installing.state = "activated";
    probe.installing.dispatchEvent(new probe.win.Event("statechange"));
    await vi.waitFor(() => expect(probe.fetches).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(probe.win.swUpdateState()).toBe("idle");
    expect(probe.win.document.getElementById("swUpdateReadyBtn")).toBeNull();
    expect(updateToast.isConnected).toBe(false);
    expect(probe.updates).toBe(2);
  });

  it("切换语言后线上回滚仍撤销原刷新提示", async () => {
    const probe = bootSw({ liveVersion: "next-build" });
    await vi.waitFor(() => expect(probe.win.document.getElementById("swUpdateReadyBtn")).toBeTruthy());
    const updateToast = Array.from(probe.win.document.querySelectorAll("#toasts .toast"))
      .find((el) => el.textContent.includes("新版本已就绪"));
    expect(probe.win.setLang("en")).toBe(true);
    probe.setLiveVersion();
    probe.reg.dispatchEvent(new probe.win.Event("updatefound"));
    probe.installing.state = "activated";
    probe.installing.dispatchEvent(new probe.win.Event("statechange"));
    await vi.waitFor(() => expect(probe.win.swUpdateState()).toBe("idle"));
    expect(updateToast.isConnected).toBe(false);
  });

  it("离线缓存回退不会撤销已确认的更新状态", async () => {
    const probe = bootSw({ liveVersion: "next-build" });
    await vi.waitFor(() => expect(probe.win.document.getElementById("swUpdateReadyBtn")).toBeTruthy());
    probe.setOffline(true);
    probe.reg.dispatchEvent(new probe.win.Event("updatefound"));
    probe.installing.state = "activated";
    probe.installing.dispatchEvent(new probe.win.Event("statechange"));
    await vi.waitFor(() => expect(probe.fetches).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(probe.win.swUpdateState()).toBe("pending");
    expect(probe.win.document.getElementById("swUpdateReadyBtn")).toBeTruthy();
  });

  it("线上页面缺少版本哨兵时保持已确认的更新状态", async () => {
    const probe = bootSw({ liveVersion: "next-build" });
    await vi.waitFor(() => expect(probe.win.document.getElementById("swUpdateReadyBtn")).toBeTruthy());
    probe.setLiveHtml("<html>missing version sentinel</html>");
    probe.reg.dispatchEvent(new probe.win.Event("updatefound"));
    probe.installing.state = "activated";
    probe.installing.dispatchEvent(new probe.win.Event("statechange"));
    await vi.waitFor(() => expect(probe.fetches).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(probe.win.swUpdateState()).toBe("pending");
    expect(probe.win.document.getElementById("swUpdateReadyBtn")).toBeTruthy();
  });
});

describe("状态栏更新就绪入口", () => {
  it("更新未就绪时不显示入口", () => {
    const win = boot();
    win.appendFoot();
    expect(win.document.getElementById("swUpdateReadyBtn")).toBeNull();
  });

  it("更新就绪后显示一个可点击入口，重复渲染不重复", () => {
    const win = boot();
    win._swSetUpdatePending(true);
    win.appendFoot();
    win.appendFoot();
    const buttons = win.document.querySelectorAll("#swUpdateReadyBtn");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].tagName).toBe("BUTTON");
    expect(buttons[0].textContent).toContain("更新可用");
  });

  it("点击常驻入口重新显示刷新提示", () => {
    const win = boot();
    win._swSetUpdatePending(true);
    win.appendFoot();
    win._promptSwReload();
    win.document.querySelector("#toasts .toast").remove();
    win.document.getElementById("swUpdateReadyBtn").click();
    const toasts = win.document.querySelectorAll("#toasts .toast");
    expect(toasts).toHaveLength(1);
    expect(toasts[0].textContent).toContain("新版本已就绪");
    expect(toasts[0].style.cursor).toBe("pointer");
  });
});
