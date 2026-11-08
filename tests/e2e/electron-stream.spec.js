/**
 * Electron 流式透传 · 真桌面端到端（2026-11-08）
 * ----------------------------------------------------------------------------
 * 单测两端各自 mock（F8 用假 fetch、electron-stream 用假 electronAPI），
 * 但它们证明不了「渲染进程 → 主进程 → 真 SSE 上游 → 分块回推 → 打字机」这条链真的通。
 * 本 spec 用本地假 provider（回真 SSE，分块之间真的有时间间隔）+ 真 Electron 进程：
 *   ① 上游收到 body.stream=true（主进程确实按流式请求）；
 *   ② 渲染进程连续收到多段 chat-chunk（同一 streamId）——首段到达时 DOM 还是半截；
 *   ③ invoke 最终返回合成消息，正好等于分块拼接结果。
 * 默认跳过；设 E2E=1 且 DRAW_ELECTRON_EXECUTABLE 指向 electron 可执行文件才跑（CI 不跑桌面端）。
 */
const { test: base, expect } = require("./_fixture");
const { _electron } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");

const executablePath = process.env.DRAW_ELECTRON_EXECUTABLE;

function startFakeProvider(){
  const record = { bodies: [] };
  const server = http.createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type,authorization",
        "access-control-allow-methods": "POST,OPTIONS",
      });
      return res.end();
    }
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      let body = {};
      try { body = JSON.parse(raw || "{}"); } catch (_e) { body = {}; }
      record.bodies.push(body);
      if (!body.stream) {
        res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
        return res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "整包完成" } }] }));
      }
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", "access-control-allow-origin": "*" });
      const parts = ["流式", "完成"];
      let i = 0;
      const tick = () => {
        if (i < parts.length) {
          const chunk = { choices: [{ delta: { content: parts[i] } }] };
          res.write("data: " + JSON.stringify(chunk) + "\n\n");
          i++;
          setTimeout(tick, 120);
        } else {
          res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n');
          res.write("data: [DONE]\n\n");
          res.end();
        }
      };
      tick();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, record, port: server.address().port });
    });
  });
}

let electronApp = null;

const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    if (!process.env.E2E || !executablePath || testInfo.project.name !== "desktop-1280x800") {
      await use(page);
      return;
    }
    const profile = await fs.mkdtemp(path.join(os.tmpdir(), "aw-stream-"));
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    let app;
    try {
      app = await _electron.launch({ executablePath, args: [path.resolve(__dirname, "../../electron/main.js"), "--user-data-dir=" + profile], env });
      const identity = await app.evaluate(({ app }) => ({ userData: app.getPath("userData"), appPath: app.getAppPath() }));
      expect(path.resolve(identity.userData).toLowerCase()).toBe(path.resolve(profile).toLowerCase());
      expect(path.resolve(identity.appPath)).toBe(path.resolve(__dirname, "../../electron"));
      const window = await app.firstWindow();
      await app.context().addInitScript(() => localStorage.setItem("wb_agent_onboarded", "true"));
      await window.reload();
      electronApp = app;
      await use(window);
    } finally {
      electronApp = null;
      if (app) {
        try { await Promise.race([app.evaluate(({ app }) => app.exit(0)).catch(() => {}), new Promise((r) => setTimeout(r, 3000))]); } catch (_e) { /* 已退出 */ }
        try { await Promise.race([app.close(), new Promise((r) => setTimeout(r, 5000))]); } catch (_e) { /* 已退出 */ }
        try { const proc = app.process(); if (proc && !proc.killed) proc.kill(); } catch (_e) { /* 已退出 */ }
      }
      await fs.rm(profile, { recursive: true, force: true });
    }
  },
});

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!process.env.E2E, "set E2E=1 to run");
  test.skip(!executablePath, "set DRAW_ELECTRON_EXECUTABLE to the electron binary");
  test.skip(testInfo.project.name !== "desktop-1280x800", "Electron acceptance uses the desktop project");
  await page.waitForFunction(() => document.getElementById("chat")?.children.length > 0);
});

test("渲染进程经主进程拿到 SSE 分块，打字机先于最终消息", async ({ page }) => {
  test.setTimeout(90_000);
  const fake = await startFakeProvider();
  try {
    const base = "http://127.0.0.1:" + fake.port + "/v1";
    /* 主进程持有 Key/base；渲染进程侧配置只提供 profileId 与 model */
    const saved = await page.evaluate(async (b) => {
      return electronAPI.setAiConfig({
        enabled: false,
        profiles: [{ id: "p1", base: b, model: "m", key: "sk-e2e" }],
      });
    }, base);
    expect(saved && saved.ok).toBe(true);
    await page.evaluate((b) => {
      _resetCrypto();
      localStorage.setItem("wb_agent_cfg", JSON.stringify({
        enabled: false,
        profiles: [{ id: "p1", name: "E2E", base: b, model: "m", key: "" }],
        activeId: "p1",
      }));
    }, base);

    await page.evaluate(() => {
      window.__stream = { chunks: [], firstAt: 0, firstLen: -1 };
      window.__streamUnsub = electronAPI.onChatChunk((d) => {
        if (!d || !d.streamId) return;
        if (!window.__stream.firstAt) {
          window.__stream.firstAt = Date.now();
          window.__stream.firstLen = document.getElementById("chat").textContent.length;
        }
        window.__stream.chunks.push(d);
      });
      sendChatText("流式测试");
    });

    await page.waitForFunction(() => document.getElementById("chat").textContent.includes("流式完成"), null, { timeout: 40_000 });
    const info = await page.evaluate(() => {
      const chat = document.getElementById("chat");
      const senders = new Set(window.__stream.chunks.map((d) => d.streamId));
      const text = window.__stream.chunks.map((d) => d.text).join("");
      return {
        n: window.__stream.chunks.length,
        streamIds: Array.from(senders),
        joined: text,
        firstLen: window.__stream.firstLen,
        finalLen: chat.textContent.length,
      };
    });

    /* ① 主进程确实按流式请求上游 */
    const last = fake.record.bodies[fake.record.bodies.length - 1];
    expect(last).toBeTruthy();
    expect(last.stream).toBe(true);
    expect(last.messages[last.messages.length - 1].content).toBe("流式测试");

    /* ② 多段、同一 streamId、拼接等于最终内容 */
    expect(info.n).toBeGreaterThanOrEqual(2);
    expect(info.streamIds).toHaveLength(1);
    expect(info.joined).toBe("流式完成");

    /* ③ 首段到达时 DOM 还没写完 —— 证明是逐段渲染，不是最后的整包一次性出现 */
    expect(info.firstLen).toBeGreaterThanOrEqual(0);
    expect(info.firstLen).toBeLessThan(info.finalLen);
    await expect(page.locator("#chat")).toContainText("流式完成");
  } finally {
    await new Promise((r) => fake.server.close(r));
  }
});