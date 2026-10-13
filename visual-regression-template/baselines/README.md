# baselines/ —— 像素基线插件（可选，CI-only）

本目录默认是**空插件**：模板不附带任何基线 PNG，也不默认启用像素比对。
渲染层不变量（对比度 / 可见性 / 溢出）是主力视觉守护；像素基线只在特定条件下才有净收益，
因此做成「需要才开」的可选插件。

## 何时启用

三条同时满足才值得开：

1. 项目的视觉契约已定型（设计系统不再大改）—— 否则基线更新频率会淹没 PR；
2. 团队愿意在 PR 里 review PNG diff（基线变更 = 视觉变更，必须人眼确认）；
3. CI 镜像固定（同一 chromium + 同一字体栈），且接受「本机永不跑像素比对」。

## 为什么 CI-only

`toHaveScreenshot` 是逐像素比对：字体微纹、抗锯齿、子像素布局都能让结果漂移。
本机（Windows / 任意桌面）与 CI（Linux 容器）的渲染栈不同，同一份代码两张图不同 ——
本机跑像素 diff 就是 flaky 源。因此 spec 顶部用 `test.skip(!process.env.CI)` 强制
CI-only；判据以 CI 为准，本机只看渲染层不变量。

## 如何启用（三步）

1. 在 `specs/` 加一个 `*.visual.spec.js`（模板 config 的 testMatch 只收此后缀），例如：

```js
const { test, expect } = require("@playwright/test");

// 本机永远跳过：字体渲染不可比，像素基线只在同镜像 CI 上判定
test.skip(!process.env.CI, "pixel baseline is CI-only");

test("首页像素基线", async ({ page }) => {
  await page.goto("./");
  await expect(page).toHaveScreenshot("home.png", { maxDiffPixels: 100 });
});
```

2. 首跑记录基线（CI 上）：

```
npx playwright test --config=visual-regression-template/playwright.config.visual.cjs --update-snapshots=missing
```

   把生成的 `baselines/**/*-snapshots/*.png` 提交入库（本目录就是放它们的地方）。

3. 之后每次 PR 自动比对。有意的视觉变更：删掉对应基线 PNG，重跑上面命令，
   在 PR diff 里 review 新图后提交。

## 更新基线的纪律

- 阈值用 `maxDiffPixels` 容错（不用 0），量级按页面复杂度自定；
- 基线变更必须伴随「为什么变」的说明（commit message / PR 描述），不许静默 update；
- 基线文件**只增不改**，除非是有意的视觉变更 —— 悄悄重刷基线 = 把回归保护反向利用，
  属测试作弊（反作弊规范：修改快照/golden 文件默认判定为可疑）。

## 与渲染层不变量的分工

| | 渲染层不变量（主力，模板默认） | 像素基线（本插件，可选） |
|---|---|---|
| 判据 | 对比度 / 可见性 / 溢出（数值） | 逐像素 diff |
| 本机 | 可跑，结果确定 | 不可跑（字体不可比） |
| CI | 可跑 | 可跑 |
| 抓什么 | 「字看不见了 / 溢出 / 控件消失」 | 「整体视觉被无意改动」 |
| 维护成本 | 低（无基线文件） | 中（基线 PNG + 人工 review） |
