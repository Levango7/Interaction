# visual-regression-template —— 跨项目可复用的视觉回归模板

把一个项目的「视觉守护」变成**可复制的模板**：先在一个项目（Interaction）落地验证，
再整目录复制到其余前端项目。设计出处：`docs/visual-regression-template.md`（2026-10-12）。

## 一、先分清两类「视觉守护」（选型错了全盘皆输）

| | 渲染层不变量（本模板主力） | 像素基线比对（可选插件，CI-only） |
|---|---|---|
| 判据 | 对比度 / 可见性 / 溢出（数值） | `toHaveScreenshot` 逐像素 diff |
| 本机 | 可跑，结果与 CI 一致 | 不可跑（字体渲染不可比） |
| 抓什么 | 「字看不见了 / 控件消失 / 横向溢出」 | 「整体视觉被无意改动」 |
| 维护成本 | 低（无基线文件） | 中（基线 PNG + PR 人眼 review） |
| 启用条件 | 默认就有 | 设计系统定型 + 愿意维护基线（见 `baselines/README.md`） |

**核心判断：主推渲染层不变量模板化；像素基线做成 CI-only 可选插件。**
前者任何环境结果确定，是 80% 的价值所在；后者本机与 CI 不可比，只能进 CI、谨慎启用。

## 二、5 分钟接入指南

前置：项目已装 Node 18+。模板与 `@playwright/test` 1.62 同口径验证（Interaction pilot）。

```bash
# 1) 复制整个模板到项目根（目录名保持不变，config 按相对路径定位项目根）
cp -r visual-regression-template/ <你的项目根>/

# 2) 装 Playwright（已装则跳过）
npm i -D @playwright/test
npx playwright install chromium

# 3) 改三个项目特定文件（适配层，其余文件不用动）
#    a. helpers/theme-list.cjs         —— 主题 id 清单（含默认态与属性名）
#    b. helpers/contrast-pairs.cjs     —— 关键前景/背景令牌配对
#    c. helpers/contrast-baseline.cjs  —— 每主题每配对的实测基线（首轮可留空 {}）

# 4) 指定入口页面（默认 agent-workbench.html；带路径时相对项目根）
#    bash：       export VISUAL_APP_ENTRY=index.html
#    PowerShell：$env:VISUAL_APP_ENTRY="index.html"

# 5) 跑
npx playwright test --config=visual-regression-template/playwright.config.visual.cjs
```

第 5 步期望：3 条用例全 ok（主题生效 / 对比度基线 / 可见性与溢出）。
实测值落 `_probe/contrast-matrix.txt` —— 请确保该目录不入库（Interaction 的
`.gitignore` 已含 `_probe/`；其他项目自行加一行，或改 spec 里 `dumpReport` 的 dir）。

双态架构项目（HTML 分源码态/交付态，如 Interaction）：跑完**自动抽回源码态，无需任何
手动操作**（globalTeardown 桥只抽回本轮自己拼回的状态；标记文件在 `verify-out/`，
机制见决策记录 6）。

**首轮定基线**（新项目，第 3 步 c 留空 {} 时）：第 5 步会失败，但失败信息里带每项的
实测值与建议基线（实测值 × 0.9），同时 `_probe/contrast-matrix.txt` 有全量数据
（用例先落盘后断言，失败也有数据）。抄进去，重跑至全绿。

**入口在子目录 / 需要先起服务**：把 `playwright.config.visual.cjs` 里 `use.baseURL`
改成你的地址（默认是 file:// 直加载项目根，沿袭 Interaction 单文件架构）。

## 三、目录结构与文件职责

```
visual-regression-template/
├── README.md                      # 本文件：选型 + 接入 + 决策记录
├── playwright.config.visual.cjs   # 独立 config：只收 specs/**/*.visual.spec.js
├── specs/
│   └── contrast-matrix.visual.spec.js   # 示范 spec：主题 × 对比度矩阵（pilot：Interaction）
├── helpers/
│   ├── theme-list.cjs             # 【适配层】主题清单
│   ├── contrast-pairs.cjs         # 【适配层】关键前景/背景配对
│   ├── contrast-baseline.cjs      # 【适配层】对比度阈值表（实测定基线）
│   ├── measure.cjs                # 统一测量出口（薄封装，spec 只 require 它）
│   ├── visual-global-setup.cjs    # globalSetup 桥：拼回 + 写标记（非双态项目空转）
│   ├── visual-global-teardown.cjs # globalTeardown 桥：有标记才抽回，失败大声报
│   └── visual-kit/                # 内置内核副本（4 文件，见「内核同步」）
│       ├── contrast.js            #   WCAG 对比度计算（页面上下文注入）
│       ├── measure.js             #   applyTheme / readTokens / readPairs / checkOverflow / checkVisible
│       ├── report.js              #   实测值落盘（_probe/，不入库）
│       └── index.js               #   内核统一出口
├── baselines/
│   └── README.md                  # 像素基线可选插件：何时启用 / 如何更新 / 为何 CI-only
└── ci/
    └── visual-regression.yml.example  # 独立 CI job 示例（.example 后缀 = 惰性不激活）
```

除标注【适配层】的三个文件与 spec 内的适配点外，其余文件跨项目**原样复制**即可。

注意：`baselines/` 目录名可能被仓库 `.gitignore` 里的 `baseline*` 模式误伤
（Interaction 即如此，.gitignore:22）—— 文件在盘上但 git 不跟踪。首次提交用
`git add -f visual-regression-template/baselines/README.md`（一次性，入库后即正常
跟踪，后续改动无需 -f）。复制到其他项目时先 `git check-ignore -v
visual-regression-template/baselines/README.md` 确认是否被忽略。

## 四、决策记录（为什么这么设计）

### 1. 内核「内置副本」而不是 require 上游

模板要能复制到其他项目，不能 `require` Interaction 仓内的 `tests/e2e/visual-kit`。
因此 `helpers/visual-kit/` 内置一份内核副本（4 个文件，各文件头部注明来源）。
**唯一真相源在模板内**；Interaction 的 `tests/e2e/visual-kit/` 是其上游原型，
同步方式 = 整文件复制 + 等价性验证（见「内核同步」）。
Interaction 自己的 `tests/e2e/theme-matrix.spec.js` **不改**（总监确认的边界）——
它继续 require 上游内核；模板 spec require 内置副本。两条线行为等价（同源代码）。

### 2. 对比度阈值「实测定基线」，不照抄 4.5:1

阈值 = `max(ABS_FLOOR=1.5, 基线 × TOLERANCE=0.9)`：允许 10% 抖动，退步超过一成就红。
直接断言 WCAG 4.5:1 会在「现状本就低于理想值」时造成基线红，把真正的新回归淹没在
一直红里。先用实测定基线抓退步；理想值由设计侧单独推动（Interaction 的做法是把
低于 4.5 的配对列成「低对比度清单」只记录不阻断，见 theme-matrix.spec.js）。
调基线纪律：只允许因实测确认的配色改版调整，且必须在提交信息说明原因；
**为了变绿而下调 = 把门拆了再通过，属测试作弊**。

### 3. 像素基线 CI-only，且默认不启用

理由见 `baselines/README.md` 与本文第一节。模板只带机制说明与 CI job 示例，
不附带任何基线 PNG —— 没有契约定型的项目开像素基线，只会得到一份没人 review 的快照垃圾。

### 4. CommonJS（.cjs / .js + require），不用 ESM

项目 playwright.config 走 require；ESM 会触发 `MODULE_TYPELESS_PACKAGE_JSON`
警告且 Node CJS 解析器不认 `export`。新增文件一律沿用 CommonJS，与内核一致。

### 5. spec 不设 `E2E=1` 守卫

主 e2e（tests/e2e/）的 spec 用 `test.skip(!process.env.E2E)` 控制默认跳过，
因为主 config 会被 `npm run e2e` 整批跑。本模板有独立 config、只会被显式调用，
加守卫反而让「跑了一次全 skip」被误读为通过。若把本模板 spec 并入某项目的整批
e2e 跑，请自行加回守卫。

### 6. 双态项目的拼回/抽回由模板内置闭环（标记文件协议）

双态架构项目（HTML 分源码态/交付态，如 Interaction）跑 e2e 前必须拼回，否则应用 JS
不在页面里、用例批量假红；跑完若不抽回，工作区停留在拼回态，违反「提交前必须源码态」
「拼回态禁跑 npm test / lint」两条铁律。模板把这件事做成闭环，不靠使用者记性：

- setup 桥（`helpers/visual-global-setup.cjs`）：调用项目自己的拼回钩子，
  **仅当本轮真的发生「源码态 → 交付态」跃迁时**写标记文件 `verify-out/.visual-injected`；
- teardown 桥（`helpers/visual-global-teardown.cjs`）：读到标记才按仓库文档链顺序抽回
  （`pet-art --extract` 然后 `src-split --extract --no-backup`），读完即删；
  无标记静默跳过（非双态项目 / 用户本就交付态 / 上轮已抽回）；
- 只用标记文件、不用模块级变量：Playwright 的 globalSetup/globalTeardown 不保证同进程；
- 只还原自己改的状态：用户本就停留在交付态时不写标记，teardown 不动他的工作区；
- 抽回失败大声 `console.error` 并给出人话指引（「请手动 npm run src:extract」），禁止静默；
- 陈旧标记（上轮 teardown 没跑成，如被 globalTimeout 杀掉）在下一轮被消费并抽回 ——
  有意的恢复语义，源码态是仓库的提交常态；
- 非双态项目两个桥整体空转，零配置。

## 五、项目适配层怎么改

换项目时只动三处：

1. `helpers/theme-list.cjs` —— 主题 id 清单 + 应用属性名 + 默认态主题。
   **主题口径**：填「可独立应用的主题」。以 Interaction 为例：PRESET_THEMES 注册表
   10 键 = light（默认态，无属性）+ 9 个 `data-theme` 主题；下拉里第 11 项是
   system（跟随 OS 偏好），无法确定性强断言，不进清单。
2. `helpers/contrast-pairs.cjs` —— 关键前景/背景令牌配对（选配原则见文件头注释）。
3. `helpers/contrast-baseline.cjs` —— 键集合必须与上面两张表严格一致；
   首轮留空 {}，按「首轮定基线」流程补。

spec 内还有三个适配点（文件头部注释有标注）：入口页面（`VISUAL_APP_ENTRY` 环境
变量，一般不用改代码）、引导浮层 fixture（无引导浮层的项目删掉 addInitScript 块）、
核心控件选择器（`.topbar` / `#side` / `#main` / `#side .nav-item` 换成项目骨架）。

## 六、内核同步（Interaction 上游 ↔ 模板副本）

上游更新（`tests/e2e/visual-kit/`）后，把 4 个文件整文件复制到
`helpers/visual-kit/`，然后做等价性验证：

```bash
# ① 行为代码（剥掉注释行）必须一致
for f in contrast.js measure.js report.js index.js; do
  diff <(grep -v '^\s*\*\|^\s*/\*\*\|^\s*\*/' tests/e2e/visual-kit/$f) \
       <(grep -v '^\s*\*\|^\s*/\*\*\|^\s*\*/' visual-regression-template/helpers/visual-kit/$f) \
    && echo "$f 等价" || echo "$f 有实质差异，需逐行审查"
done

# ② 模板副本可加载、可跑（任选一个项目实例）
node -e "require('./visual-regression-template/helpers/measure.cjs'); console.log('kernel loadable')"
```

注意：模板副本的注释里**不许出现 emoji**（P0 规则：emoji 不得作为功能图标，
代码注释一并规避，防止扫描误报）；上游若新增 emoji 注释，复制时替换为纯文本，
并在提交信息说明。除注释外零差异是硬要求。

## 七、CI 接入

`ci/visual-regression.yml.example` 是独立 job 示例（`.example` 后缀保证惰性）。
**为什么不在 Interaction 激活**：主 e2e job（`.github/workflows/ci.yml` 的 e2e）
已覆盖 theme-matrix 渲染层守护，再开一个 visual job 是重复跑同一批 chromium 用例；
且视觉回归的合理触发节奏是「可能影响视觉的改动才跑」（示例里的 paths 即此意图）。
其他项目激活方式：复制为 `.github/workflows/visual-regression.yml`，按需改 paths
与 Node 版本；没有双态架构的项目无需任何额外配置（globalSetup 自动跳过）。

## 八、Pilot 记录（Interaction）

本模板已在 Interaction（版本基线 v3.7.122；内核上游 `tests/e2e/visual-kit/` 自
v3.7.121 / `e623188` 起接入 theme-matrix）落地验证：

- 用模板自带 config 实跑 `specs/contrast-matrix.visual.spec.js`，3 条用例全 ok
  （exit=0，18.7s）；隔离目录按本 README 步骤干跑同样 3 ok（exit=0，17.5s），
  同时验证位置无关性与 globalSetup 回退分支；
- 主题清单 / 配对 / 基线表与 `tests/e2e/theme-matrix.spec.js` 同源同值；
- 实测对比度与基线逐位一致；pilot 实跑输出与判定过程见当次交付的质量报告
  （测试工程师「严过关」产出，证据存本地 `verify-out/visual-template/`，不入库）；
- 双态闭环（拼回 + 跑完自动抽回）已实测：跑完不执行任何手动命令，
  `check-source-state` 即 exit 0、`git status` 无 `M agent-workbench.html`；
  并做过 teardown 判反的缺陷复现反证（判反后重跑确实滞留拼回态，还原后恢复全绿）。

## 九、边界与纪律

**明确不做**（引自设计方案）：

- 不做通用「任意页面截图」—— 那是 tester-army / e2e 的领域（自然语言驱动），
  且需要模型订阅，不适合做门禁；
- 不做像素基线的**本机**比对（字体差异不可比，做了就是 flaky 源）；
- 不替换各项目已有的功能 e2e（那是另一层，本模板只补视觉层）。

**模板自身遵守的 P0 规则**（消费者请保持）：

- 禁 emoji 作为功能图标（代码注释一并规避，防扫描误报）；
- 禁紫色→粉色渐变主视觉；
- 禁空洞占位文案（"Welcome to" / "Lorem ipsum" 类）；
- 禁硬编码颜色值（唯一例外 `#fff` / `#000`）—— spec 一律走 token / getComputedStyle；
- 禁弹跳缓动。
