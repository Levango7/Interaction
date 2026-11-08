/**
 * 图片附件（2026-11-08，恢复多模态：base64 内联）
 *
 * 契约：
 *  ① 只认白名单位图 dataURL（png/jpeg/gif/webp + base64）——历史里被写入的
 *    javascript:/svg/text 串既不显示也不会成为可执行面；
 *  ② 发送形态是 OpenAI 兼容 content 数组（text + image_url），无图时退回纯字符串；
 *  ③ 预算口径统一：一张图按固定成本计入 _msgTokens / recordSendEstimate，
 *    否则「统计说没超预算、裁剪却按超了算」；
 *  ④ 缩略图在 sanitizeHtml 之后用 DOM 注入，且注入前过 ① 的校验；
 *  ⑤ 会话镜像的自动命名不能因数组 content 抛 TypeError 而中断。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/* 1×1 透明 PNG */
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const JPG = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const GIF = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
const WEBP = "data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=";

function fresh() {
  return loadApp();
}
function seedChat(win, msgs) {
  win.eval("chats.office = " + JSON.stringify(msgs) + ";");
}

describe("图片附件 · dataURL 白名单", () => {
  it("放行 png/jpeg/gif/webp 的 base64 内联", () => {
    const win = fresh();
    for (const u of [PNG, JPG, GIF, WEBP]) expect(win.__test._imgDataUrlOk(u)).toBe(true);
  });

  it("拒绝 svg / 非图片 / 非 base64 / 远程 URL / 非字符串", () => {
    const win = fresh();
    const bad = [
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      "data:text/html;base64,PHNjcmlwdD4=",
      "javascript:alert(1)",
      "https://example.com/a.png",
      "data:image/png,rawbytes",
      "",
      null,
      123,
    ];
    for (const u of bad) expect(win.__test._imgDataUrlOk(u)).toBe(false);
  });
});

describe("图片附件 · 发送形态", () => {
  let win;
  beforeEach(() => { win = fresh(); });

  it("文本 + 图片 → content 数组（text 在前，image_url 随后）", () => {
    const c = win.__test._chatUserContent("看图", [PNG]);
    expect(Array.isArray(c)).toBe(true);
    expect(c[0]).toEqual({ type: "text", text: "看图" });
    expect(c[1]).toEqual({ type: "image_url", image_url: { url: PNG } });
  });

  it("只有图片：允许空文本，数组里只有 image_url 部分", () => {
    const c = win.__test._chatUserContent("", [PNG, JPG]);
    expect(c).toHaveLength(2);
    expect(c.every((p) => p.type === "image_url")).toBe(true);
  });

  it("无图 / 图全非法 → 退回纯字符串（旧行为不变）", () => {
    expect(win.__test._chatUserContent("hi", [])).toBe("hi");
    expect(win.__test._chatUserContent("hi", ["javascript:alert(1)"])).toBe("hi");
  });

  it("技能展开只换文本部分，图片必须留着", () => {
    const win2 = fresh();
    const arr = win2.__test._chatUserContent("技能：x", [PNG]);
    const out = win2.__test._withOutboundText(arr, "技能：x\n\n（展开后的完整指令）");
    expect(out[0]).toEqual({ type: "text", text: "技能：x\n\n（展开后的完整指令）" });
    expect(out[1]).toEqual({ type: "image_url", image_url: { url: PNG } });
    expect(win2.__test._withOutboundText("纯文本", "展开")).toBe("展开");
  });
});

describe("图片附件 · 预算口径", () => {
  it("一张图固定计入 _IMG_TOKEN_COST，文本部分照常估算", () => {
    const win = fresh();
    const text = "看图";
    const without = win.__test._msgTokens({ content: [{ type: "text", text }] });
    const withImg = win.__test._msgTokens({ content: [{ type: "text", text }, { type: "image_url", image_url: { url: PNG } }] });
    expect(withImg - without).toBe(win.__test._IMG_TOKEN_COST);
  });
});

describe("图片附件 · 待发条", () => {
  it("最多 3 张；非法 dataURL 不进条；清空复位", () => {
    const win = fresh();
    win.__test._clearPendingImages();
    expect(win.__test._addPendingImage(PNG)).toBe(true);
    expect(win.__test._addPendingImage(JPG)).toBe(true);
    expect(win.__test._addPendingImage(GIF)).toBe(true);
    expect(win.__test._addPendingImage(WEBP)).toBe(false);
    expect(win.__test._addPendingImage("javascript:alert(1)")).toBe(false);
    expect(win.__test.pendingImages()).toHaveLength(3);
    const strip = win.document.getElementById("chatAttachStrip");
    expect(strip.hidden).toBe(false);
    expect(strip.querySelectorAll(".attach-chip img")).toHaveLength(3);
    strip.querySelector(".attach-chip-x").click();
    expect(win.__test.pendingImages()).toHaveLength(2);
    win.__test._clearPendingImages();
    expect(win.__test.pendingImages()).toHaveLength(0);
    expect(strip.hidden).toBe(true);
  });
});

describe("图片附件 · 渲染", () => {
  it("数组消息渲染文本 + 「[图×N]」标记 + DOM 注入缩略图", () => {
    const win = fresh();
    seedChat(win, [{
      role: "user",
      content: [{ type: "text", text: "看这张架构图" }, { type: "image_url", image_url: { url: PNG } }],
    }]);
    win.renderChat();
    const el = win.document.querySelector("#chat");
    expect(el.textContent).toContain("看这张架构图");
    expect(el.textContent).toContain("[图×1]");
    const img = el.querySelector(".msg-imgs img");
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe(PNG);
    expect(img.getAttribute("alt")).toBeTruthy();
  });

  it("恶意 image_url（javascript:/svg）只留槽位，不产生 img 元素", () => {
    const win = fresh();
    seedChat(win, [{
      role: "user",
      content: [
        { type: "text", text: "bad" },
        { type: "image_url", image_url: { url: "javascript:alert(1)" } },
        { type: "image_url", image_url: { url: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" } },
      ],
    }]);
    win.renderChat();
    const el = win.document.querySelector("#chat");
    expect(el.querySelector(".msg-imgs img")).toBeNull();
    expect(el.innerHTML).not.toContain("javascript:alert");
    expect(el.textContent).toContain("bad");
  });
});

describe("图片附件 · 提交与会话镜像", () => {
  it("只有图片也能提交：请求体里是 content 数组；发完清空待发条", async () => {
    const win = fresh();
    await wait(80);
    win.__test._resetCrypto();
    win.localStorage.setItem(win.__test.PREFIX + "cfg", JSON.stringify({
      enabled: true,
      profiles: [{ id: "p1", name: "T", base: "https://api.example.com/v1", key: "sk-test", model: "m" }],
      activeId: "p1",
    }));
    await wait(80);
    win.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ choices: [{ message: { content: "收到" } }] }),
    }));
    expect(win.__test._addPendingImage(PNG)).toBe(true);
    win.eval('document.getElementById("chatTextInput").value = ""; onChatSubmit({ preventDefault(){}, target: { msg: document.getElementById("chatTextInput") } });');
    for (let i = 0; i < 60 && win.fetch.mock.calls.length === 0; i++) await wait(50);
    expect(win.fetch.mock.calls.length).toBeGreaterThan(0);
    const body = JSON.parse(win.fetch.mock.calls[0][1].body);
    const lastUser = body.messages[body.messages.length - 1];
    expect(lastUser.role).toBe("user");
    expect(Array.isArray(lastUser.content)).toBe(true);
    expect(lastUser.content).toEqual([{ type: "image_url", image_url: { url: PNG } }]);
    expect(win.__test.pendingImages()).toHaveLength(0);
  });

  it("会话镜像自动命名：数组 content 不抛 TypeError，标题取文本部分", () => {
    const win = fresh();
    const P = win.__test.PREFIX;
    const ok = win.eval('(function(){' +
      'getSessions();' +
      'var s = getActiveSessionObj();' +
      's.sc = "office"; s.msgs = []; s.title = t("sess.new","新会话");' +
      'try{ _mirrorChatToSession("' + P + 'chat_office", [{ role:"user", content:[{type:"text",text:"看图说话"},{type:"image_url",image_url:{url:"' + PNG + '"}}] }]); }catch(e){ return "THROW:" + e.message; }' +
      'return getActiveSessionObj().title;' +
      '})()');
    expect(String(ok)).not.toContain("THROW");
    expect(ok).toBe("看图说话");
  });
});