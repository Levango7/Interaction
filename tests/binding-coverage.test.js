/**
 * binding-coverage.test.js —— 动态渲染控件的「处理器覆盖」棘轮（P1-6，2026-10-22）
 * ----------------------------------------------------------------------------
 * 为什么不是"覆盖率百分比"：历史上真正咬人的是**渲染出来但没人绑**的按钮（v3.7.86 的日历化石、
 * R-29 的确认框）。静态 id 面已由 `dead-wiring-guard.test.js` 覆盖；真正没被覆盖的是
 * **动态模板渲染**的控件 —— 本文件补这一面。
 *
 * 判据（三种合法绑定形态，**不做祖先无限上溯**，否则一个 body 级委托会让门禁变哑）：
 *   ① 元素自身 `onclick/onchange/oninput/onsubmit/onkeydown` 属性处理器；
 *   ② 元素自身收到过 `addEventListener`（`loadApp({instrument:true})` 记录）；
 *   ③ 3 层以内的祖先收到了 click/change/input 委托；或
 *   ④ 位于有 submit 处理器的 form 内（控件随表单提交生效）；或
 *   ⑤ 携带**已登记的委托动作属性**（ACTION_ATTRS：消费方在 src 里必须真实存在）。
 *
 * 棘轮：`#main` 内 15 个视图渲染出的控件（button / role=button / select / checkbox / radio / textarea），
 * 未覆盖数必须为 **0**；新增一个没绑的控件会立刻红。
 * 射程自检：合成「无绑定控件」必须被判红；四种合法形态各有一个合成样本必须判绿。
 *
 * ⚠️ 已知口径边界：不检查"点了有反应"，只检查"有处理器"。点了没反应（handler 空转）
 * 仍需 e2e / 真浏览器判据，本门禁不冒充。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = fs.readdirSync(path.join(ROOT, "src")).filter((f) => f.endsWith(".js"))
  .map((f) => fs.readFileSync(path.join(ROOT, "src", f), "utf8")).join("\n");

/** 委托动作属性：选中时由 document/容器级 click 处理器消费。消费方必须在 src 里存在（下方自检）。 */
const ACTION_ATTRS = ["data-val", "data-share", "data-f-add", "data-f-del", "data-move", "data-edit", "data-del",
  "data-rdel", "data-rev", "data-store-toggle", "data-store-uninstall", "data-toolbox", "data-tasks-card",
  "data-goto-sc", "data-ov4-goto", "data-empty-action", "data-overview-view", "data-tasks-view",
  "data-chain-tab", "data-ai-tab", "data-recycle-cat", "data-store-cat", "data-toolbox-cat"];

const VIEWS = ["office", "data", "design", "study", "code", "life", "health",
  "overview", "tasks", "chainpage", "timeline", "ai", "toolbox", "store", "recycle"];

const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));

function makeCovered(win) {
  const log = win.__bindLog;
  return (el) => {
    for (const k of ["onclick", "onchange", "oninput", "onsubmit", "onkeydown"]) {
      if (typeof el[k] === "function") return "prop:" + k;
    }
    const own = log && log.get(el);
    if (own && own.length) return "self:" + own.join(",");
    let p = el.parentElement;
    for (let i = 0; p && i < 3; i++, p = p.parentElement) {
      const l = log && log.get(p);
      if (l && (l.includes("click") || l.includes("change") || l.includes("input"))) return "deleg:" + (p.id || p.className || p.tagName);
    }
    /* 表单内控件（submit 按钮、input、select、textarea）随表单 submit 生效 —— 不要求逐个绑事件 */
    const form = el.closest("form");
    if (form) {
      if (typeof form.onsubmit === "function") return "form:onsubmit";
      const fl = log && log.get(form);
      if (fl && fl.includes("submit")) return "form:submit";
    }
    const act = ACTION_ATTRS.find((a) => el.hasAttribute(a));
    if (act) return "action:" + act;
    return null;
  };
}

describe("动态控件处理器覆盖", () => {
  it("登记表本身必须被消费（防「登记了却没人用」）", () => {
    /* 不能只判"字符串出现过"（注释里写一句也算）——必须是可证明的读取形态 */
    const provable = (a) => {
      const camel = a.slice(5).replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
      return [`getAttribute("${a}"`, `getAttribute('${a}'`, `dataset.${camel}`,
        `hasAttribute("${a}"`, `[${a}]`, `["${a}"]`, `['${a}']`].some((p) => SRC.includes(p));
    };
    for (const a of ACTION_ATTRS) {
      expect(provable(a), `ACTION_ATTRS 里的 ${a} 没有可证明的消费方（getAttribute/dataset/closest/hasAttribute）—— 要么删条目，要么消费方丢了`).toBe(true);
    }
    expect(provable("data-no-such-action"), "对照：未登记属性必须判否（否则判据没射程）").toBe(false);
  });

  it("15 个视图渲染出的控件：未覆盖数必须为 0", async () => {
    const win = loadApp({ instrument: true });
    windows.push(win);
    await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
    const covered = makeCovered(win);
    const uncovered = [];
    let total = 0;
    for (const v of VIEWS) {
      win.__test.setActive(v);
      win.__test.render();
      await new Promise((r) => setTimeout(r, 0));
      /* 按钮 + 非按钮控件（role=button / select / checkbox / radio / textarea）都算 */
      const SEL = "#main button, #main [role=button], #main select, #main input[type=checkbox], #main input[type=radio], #main textarea";
      for (const b of win.document.querySelectorAll(SEL)) {
        total++;
        if (!covered(b)) uncovered.push(`${v} | ${b.tagName}#${b.id || "-"} | ${(b.textContent || b.getAttribute("placeholder") || "").trim().slice(0, 20)}`);
      }
    }
    expect(total, "视图没有渲染出控件，说明探针本身失效").toBeGreaterThan(200);
    expect(uncovered, "这些控件渲染出来但没有任何处理器（死控件）：\n  " + uncovered.join("\n  ")).toEqual([]);
  });

  it("射程自检：无绑定控件必须判红，四种合法形态必须判绿", async () => {
    const win = loadApp({ instrument: true });
    windows.push(win);
    await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
    const covered = makeCovered(win);
    const mk = (html) => {
      const d = win.document.createElement("div");
      d.innerHTML = html;
      win.document.body.appendChild(d);
      return d;
    };
    const dead = mk('<button type="button">无绑定</button>').querySelector("button");
    expect(covered(dead), "无绑定按钮必须判红（否则门禁没射程）").toBeNull();

    const prop = mk('<button type="button">属性处理器</button>').querySelector("button");
    prop.onclick = () => {};
    expect(covered(prop)).toBeTruthy();

    const deleg = mk('<div id="delegBox"><button type="button">委托</button></div>');
    deleg.addEventListener("click", () => {});
    expect(covered(deleg.querySelector("button"))).toBeTruthy();

    const form = mk('<form><button type="submit">提交</button></form>').querySelector("form");
    form.onsubmit = () => {};
    expect(covered(form.querySelector("button"))).toBeTruthy();

    const act = mk('<button type="button" data-share="x">分享</button>').querySelector("button");
    expect(covered(act)).toBeTruthy();

    const formField = mk('<form><textarea></textarea></form>').querySelector("form");
    formField.onsubmit = () => {};
    expect(covered(formField.querySelector("textarea")), "表单内控件随 submit 生效").toBeTruthy();

    const orphanSelect = mk('<select><option>x</option></select>').querySelector("select");
    expect(covered(orphanSelect), "不在表单里、又没绑定的 select 必须判红").toBeNull();
  });
});
