/**
 * ci-workflow-guard.test.js —— .github/workflows/ 里「会静默谎报成功」的脚本守护
 * ----------------------------------------------------------------------------
 * 背景（v3.7.91 实测）：
 *   electron-build.yml 的「重命名为纯 ASCII」步骤（v3.7.90 加）写成：
 *       set -euo pipefail
 *       shopt -s nullglob
 *       for f in dist/*-portable.exe; do ... done
 *   在**零匹配**时循环零次迭代，`set -e` 也不报错 → 步骤绿、一个文件都没重命名。
 *   本机复刻实测：目录里只放 setup.exe 时该脚本 EXIT=0 且无任何告警。
 *   后果：若 electron-builder 将来因配置变动改了产物名，Release 会重新带出中文名
 *   （被 softprops/action-gh-release 净化为 `Agent.-x.y.z-portable.exe`）而**门禁不红**。
 *
 * 本文件是**静态结构断言**（读 YAML 文本，不执行 workflow、不联网），
 * 用于锁住三类防呆：① 零匹配必须显式报红；② 必须复核终态无非 ASCII 名；
 * ③ 版本解析失败必须显式报红。防止将来有人「简化」脚本把防护删掉。
 *
 * v3.7.93 扩展（deploy.yml 守护）：
 *   ② e2e 门禁不得因上游 job 取消被『被动跳过』绕过（v3.7.92 修，本文件锁住）；
 *   ③ verify 步骤集 ≡ ci.test：缺步 / 多步 / 换序即红，并附合成 YAML 变异自测
 *      （背景：ci.yml 接入 lint:empty-catch 时 deploy.yml 漏接 —— 两处清单靠人工同步）；
 *   ④ 非 main 分支不得发布：触发收敛 [main] + 四 job ref 守卫 + concurrency 加 ref 维度
 *      （背景：workflow_dispatch 无分支过滤，任意分支手动触发可一路发到 gh-pages）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const yml = readFileSync(join(root, ".github/workflows/electron-build.yml"), "utf8");
const dep = readFileSync(join(root, ".github/workflows/deploy.yml"), "utf8");
const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");

/** 抽出「重命名为纯 ASCII」那一步的 run 脚本正文。
 *  注意：文件**上方注释里也出现过「重命名为纯 ASCII 名再上传」**（第 50 行），
 *  直接 indexOf("重命名为纯 ASCII") 会命中注释而非步骤。必须锚定到 `- name:` 行。 */
const _RENAME_STEP_RE = /-\s*name:\s*重命名为纯 ASCII[^\n]*\n([\s\S]*?)(?=\n\s*-\s*name:)/;
function renameStepScript() {
  const m = yml.match(_RENAME_STEP_RE);
  if (!m) throw new Error("electron-build.yml 缺少「重命名为纯 ASCII」步骤");
  return m[1];
}

describe("electron-build.yml ① 产物重命名步骤不得静默通过", () => {
  const script = renameStepScript();

  it("抽取到的确是步骤正文而非上方注释", () => {
    // 锚点自检：正文必须含 run 块特征，且不得是那句注释
    expect(script, "必须抽到 run 脚本正文").toMatch(/set -euo pipefail/);
    expect(script, "不得误抽到上方注释").not.toContain("见其注释。");
  });

  it("零匹配时必须显式报红（先收集数组再判长度，而非裸 for）", () => {
    // 必须把 glob 结果先收进数组，才有「匹配数」可判
    expect(script, "必须把 glob 收进数组以判定匹配数").toMatch(/files=\(dist\/\*-portable\.exe\)/);
    // 零匹配分支必须 exit 1，且用 ::error:: 让 GitHub 标注
    expect(script, "零匹配必须 exit 1").toMatch(/\[ \$\{#files\[@\]\} -eq 0 \][\s\S]*?exit 1/);
    expect(script, "零匹配必须打 ::error:: 注解").toContain("::error::");
    // 防回潮：不得存在「裸 for + 无计数」的写法（那正是静默的根因）
    expect(script, "不得退回裸 for 写法").not.toMatch(/for f in dist\/\*-portable\.exe;\s*do/);
  });

  it("版本号解析失败必须显式报红（不得静默跳过）", () => {
    // 必须精确锁住「解析为空 → exit 1」这一句；否则别的 exit 1 会让断言空转。
    // （变异实测：把该句改成 `continue` 时，宽松正则仍能匹配到终态复核里的 exit 1 → 假绿。）
    expect(script, "解析为空必须走 exit 1").toMatch(
      /\[\s*-n\s+"\$ver"\s*\][^\n]*exit 1/
    );
    expect(script, "解析失败不得改为 continue/跳过").not.toMatch(
      /\[\s*-n\s+"\$ver"\s*\][^\n]*\bcontinue\b/
    );
  });

  it("必须有计数兜底：至少处理了 1 个产物", () => {
    expect(script, "必须维护 renamed 计数").toMatch(/renamed=\$\(\(renamed\+1\)\)/);
    expect(script, "必须断言 renamed >= 1").toMatch(/\[ "\$renamed" -ge 1 \][\s\S]*?exit 1/);
  });

  it("终态复核：dist 下不得残留非 ASCII 文件名的 exe", () => {
    // 这才是本步骤的真正目标——不只是「执行了 mv」，而是「结果确实全是 ASCII」
    expect(script, "必须有非 ASCII 残留检测").toMatch(/grep -q '\[\^ -~\]'/);
    expect(script, "残留时必须 exit 1").toMatch(/grep -q '\[\^ -~\]'[\s\S]*?exit 1/);
  });
});

describe("electron-build.yml ② 上传/发布路径与本步骤自洽", () => {
  it("上传与 Release 都指向 dist/*.exe（重命名后的同一目录）", () => {
    expect(yml, "upload-artifact 路径").toContain("path: electron/dist/*.exe");
    expect(yml, "Release 文件路径").toContain("files: electron/dist/*.exe");
  });

  it("重命名步骤排在上传之前", () => {
    const m = yml.match(_RENAME_STEP_RE);
    const iRename = m ? yml.indexOf(m[0]) : -1;
    const iUpload = yml.indexOf("上传为构建产物");
    const iRelease = yml.indexOf("附加到 Release");
    expect(iRename).toBeGreaterThan(-1);
    expect(iUpload).toBeGreaterThan(iRename, "重命名必须先于上传");
    expect(iRelease).toBeGreaterThan(iRename, "重命名必须先于 Release 附加");
  });
});

/* ===========================================================================
 * 共用解析器（下面 deploy.yml / ci.yml 的结构断言都走这里）
 * ======================================================================== */
/** 抽某 job 的片段（从 `  <name>:` 到下一个同级 job 或文件尾）。
 *  ⚠️ deploy.yml 工作树是 **CRLF**（`.gitattributes` 只保证 blob 归一为 LF），
 *  故行尾必须写成 `\r?\n`，否则 job 名根本匹配不到（首版踩过，报「缺少 job: deploy」）。 */
function jobBlockOf(text, name) {
  const re = new RegExp(`\r?\n  ${name}:\r?\n([\\s\\S]*?)(?=\r?\n  [a-z][\\w-]*:\r?\n|$)`);
  const m = text.match(re);
  if (!m) throw new Error(`YAML 中缺少 job: ${name}`);
  return m[1];
}

/** 抽某 job 里 `if:` 起、到下一个同级 key 之前的完整文本（处理 CRLF 与多行 `>-`）。
 *  ⚠️ 必须锚定**行首缩进**的 `if:`，不能用裸 indexOf("if:")：
 *  job 的注释里就写着「原实现 `if: ...skip != 'true'`」，裸 indexOf 会命中注释（本文件踩过）。 */
function ifBlockOf(text, name) {
  const b = jobBlockOf(text, name).replace(/\r/g, "");
  const m0 = b.match(/\n    if:/);
  if (!m0) throw new Error(`${name} 无行首 if:`);
  const rest = b.slice(m0.index + m0[0].length);
  // 下一个缩进 4 空格的 key（如 runs-on:）即 if 区块结束
  const m = rest.match(/\n    [a-z][\w-]*:/);
  return m ? rest.slice(0, m.index) : rest;
}

/** 抽某 job 里所有 run 步骤的命令文本（按出现顺序）。
 *  支持两种写法：`- run: xxx`（同行）与 `- name:` 换行后 `run: xxx`（e2e 的 Run E2E 如此写）。
 *  多行块（`run: |`）记为占位符 "<multiline-run>"——步骤集 parity 只需感知「此处有一个步骤」，
 *  正文级对比不在本测试射程（真正要守的是「哪一步被删/加了/挪了」）。
 *  ⚠️ 顺手消费块标量正文：否则正文里恰有 `- run:` 字样会被误计
 *  （现有 job 没有这种文本，但写成正确的解析口径更省心）。 */
function runStepsOf(text, job) {
  const lines = jobBlockOf(text, job).replace(/\r/g, "").split("\n");
  const scalar = (v) => (/^[|>]/.test(v) ? "<multiline-run>" : v);
  const runs = [];
  let afterName = false;
  let blockIndent = -1;
  for (const line of lines) {
    const indent = (line.match(/^ */) || [""])[0].length;
    if (blockIndent >= 0) {
      if (line.trim() === "" || indent > blockIndent) continue;
      blockIndent = -1; // 缩进收回 → 块标量结束，本行继续按正常规则处理
    }
    let m = line.match(/^\s*-\s*run:\s*(\S.*?)\s*$/);
    if (m) {
      runs.push(scalar(m[1]));
      if (/^[|>]/.test(m[1])) blockIndent = indent;
      afterName = false;
      continue;
    }
    if (/^\s*-\s*name:/.test(line)) {
      afterName = true;
      continue;
    }
    if (afterName) {
      m = line.match(/^\s*run:\s*(\S.*?)\s*$/);
      if (m) {
        runs.push(scalar(m[1]));
        if (/^[|>]/.test(m[1])) blockIndent = indent;
        afterName = false;
        continue;
      }
      if (/^\s*uses:/.test(line)) afterName = false; // 步骤只能二选一：出现 uses 即不再是本步
    }
  }
  return runs;
}

/** 比较两个 job 的 run 步骤集（③ 与变异自测共用）。
 *  missing = 前者有后者无；extra = 后者有前者无；sameOrder = 逐项同序。 */
function compareJobs(ciText, ciJob, depText, depJob) {
  const ciSteps = runStepsOf(ciText, ciJob);
  const depSteps = runStepsOf(depText, depJob);
  return {
    ciSteps,
    depSteps,
    missing: ciSteps.filter((s) => !depSteps.includes(s)),
    extra: depSteps.filter((s) => !ciSteps.includes(s)),
    sameOrder: JSON.stringify(ciSteps) === JSON.stringify(depSteps),
  };
}

/* ===========================================================================
 * deploy.yml 守护（v3.7.92）
 * 背景（2026-10-05 实测，本机无法复现、由真实 CI 触发）：
 *   deploy.yml 的 e2e 门禁存在一个**被动跳过**缺口：
 *     · 原 e2e job:  needs: [ci-e2e-status] + `if: ...skip != 'true'` 且**无 always()**
 *       注释假设「ci-e2e-status 的 probe 自捕获异常，结论永远不会是 failure」。
 *       但漏掉了「job 本身根本没启动」——GitHub 托管 runner 分配失败时，
 *       ci-e2e-status 的 conclusion=cancelled、steps=[]（实测连续 4 次）。
 *     · 此时 GitHub 默认语义「needs 上游 cancelled → 下游 skipped」会让 e2e **被动跳过**，
 *       而 deploy 的条件 `needs.e2e.result == 'skipped'` 又把任何 skipped 当"已由 CI 覆盖"
 *       → **e2e 门禁被静默绕过**（若此刻 CI 的 e2e 恰好是红的，未验证产物照样上线）。
 *   真值表实测（7 场景）：旧逻辑绕过 1 次（探测被取消 + CI e2e 红），新逻辑 0 次。
 * 本组断言锁住修复，防止回退。
 * ======================================================================== */
describe("deploy.yml ② e2e 门禁不得因上游 job 取消而被『被动跳过』绕过", () => {
  it("e2e job 必须有 always()（否则上游 cancelled 会连带跳过它）", () => {
    const ifBlock = ifBlockOf(dep, "e2e");
    expect(ifBlock, "e2e 的 if 必须含 always()").toContain("always()");
  });

  it("e2e 跳过条件必须显式绑定『上游 success 且 skip=true』", () => {
    const ifBlock = ifBlockOf(dep, "e2e");
    expect(ifBlock, "必须检查 ci-e2e-status.result == 'success'").toMatch(/needs\.ci-e2e-status\.result\s*==\s*'success'/);
    expect(ifBlock, "必须检查 outputs.skip == 'true'").toMatch(/outputs\.skip\s*==\s*'true'/);
    // 负向：不得退回「只看 outputs.skip != 'true'」的旧写法
    expect(ifBlock, "不得退回不检查上游结论的旧写法").not.toMatch(/needs\.ci-e2e-status\.outputs\.skip\s*!=\s*'true'/);
  });

  it("deploy job 的 needs 必须包含 ci-e2e-status（否则无法区分两种 skipped）", () => {
    const b = jobBlockOf(dep, "deploy").replace(/\r/g, "");
    // 注意：jobBlockOf 从 `deploy:\n` 之后起，首行即 `    needs: [...]`，无前导 \n → 用 (?:^|\n)
    const needsLine = (b.match(/(?:^|\n)\s*needs:\s*(.+)/) || [])[1] || "";
    expect(needsLine, "必须依赖 ci-e2e-status").toContain("ci-e2e-status");
    expect(needsLine, "仍须依赖 verify").toContain("verify");
    expect(needsLine, "仍须依赖 e2e").toContain("e2e");
  });

  it("deploy 放行 skipped 时必须同时校验上游 ci-e2e-status 成功且 skip=true", () => {
    const ifBlock = ifBlockOf(dep, "deploy");
    expect(ifBlock, "verify 必须 success").toMatch(/needs\.verify\.result\s*==\s*'success'/);
    expect(ifBlock, "e2e 允许 success").toMatch(/needs\.e2e\.result\s*==\s*'success'/);
    // 关键：skipped 分支必须附带 ci-e2e-status 的结论校验
    expect(ifBlock, "skipped 分支必须校验 ci-e2e-status.result").toMatch(/needs\.ci-e2e-status\.result\s*==\s*'success'/);
    expect(ifBlock, "skipped 分支必须校验 outputs.skip == 'true'").toMatch(/outputs\.skip\s*==\s*'true'/);
    // 负向：不得是「裸的 e2e.result == 'skipped' 即放行」
    const bareSkipRe = new RegExp("\\|\\|\\s*needs\\.e2e\\.result\\s*==\\s*'skipped'\\s*\\)");
    expect(ifBlock, "不得裸用 e2e.result == 'skipped' 放行").not.toMatch(bareSkipRe);
  });

  it("deploy job 仍有 always()（上游 skipped 时不被默认跳过）", () => {
    const ifBlock = ifBlockOf(dep, "deploy");
    expect(ifBlock, "deploy 必须保留 always()").toContain("always()");
  });
});

/* ===========================================================================
 * deploy.yml 守护 · 步骤集 parity（v3.7.93）
 * 背景（本批修复的真缺口，P1-1a）：
 *   ci.yml:69 接入 lint:empty-catch（v3.7.87）时**只改了 ci.yml** ——
 *   deploy.yml 的 verify 漏接，于是「新增 P0 空 catch 会被 CI 拦下，
 *   但 deploy 链无人把守 → 仍可能上线」。与 v3.7.70（src:check 漏接）同型：
 *   两处门禁清单靠人工同步，必有一次会漂。
 * 本组断言把「漂移」拦在提交前：verify 的 run 步骤集必须与 ci.test **逐项同序**。
 *   （只比 run 步骤：uses 步骤是基建差异，不构成质量门禁清单。）
 * ======================================================================== */
describe("deploy.yml ③ verify 步骤集 ≡ ci.yml test（缺步/多步/换序即红）", () => {
  const r = compareJobs(ci, "test", dep, "verify");

  it("解析器哨兵：两边的关键步骤必须被解析出来（防解析失灵引起的假绿）", () => {
    expect(r.ciSteps, "ci.test 必须解析出 lint:empty-catch").toContain("npm run lint:empty-catch");
    expect(r.depSteps, "deploy.verify 必须解析出 lint:empty-catch（P1-1a 的修复本体）").toContain("npm run lint:empty-catch");
    expect(r.ciSteps.length, "步骤数明显不足说明解析器漏抽").toBeGreaterThanOrEqual(10);
    expect(r.depSteps.length, "步骤数明显不足说明解析器漏抽").toBeGreaterThanOrEqual(10);
  });

  it("解析器覆盖 name 换行式步骤（e2e 的 Run E2E 是这种写法）", () => {
    const y = [
      "jobs:",
      "  e2e:",
      "    steps:",
      "      - name: Run E2E (full user flow)",
      "        run: npm run e2e",
      "        timeout-minutes: 10",
    ].join("\n");
    expect(runStepsOf(y, "e2e")).toEqual(["npm run e2e"]);
  });

  it("不得缺步：ci.test 的每一步 deploy.verify 都要有", () => {
    expect(r.missing, "以下步骤 ci.yml 有而 deploy.yml 缺（应补进 verify）：" + r.missing.join(" / ")).toEqual([]);
  });

  it("不得多步：多出的步骤须显式登记豁免（防「悄悄加一处不同口径的门禁」）", () => {
    const ALLOW_DEPLOY_ONLY = []; // 目前两边逐项一致；将来确有 deploy 专有步骤时在此登记并写明理由
    const unexpected = r.extra.filter((s) => !ALLOW_DEPLOY_ONLY.includes(s));
    expect(unexpected, "以下步骤只在 deploy.yml 有且未登记：" + unexpected.join(" / ")).toEqual([]);
  });

  it("顺序一致：换序同样即红（如 check:source-state 必须在 pre 钩子之前）", () => {
    expect(r.depSteps, "步骤顺序必须与 ci.test 逐项一致").toEqual(r.ciSteps);
  });

  it("e2e job 两边也逐项一致", () => {
    const a = runStepsOf(ci, "e2e");
    const b = runStepsOf(dep, "e2e");
    expect(a, "解析器必须抽到 name 换行式的 Run E2E 步骤（否则下面的等式恒真）").toContain("npm run e2e");
    expect(b).toEqual(a);
  });
});

/* ---------------------------------------------------------------------------
 * ③ 的变异自测：用合成 YAML 证明「漂移确实会被抓住」。
 * 为什么必须有：本文件全部断言都是**结构匹配**——「全绿」也可能是因为
 * 抽取器什么都没抽到（negative 断言在空集上恒真，本仓有前科）。
 * 故同时给出：红的三向变异（缺步/多步/换序）+ 一个必须全绿的正控（防恒红）。
 * ------------------------------------------------------------------------- */
describe("deploy.yml ③-mutation 合成 YAML 自测（证明断言不是装饰）", () => {
  const FULL = [
    "npm run check:source-state",
    "npm run src:check",
    "npm run check:modules",
    "npm run check:ai-tools-doc",
    "npm ci",
    "npm test",
    "npm run build:check",
    "npm run lint",
    "npm run lint:layers",
    "npm run lint:tokens",
    "npm run lint:empty-catch",
    "npm run check:pwa-icons",
    "npm run pet:check",
  ];
  const mk = (runs) =>
    [
      "name: X",
      "on:",
      "  push:",
      "    branches: [main]",
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      ...runs.map((r) => "      - run: " + r),
      "  verify:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      ...runs.map((r) => "      - run: " + r),
    ].join("\n");

  it("正控：完全一致必须全绿（否则下面三向变异是恒红噪声）", () => {
    const r = compareJobs(mk(FULL), "test", mk(FULL), "verify");
    expect(r.missing).toEqual([]);
    expect(r.extra).toEqual([]);
    expect(r.sameOrder).toBe(true);
    expect(r.ciSteps.length).toBe(FULL.length);
  });

  it("变异·缺步：P1-1a 回放（verify 少 lint:empty-catch）→ missing 点名该步", () => {
    const mutated = FULL.filter((s) => s !== "npm run lint:empty-catch");
    const r = compareJobs(mk(FULL), "test", mk(mutated), "verify");
    expect(r.missing).toEqual(["npm run lint:empty-catch"]);
    expect(r.sameOrder).toBe(false);
  });

  it("变异·多步：verify 多一步 → extra 点名", () => {
    const r = compareJobs(mk(FULL), "test", mk([...FULL, "npm run extra-gate"]), "verify");
    expect(r.missing).toEqual([]);
    expect(r.extra).toEqual(["npm run extra-gate"]);
    expect(r.sameOrder).toBe(false);
  });

  it("变异·换序：集合相同但顺序不同 → missing/extra 为空、sameOrder=false（换序单独可检出）", () => {
    const swapped = [...FULL];
    [swapped[9], swapped[10]] = [swapped[10], swapped[9]]; // lint:tokens ↔ lint:empty-catch
    const r = compareJobs(mk(FULL), "test", mk(swapped), "verify");
    expect(r.missing).toEqual([]);
    expect(r.extra).toEqual([]);
    expect(r.sameOrder).toBe(false);
  });
});

/* ===========================================================================
 * deploy.yml 守护 · 非 main 不得发布（v3.7.93，P1-1b）
 * 背景：workflow_dispatch 没有分支过滤 —— 此前在**任意分支**手动触发 Deploy，
 *   四个 job 均无 ref 守卫，可一路 build:prod → peaceiris/actions-gh-pages
 *   把非 main 代码发布到线上 gh-pages。
 * 修法：① 触发列表收敛为 [main]；② 四个 job 各自写 `if: github.ref == 'refs/heads/main'`
 *   （fail-closed：守卫不成立 → skipped → deploy 的 needs.verify 条件不成立 → 不发布）；
 *   ③ concurrency group 并入 ${{ github.ref }}（否则被拦成「全 skipped」的分支 run
 *   仍会进入同组，把在途 main 部署 cancel 掉 —— 守卫挡得住发布，挡不住 cancel）。
 * ======================================================================== */
describe("deploy.yml ④ 非 main 分支不得发布（ref 守卫 + 触发收敛）", () => {
  it("push 触发必须仅 [main]（master 系已无远端分支，收敛防误触发）", () => {
    expect(dep, "push.branches 必须恰为 [main]").toMatch(/push:\s*\r?\n\s*branches:\s*\[main\]/);
    expect(dep, "不得退回 [main, master]").not.toMatch(/branches:\s*\[main,\s*master\]/);
  });

  it("四个 job 都带 main-only 守卫", () => {
    for (const job of ["ci-e2e-status", "verify", "e2e", "deploy"]) {
      const ifBlock = ifBlockOf(dep, job);
      expect(ifBlock, `${job} 的 if 必须含 github.ref == 'refs/heads/main'`).toContain("github.ref == 'refs/heads/main'");
    }
  });

  it("e2e 的 ref 守卫必须与 always() 并存（v3.7.92 防被动跳过 + 本版防非 main）", () => {
    const ifBlock = ifBlockOf(dep, "e2e");
    expect(ifBlock).toContain("always()");
    expect(ifBlock).toContain("github.ref == 'refs/heads/main'");
  });

  it("concurrency group 必须带 ${{ github.ref }}（非 main run 不得取消在途 main 部署）", () => {
    expect(dep, "group 必须并入 ref 维度").toMatch(/group:\s*pages-deploy-\$\{\{\s*github\.ref\s*\}\}/);
  });
});
