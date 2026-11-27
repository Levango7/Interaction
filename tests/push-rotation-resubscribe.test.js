/**
 * push-rotation-resubscribe.test.js —— 推送订阅轮换的页面端消费者（2026-11-27 批）
 * ----------------------------------------------------------------------------
 * 缺口：service-worker.js 已在 pushsubscriptionchange 时广播 {type:"PUSH_SUBSCRIPTION_CHANGE"}，
 * 但**页面端零消费者**——浏览器轮换订阅后推送静默中断（定时提醒收不到，用户不知情）。
 * 本批：页面注册 SW message 监听，收到该消息且本机确实订阅过（有 push_subscription 记录）
 * 才走 subscribePush 重订阅；未开启推送的用户不被静默创建订阅；失败留痕（pushRotation）。
 * 边界：SW 侧广播是既有代码不动；浏览器真事件投递不在 jsdom 射程内（钉的是消息到页面这一段）。
 *
 * 钉子（beforeParse 注入 SW/推送链 mock，捕获监听器后真驱动）：
 *   ① 有订阅记录 → 收到消息 ⇒ 真走重订阅：新 endpoint 上报服务端 + 落盘更新；
 *   ② 无订阅记录 ⇒ 零订阅零上报（不静默创建）；
 *   ③ subscribe 抛错 ⇒ 诊断留痕（pushRotation），不炸页面；
 *   ④ 其他 type 的消息 ⇒ 零动作。
 * 探针全部挂在 window.__probe（beforeParse 局部对象），无模块级捕获数组（probe-binding 判据）。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

let win;

function boot({ withSubscription, subscribeFails }) {
  const w = loadApp({
    storage: withSubscription
      ? { wb_agent_push_subscription: JSON.stringify({ endpoint: "https://push.example/old", ts: 1 }) }
      : {},
    beforeParse(window) {
      const probe = {
        listeners: {},
        posts: [],
        subscribeCalls: 0,
        diags: [],
      };
      const fakeSub = {
        endpoint: "https://push.example/rotated",
        toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "k", auth: "a" } }; },
        unsubscribe: async () => true,
      };
      Object.defineProperty(window.navigator, "serviceWorker", {
        configurable: true,
        value: {
          addEventListener: (type, fn) => { probe.listeners[type] = fn; },
          register: async () => ({}),
          ready: Promise.resolve({
            pushManager: {
              subscribe: async () => {
                probe.subscribeCalls++;
                if (subscribeFails) throw new Error("push subscribe denied by browser");
                return fakeSub;
              },
            },
          }),
        },
      });
      window.PushManager = function () {};
      window.Notification = { permission: "granted" };
      window.__probe = probe;
      /* mock 底层 fetch：window.apiFetch/apiPushSubscribe 会在应用启动时被覆盖回真实现，
         在 beforeParse 里 mock 它们会被顶掉（首版实测 subscribeCalls=0 的根因）。 */
      window.fetch = async (url, opts) => {
        const u = String(url);
        const method = (opts && opts.method) || "GET";
        if (/\/api\/notifications\/vapid-public-key/.test(u)) {
          return { ok: true, status: 200, json: async () => ({ publicKey: "BQd2VGVzdA" }) };
        }
        if (/\/api\/notifications\/push\/subscribe/.test(u) && method === "POST") {
          probe.posts.push(JSON.parse(opts.body));
          return { ok: true, status: 200, json: async () => ({}) };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      };
    },
  });
  /* pushDiag 也在启动时被应用覆盖（与 apiFetch 同型坑）：必须在 loadApp 之后再包装，
     监听器是用例手动触发的，此时包装来得及。 */
  const origDiag = w.pushDiag;
  w.pushDiag = function (level, msg, ctx) {
    w.__probe.diags.push({ level, msg: String(msg), ctx });
    return origDiag && origDiag.apply(w, arguments);
  };
  return w;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  win = null;
});

afterEach(() => {
  try { if (win) win.close(); } catch (_e) { /* jsdom 关闭失败不影响断言 */ }
});

describe("推送订阅轮换：页面端重订阅消费者", () => {
  it("① 有订阅记录：收到轮换消息 ⇒ 新 endpoint 上报 + 落盘更新", async () => {
    win = boot({ withSubscription: true, subscribeFails: false });
    await wait(60);
    const probe = win.__probe;
    expect(probe.listeners.message, "页面应注册 SW message 监听").toBeTypeOf("function");
    probe.listeners.message({ data: { type: "PUSH_SUBSCRIPTION_CHANGE" } });
    await wait(300);
    expect(probe.subscribeCalls, "应真走 pushManager.subscribe 重订阅").toBe(1);
    expect(probe.posts.length, "新订阅应上报服务端").toBe(1);
    expect(probe.posts[0].endpoint).toBe("https://push.example/rotated");
    const persisted = JSON.parse(win.localStorage.getItem("wb_agent_push_subscription"));
    expect(persisted.endpoint, "落盘应更新为新 endpoint（下次启动状态不旧）").toBe("https://push.example/rotated");
  });

  it("② 无订阅记录：零订阅零上报（未开启推送的用户不被静默创建）", async () => {
    win = boot({ withSubscription: false, subscribeFails: false });
    await wait(60);
    const probe = win.__probe;
    probe.listeners.message({ data: { type: "PUSH_SUBSCRIPTION_CHANGE" } });
    await wait(250);
    expect(probe.subscribeCalls).toBe(0);
    expect(probe.posts.length).toBe(0);
  });

  it("③ subscribe 抛错：诊断留痕（pushRotation），不炸页面", async () => {
    win = boot({ withSubscription: true, subscribeFails: true });
    await wait(60);
    const probe = win.__probe;
    probe.listeners.message({ data: { type: "PUSH_SUBSCRIPTION_CHANGE" } });
    await wait(300);
    expect(probe.subscribeCalls).toBe(1);
    expect(probe.posts.length).toBe(0);
    const hit = probe.diags.find((d) => d.ctx && d.ctx.where === "pushRotation");
    expect(hit, "重订阅失败必须留痕——静默中断与「不知道坏了」是同一类缺口").toBeTruthy();
  });

  it("④ 其他 type 的消息：零动作", async () => {
    win = boot({ withSubscription: true, subscribeFails: false });
    await wait(60);
    const probe = win.__probe;
    probe.listeners.message({ data: { type: "SOME_OTHER_EVENT" } });
    await wait(250);
    expect(probe.subscribeCalls).toBe(0);
    expect(probe.posts.length).toBe(0);
  });
});
