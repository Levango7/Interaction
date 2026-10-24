/**
 * danger-prompt.spec.js —— 输入型危险弹层在真浏览器里「看得见、敲得进、点得到」
 * ----------------------------------------------------------------------------
 * 为什么必须有一层真浏览器（vitest/jsdom 那边已经钉过契约字段了）：
 *   ① 骨架同 `.viz-modal`，375×667 有固定底部导航（--z-sidebar:40）——
 *      jsdom 没有排版引擎，`getBoundingClientRect` 恒 0，「被导航栏压住」这类缺陷
 *      在它那里全绿。danger-confirm.spec.js 已经为确认框钉过同一条判据，
 *      输入框共用骨架，必须同样钉住，否则以后改 CSS 只红一边。
 *   ② `input.focus() + input.select()` 的「预选填值」是真实契约：jsdom 的
 *      Selection 模型不实现 select()，改坏了它在这里才红。
 *   ③ Enter 提交 / Esc 取消 / 空值不出错就拦下 —— 键盘路径只有真浏览器能验。
 *
 * 判据可测事实：① 输入框与按钮盒子完整在视口内 ② 二者中心的命中测试就是它自己
 * ③ 预选值等于传入 value ④ 空值 + required → 行内报错出现且弹层不关。
 * 反向对照（别删）：同一趟插一份静态卡片骨架，断言探测器**能**判它不合格 ——
 * 否则"全绿"可能只是尺子坏了。
 */
const { test, expect } = require("./_fixture");

const APP_URL = "./agent-workbench.html";

/** 在页面里真开一次输入弹层，返回几何 / 命中测试 / 预选值 / 报错节点状态 */
const probePrompt = (page, opts) => page.evaluate((o) => {
  window.dangerPrompt(o);
  const wrap = document.getElementById("dangerPromptModal");
  const input = document.getElementById("dangerPromptModalInput");
  const yes = document.getElementById("dangerPromptModalYes");
  const no = document.getElementById("dangerPromptModalNo");
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom),
      left: Math.round(r.left), right: Math.round(r.right) };
  };
  const hitAt = (el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit ? (hit.id || hit.className || hit.tagName).toString().slice(0, 40) : null;
  };
  return {
    inViewport: (() => {
      const b = box(input);
      return b.top >= 0 && b.bottom <= window.innerHeight && b.left >= 0 && b.right <= window.innerWidth;
    })(),
    inputHit: hitAt(input),
    yesBox: box(yes),
    yesHit: hitAt(yes),
    position: getComputedStyle(wrap).position,
    zIndex: getComputedStyle(wrap).zIndex,
    value: input.value,
    selection: (() => { try { return input.selectionEnd - input.selectionStart; } catch (e) { return -1; } })(),
    type: input.type,
    maxLength: input.maxLength,
    errExists: !!document.getElementById("dangerPromptModalErr"),
    title: (document.getElementById("dangerPromptModalTitle") || {}).textContent || "",
    yesText: yes.textContent,
    noText: no.textContent,
    vh: window.innerHeight,
  };
}, opts);

/** 旧骨架的对照样本：静态卡片 —— 探针必须能指出它"整块在视口外" */
const probeLegacySkeleton = (page) => page.evaluate(() => {
  const wrap = document.createElement("div");
  wrap.className = "recycle-modal";
  wrap.id = "legacyProbe";
  wrap.innerHTML = '<div class="recycle-card u-max-w-440">'
    + '<div class="recycle-header"><h2>请输入</h2></div>'
    + '<div><input type="text" id="legacyInput"><button type="button" id="legacyYes">确定</button></div>'
    + '</div>';
  document.body.appendChild(wrap);
  const box = wrap.getBoundingClientRect();
  const out = { position: getComputedStyle(wrap).position,
    top: Math.round(box.top), vh: window.innerHeight,
    outsideViewport: box.top >= window.innerHeight };
  wrap.remove();
  return out;
});

test.describe("窄屏手机（375×667，有固定底部导航）", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("输入框与确定按钮在视口内且能被点中（不被底部导航压住）", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main");
    const got = await probePrompt(page, { title: "重命名会话", value: "旧的会话名", maxlength: 60 });
    expect(got.position, "必须用真浮层骨架").toBe("fixed");
    expect(Number(got.zIndex), "底部导航是 --z-sidebar:40，浮层必须压过它").toBeGreaterThan(40);
    expect(got.inViewport, `输入框盒子 ${JSON.stringify(got.yesBox)} / vh=${got.vh}`).toBe(true);
    expect(got.inputHit, `输入框中心命中被 ${got.inputHit} 抢走`).toBe("dangerPromptModalInput");
    expect(got.yesHit, `确定按钮中心命中被 ${got.yesHit} 抢走`).toBe("dangerPromptModalYes");
  });

  test("反向对照：旧骨架同一条判据必须判红", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main");
    const legacy = await probeLegacySkeleton(page);
    expect(legacy.position, "旧骨架是页面内卡片，不是浮层").toBe("static");
    expect(legacy.outsideViewport,
      `对照样本应整块落在视口外（实测 top=${legacy.top} / vh=${legacy.vh}），否则探测器没射程`)
      .toBe(true);
  });
});

test.describe("桌面（1280×800）· 交互契约", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("预选填值 + maxlength + 密码态 + 默认按钮文案", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main");
    const got = await probePrompt(page, {
      title: "导出密码", value: "s3cret", secret: true, maxlength: 40,
      confirmText: "导出", cancelText: "再想想",
    });
    expect(got.value, "预选值必须回填到输入框").toBe("s3cret");
    expect(got.selection, "预选值必须整段选中，敲字即替换").toBe(6);
    expect(got.type, "secret:true 必须落到密码态，不许明文回显").toBe("password");
    expect(String(got.maxLength)).toBe("40");
    expect(got.title).toBe("导出密码");
    expect(got.yesText).toBe("导出");
    expect(got.noText).toBe("再想想");
    expect(got.errExists, "初始不应有行内报错节点").toBe(false);
  });

  test("空值 + required → 行内报错出现且弹层不关；填值后确定才 resolve", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main");
    const got = await probePrompt(page, { title: "重命名会话" });
    expect(got.value, "无 value 时输入框应为空").toBe("");
    expect(got.title).toBe("重命名会话");

    /* 空值点确定 → 必须拦住：弹层还在，报错节点出现 */
    await page.click("#dangerPromptModalYes");
    const afterEmpty = await page.evaluate(() => ({
      open: !!document.getElementById("dangerPromptModal"),
      err: (document.getElementById("dangerPromptModalErr") || {}).textContent || "",
      value: (document.getElementById("dangerPromptModalInput") || {}).value || "",
    }));
    expect(afterEmpty.open, "空值不许把弹层关掉").toBe(true);
    expect(afterEmpty.err, "必须给出行内报错文案").not.toBe("");
    expect(afterEmpty.value, "被拦下时不许悄悄清空用户已敲的内容").toBe("");

    /* 填值 → 确定 → resolve 出值、弹层关闭、报错节点随之消失 */
    const val = await page.evaluate(async () => {
      const p = window.dangerPrompt({ title: "重命名会话", value: "旧的会话名" });
      const input = document.getElementById("dangerPromptModalInput");
      input.value = "新的会话名";
      document.getElementById("dangerPromptModalYes").click();
      return p;
    });
    expect(val).toBe("新的会话名");
    expect(await page.evaluate(() => !!document.getElementById("dangerPromptModal")),
      "提交后弹层必须关闭").toBe(false);
    expect(await page.evaluate(() => !!document.getElementById("dangerPromptModalErr")),
      "关闭后报错节点必须一并清掉，不许成为下一层的残留").toBe(false);
  });

  test("Enter 提交、Esc 取消（resolve null）", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main");
    const enter = await page.evaluate(async () => {
      const p = window.dangerPrompt({ title: "重命名会话", value: "abc" });
      const input = document.getElementById("dangerPromptModalInput");
      input.focus();
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      return p;
    });
    expect(enter, "Enter 应等同点确定").toBe("abc");

    const esc = await page.evaluate(async () => {
      const p = window.dangerPrompt({ title: "重命名会话", value: "abc" });
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      return p;
    });
    expect(esc, "Esc 应 resolve null 而不是空串（二者语义不同）").toBe(null);
  });

  test("required:false 允许空串通过（清空取值是合法场景）", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main");
    const val = await page.evaluate(async () => {
      const p = window.dangerPrompt({ title: "修改节点文字", value: "旧文字", required: false });
      const input = document.getElementById("dangerPromptModalInput");
      input.value = "";
      document.getElementById("dangerPromptModalYes").click();
      return p;
    });
    expect(val, "required:false 时清空必须原样 resolve，不许被拦也不许转 null").toBe("");
    expect(await page.evaluate(() => !!document.getElementById("dangerPromptModal")),
      "提交后必须关闭").toBe(false);
  });

  test("同一时刻最多一层：后开的弹层把前一个 resolve(null) 并接管 DOM", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main");
    const got = await page.evaluate(async () => {
      const first = window.dangerPrompt({ title: "第一层" });
      const second = window.dangerPrompt({ title: "第二层" });
      const firstResult = await first;
      const nodes = document.querySelectorAll('[id="dangerPromptModal"]').length;
      const title = document.getElementById("dangerPromptModalTitle").textContent;
      document.getElementById("dangerPromptModalNo").click();
      const secondResult = await second;
      return { firstResult, nodes, title, secondResult,
        leftover: !!document.getElementById("dangerPromptModal") };
    });
    expect(got.firstResult, "被顶掉的前一层必须 resolve(null)，不许永远 pending").toBe(null);
    expect(got.nodes, "DOM 里只许有一层输入弹层").toBe(1);
    expect(got.title).toBe("第二层");
    expect(got.secondResult).toBe(null);
    expect(got.leftover, "全部关闭后 DOM 必须干净").toBe(false);
  });

  test("密码态输入框仍是 text 类型可用（secret:false 默认）", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main");
    const got = await probePrompt(page, { title: "请输入视图名" });
    expect(got.type).toBe("text");
  });
});
