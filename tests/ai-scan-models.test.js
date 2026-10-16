/**
 * ai-scan-models.test.js —— 「扫描模型」按钮：把已有能力暴露成正向交互（P0-3）
 * ----------------------------------------------------------------------------
 * 背景（docs/evaluation-product-2026-10-16.md）：`GET {base}/v1/models` 这条链路
 * **早就存在**——「测试连接」一直在用它，还拿它校验「用户填的模型名在不在列表里」。
 * 但它只服务于**校验**：填错了才告诉你错了。用户要的是反过来——填完 base+key，
 * **一键拉出可用模型、下拉挑一个**。
 *
 * 本文件守四件事（判据不挂代理指标，全部走真实 DOM + stub fetch）：
 *   ① 按钮与 datalist 真的被注入到 #cfgModel 旁（不是"应该有"）；
 *   ② 成功路径：stub 返回 N 个模型 → datalist 被填满、且**当前 model 不在列表时自动选第一个**；
 *   ③ **不覆盖用户已填的合法值**（否则是替用户做主）；
 *   ④ 失败路径分情形给**可执行**提示 —— 404 必须说明「可先手填模型名再用测试连接校验」，
 *      401/403 必须点出 Key 问题（这正是评审里"把 hint 做成可执行"的要求）。
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";

/** jsdom 的 .click() 同步派发，而 onclick 是 async —— await click() **不等**它内部
    的 fetch/toast 跑完。第一版全红就是栽在这（实现是对的）。 */
const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));

/** 与现有设置页同款：配一个 active profile（base/key/model 都在表单里）。
    ⚠️ 注意别写成 JSON.stringify(obj, {}) —— 第二个参数是 replacer，会把整个对象清成 "{}"
    （本轮真实踩过：实现是对的，测试却全红，差点去改产品代码）。 */
function withProfile(extra) {
  return loadApp({
    storage: Object.assign({
      [PREFIX + "cfg"]: JSON.stringify({
        enabled: true, base: "https://api.example.com/v1", key: "sk-test", model: "gpt-4o-mini",
        profiles: [{ id: "p1", name: "probe", base: "https://api.example.com/v1", key: "sk-test", model: "gpt-4o-mini" }],
        activeId: "p1",
      }),
    }, extra || {}),
  });
}

/** 用**文档里已有的** `#cfgModel`（drawer 的静态 HTML 就在 agent-workbench.html 里），
    只改它的 value。⚠️ 不要自己再 append 一个新 input：同 id 会有两个元素，
    `$("#cfgModel")` 只会命中静态那个，seed 的那个没人读 —— 本轮真实踩过，
    症状是"用例②碰巧过、③必败"，极易误判成实现 bug。 */
function seedModelInput(win, value) {
  let input = win.document.getElementById("cfgModel");
  if (!input) {
    input = win.document.createElement("input");
    input.id = "cfgModel";
    win.document.body.appendChild(input);
  }
  if (value !== undefined) input.value = value;
  return input;
}

describe("扫描模型：把 /v1/models 从「校验用」暴露成「挑选用」", () => {
  it("① 注入：按钮 + datalist 出现在 #cfgModel 旁，且 input 的 list 指向它", () => {
    const win = withProfile();
    seedModelInput(win, "gpt-4o-mini");
    win.fillProfileForm = () => {};   /* 隔离：不让异步 init 把表单重置成 cfg 的值 */
    win.injectModelScanner();
    expect(win.document.getElementById("cfgScanModels"), "按钮必须被注入").toBeTruthy();
    const dl = win.document.getElementById("cfgModelList");
    expect(dl && dl.tagName, "datalist 必须被注入").toBe("DATALIST");
    expect(win.document.getElementById("cfgModel").getAttribute("list"), "input 必须绑定 list").toBe("cfgModelList");
  });

  it("② 成功：拉到的模型填进 datalist，且当前 model 不在列表时自动选第一个", async () => {
    const win = withProfile();
    seedModelInput(win, "手填的不存在模型");
    const seen = [];
    win.fetch = async (url, opts) => {
      seen.push(String(url));
      return {
        ok: true, status: 200,
        json: async () => ({ data: [{ id: "gpt-4o-mini" }, { id: "gpt-4o" }, { id: "o3-mini" }] }),
      };
    };
    win.fillProfileForm = () => {};   /* 隔离：不让异步 init 把表单重置成 cfg 的值 */
    win.injectModelScanner();
    const toasts = [];
    win.toast = (m) => toasts.push(m);
    await win.document.getElementById("cfgScanModels").click(); await tick();
    expect(seen[0], "必须打 /v1/models").toContain("/v1/models");
    const opts = [...win.document.getElementById("cfgModelList").options].map((o) => o.value);
    expect(opts).toEqual(["gpt-4o-mini", "gpt-4o", "o3-mini"]);
    expect(win.document.getElementById("cfgModel").value, "不在列表里 → 自动选第一个").toBe("gpt-4o-mini");
    expect(toasts.join(" ")).toMatch(/3/);
  });

  it("③ 不覆盖：当前 model 已在列表里时保持原值（不替用户做主）", async () => {
    const win = withProfile();
    seedModelInput(win, "gpt-4o");
    win.fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({ data: [{ id: "gpt-4o-mini" }, { id: "gpt-4o" }] }),
    });
    win.fillProfileForm = () => {};   /* 隔离：不让异步 init 把表单重置成 cfg 的值 */
    win.injectModelScanner();
    await win.document.getElementById("cfgScanModels").click(); await tick();
    expect(win.document.getElementById("cfgModel").value, "合法值不得被覆盖").toBe("gpt-4o");
  });

  it("④ 失败分情形：404 要说「可先手填再用测试连接校验」，401 要点出 Key", async () => {
    const w404 = withProfile();
    seedModelInput(w404, "m");
    w404.fetch = async () => ({ ok: false, status: 404 });
    const t404 = [];
    w404.toast = (m) => t404.push(m);
    w404.injectModelScanner();
    await w404.document.getElementById("cfgScanModels").click(); await tick();
    expect(t404.join(" "), "404 必须给可执行的下一步").toMatch(/测试连接|手填/);

    const w401 = withProfile();
    seedModelInput(w401, "m");
    w401.fetch = async () => ({ ok: false, status: 401 });
    const t401 = [];
    w401.toast = (m) => t401.push(m);
    w401.injectModelScanner();
    await w401.document.getElementById("cfgScanModels").click(); await tick();
    expect(t401.join(" "), "401 必须点出 Key").toMatch(/Key|密钥/i);
  });

  /* ⑤ CI 红的那条（empty-catch 棘轮判 P0）的用例化：解析失败必须**可见**，
     不能吞掉后混进"没返回模型列表"—— 用户看到后者完全不知该往哪查。 */
  it("⑤ 响应不是合法 JSON 时必须明说（不能吞进「没返回模型列表」）", async () => {
    const w = withProfile();
    seedModelInput(w, "m");
    w.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token < in JSON"); } });
    const toasts = [];
    w.toast = (m) => toasts.push(m);
    w.injectModelScanner();
    await w.document.getElementById("cfgScanModels").click();
    await tick();
    expect(toasts.join(" "), "必须点出不是合法 JSON").toMatch(/JSON/i);
    expect(toasts.join(" "), "且给出下一步（检查 Base / 测试连接）").toMatch(/Base|测试连接/);
  });
});
