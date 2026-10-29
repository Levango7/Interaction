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

/** 抽某 job 里所有 `actions/upload-artifact` 步骤的结构化视图
 *  （B10 起用于判「e2e 失败现场有没有带出 CI」）。
 *  ⚠️ 必须跳过注释行：ci.yml 的 e2e 注释里原话就写着「此前 0 个 upload-artifact」，
 *  裸 `includes("upload-artifact")` 会命中注释 ⇒ 断言在**没有真步骤**的情况下也成立
 *  （本文件对 `if:` 踩过同一次，见 `ifBlockOf` 的注释）。
 *  ⚠️ 必须按**缩进分两层**：步骤级 `- name:` 与 `with:` 里的 `name:` 同名，
 *  只按 key 匹配会把工件名当成步骤名（将来读 `artifact` 就会拿到 undefined 或错值）。
 *  分层用「key 起始列」而非「行缩进」：YAML 里 `- name:` 的 `- ` 占两列，后续同级键
 *  （`if:` / `uses:` / `with:`）与 `name` 同列 —— 若拿行缩进比，它们会被误判成 `with:` 参数
 *  （这条是本文件第一版自测就红出来、写在这儿防回潮的）。
 *  口径：`- ` 开新步骤并记下其 key 列；key 列更深的行归为该步骤的 `with:` 参数；
 *  `path:` 支持行内值与 `|`/`>` 块（块写法是真能出现的 YAML，抽取器若因此返回空 ⇒ 假红，
 *  故下面用合成样本把两种写法都验过，不在空集上恒真）。 */
function uploadStepsOf(text, job) {
  const steps = [];
  let cur = null;
  let stepKeyCol = 0;
  let pathBlock = false;
  let lineNo = -1;
  const flush = () => {
    if (cur && /actions\/upload-artifact/.test(cur.uses || "")) steps.push(cur);
    cur = null;
    pathBlock = false;
  };
  for (const raw of jobBlockOf(text, job).replace(/\r/g, "").split("\n")) {
    lineNo++;
    const t = raw.trim();
    if (t === "" || t.startsWith("#")) continue;
    const indent = raw.length - raw.replace(/^\s+/, "").length;
    const dash = (t.match(/^-\s+/) || [""])[0].length;
    const keyCol = indent + dash;
    if (dash > 0) {
      flush();
      cur = { at: lineNo };
      stepKeyCol = keyCol;
      pathBlock = false;
    }
    if (!cur) continue;
    const key = t.slice(dash);
    const nested = keyCol > stepKeyCol;
    if (nested) {
      // `with:` 的参数层
      if (pathBlock) {
        if (/^[\w-]+:/.test(key)) {
          pathBlock = false; // 新的 key ⇒ 块结束
        } else {
          cur.path = (cur.path ? cur.path + " " : "") + key;
          continue;
        }
      }
      let m = key.match(/^name:\s*(\S.*?)\s*$/);
      if (m) { cur.artifact = m[1]; continue; }
      m = key.match(/^path:\s*(.*)$/);
      if (m) {
        if (/^[|>]/.test(m[1].trim())) { pathBlock = true; cur.path = ""; }
        else cur.path = m[1].trim();
        continue;
      }
      continue;
    }
    let m = key.match(/^name:\s*(\S.*?)\s*$/);
    if (m) { cur.name = m[1]; continue; }
    m = key.match(/^uses:\s*(\S.*?)\s*$/);
    if (m) { cur.uses = m[1]; continue; }
    m = key.match(/^if:\s*(\S.*?)\s*$/);
    if (m) { cur.ifLine = m[1]; continue; }
  }
  flush();
  return steps;
}

/** 找某 job 里「path 覆盖 test-results」的那条上传步骤（没有就返回 undefined）。 */
function evidenceStepOf(text, job) {
  return uploadStepsOf(text, job).find((s) => /test-results/.test(s.path || ""));
}

/** 「run: npm run e2e」在 job 块里的行号（口径同 uploadStepsOf：跳过注释行）。找不到返回 -1。
 *  用来判「上传步骤排在 e2e 之后」——顺序错了工件是空的，而 `if-no-files-found: warn` 不会报红。 */
function runE2eLineOf(text, job) {
  const lines = jobBlockOf(text, job).replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "" || t.startsWith("#")) continue;
    if (/^(?:-\s*)?run:\s*"?npm run e2e"?\s*$/.test(t)) return i;
  }
  return -1;
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
 *   修法：① 给 e2e 加取消门，使其不被上游取消连带默认跳过、必须自行判定条件；
 *        ② deploy 的 skipped 分支必须同时校验上游 ci-e2e-status **确实 success 且 skip='true'**。
 *   R-21（2026-10-15 本片）把取消门从 `always()` 换成 `!cancelled()`：保护等价（实测 run 38625571067 仍派发），
 *   但被取代的 run 不再占 runner/发布组（实测 run 38623888632：always() 的对照 job 照样跑完）。
 * 本组断言锁住修复，防止回退。
 * ======================================================================== */
describe("deploy.yml ② e2e 门禁不得因上游 job 取消而被『被动跳过』绕过", () => {
  /* R-21（2026-10-15 本片）：断言对象从「有没有 always() 这个词」换成「取消门是哪种」。
   * 三条判据都来自一次性分支探针 r21-cancel-probe 的实测，不是文档推理：
   *   run 38625571067 —— 上游 job=cancelled 而 run 未被取消：
   *     有 `!cancelled()` 的 job = **success（照样派发）**；无取消门的对照 job = **skipped（被动跳过，即事故形状）**
   *   run 38623888632 —— 整条 run 被取消且 needs 刚转终态：
   *     有 `always()` 的 job = **被调度并跑完**（僵尸：占 runner、占住 pages-deploy-main 组）
   *     有 `!cancelled()` 的 job = **completed/cancelled、0 步**（立刻放组）
   * ⇒ 保护来自"存在一个取消门"，而 `always()` 额外贡献的只有僵尸，所以这里锁 `!cancelled()` 并禁 `always()`。 */
  it("e2e 必须带 !cancelled() 取消门（防上游 job 取消导致的被动跳过），且不得用 always()", () => {
    const ifBlock = ifBlockOf(dep, "e2e");
    expect(ifBlock, "e2e 的 if 必须含 !cancelled() 作为取消门").toContain("!cancelled()");
    expect(ifBlock, "e2e 不得退回 always()（实测 run 38623888632：被取代的 run 里它照样派发并跑完，占住发布组 6h+）").not.toContain("always()");
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

  it("deploy 的取消门也必须是 !cancelled()（上游 skipped 时不被默认跳过，但被取代的 run 不再当僵尸）", () => {
    const ifBlock = ifBlockOf(dep, "deploy");
    expect(ifBlock, "deploy 的 if 必须含 !cancelled() 作为取消门").toContain("!cancelled()");
    expect(ifBlock, "deploy 不得用 always()（它的安全闭锁由 verify/skipped 判据提供，always() 只贡献僵尸）").not.toContain("always()");
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
    expect(r.ciSteps, "ci.test 必须解析出 lint:breakpoints（v3.7.134 断点守卫）").toContain("npm run lint:breakpoints");
    expect(r.depSteps, "deploy.verify 必须解析出 lint:breakpoints（parity 同一条）").toContain("npm run lint:breakpoints");
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
 * B10（2026-10-30）：e2e 失败现场必须带出 CI。
 * 起因（实测）：run 40798305934 的 e2e 腿红在 rag-hybrid.spec.js:190，但**什么都没留下** ——
 * 此前两个 workflow 里 0 个 `upload-artifact`，Playwright 的 test-results/（失败截图 +
 * error-context.md）不上传，判红只能靠本机复跑；而同一条用例在同 SHA 的 Deploy 腿是绿的，
 * 等于每次抖动都要靠对侧腿 + 手动复现来定性。
 * ⚠️ 为什么必须另开一条断言：`uses:` 型步骤**不进** runStepsOf 的比对集合（那个解析器只抽 `- run:`），
 * 所以「两边都加了没」对 ③ 是完全隐形的 —— 只补 ci.yml、漏补 deploy.yml 会一路绿灯。
 * ⚠️ 每条 negative 断言前面都有一条「抽到了」的正向哨兵：本文件的教训就是空集让 `toEqual([])` 恒真。
 * ------------------------------------------------------------------------- */
describe("B10 e2e 失败现场工件（两条腿都要有，且不得同名）", () => {
  const SIDE = [
    ["ci.yml", ci, "e2e"],
    ["deploy.yml", dep, "e2e"],
  ];

  for (const [label, text, job] of SIDE) {
    describe(label + " 的 e2e job", () => {
      // —— 反向哨兵：抽取器必须真抽到东西，否则下面的断言全在空集上恒真 ——
      it("哨兵：至少解析出一条 upload-artifact 步骤（0 条 = 抽取器失效，不是「没有」）", () => {
        expect(uploadStepsOf(text, job).length, label + " 的 e2e job 必须解析出上传步骤").toBeGreaterThan(0);
        expect(runE2eLineOf(text, job), label + " 必须解析出 run: npm run e2e 的行").toBeGreaterThanOrEqual(0);
      });

      it("必须有一条 path 覆盖 test-results 的上传步骤", () => {
        const s = evidenceStepOf(text, job);
        expect(s, label + " 缺「上传 e2e 失败现场」步骤 ⇒ 判红只能靠本机复跑，CI 现场留不下").toBeTruthy();
        expect(s.artifact, label + " 的上传步骤必须显式写 with.name（否则同名工件跨腿互相覆盖）").toBeTruthy();
        expect(s.path, "path 必须指向 Playwright 的 outputDir").toMatch(/test-results/);
      });

      it("必须挂在 failure() 上（绿时不产工件），且排在 npm run e2e 之后", () => {
        const s = evidenceStepOf(text, job);
        expect(s.ifLine, label + " 的上传步骤必须有 if（无条件上传会把每次绿 run 都塞满工件）").toMatch(/failure\(\)/);
        // 防回潮：always() 会让绿 run 也上传空目录，与本条要省的存储正相反
        expect(s.ifLine, label + " 不得写成 always()").not.toMatch(/always\(\)/);
        expect(s.at, label + " 的上传步骤必须在 `run: npm run e2e` 之后，否则上传的是跑之前的空目录").toBeGreaterThan(
          runE2eLineOf(text, job),
        );
      });
    });
  }

  it("两条腿的工件名必须不同（同名会让人分不清现场来自哪条腿）", () => {
    const a = evidenceStepOf(ci, "e2e");
    const b = evidenceStepOf(dep, "e2e");
    expect(a && a.artifact, "ci.yml 工件名未解析出").toBeTruthy();
    expect(b && b.artifact, "deploy.yml 工件名未解析出").toBeTruthy();
    expect(a.artifact).not.toEqual(b.artifact);
  });

  /* —— 变异自测：证明上面的判据有射程，不是对着真文件的装饰。 —— */
  const mk = (stepsBlock, runFirst = true) =>
    [
      "jobs:",
      "  e2e:",
      "    steps:",
      ...(runFirst ? ["      - name: Run E2E (full user flow)", "        run: npm run e2e"] : []),
      ...stepsBlock,
      ...(runFirst ? [] : ["      - name: Run E2E (full user flow)", "        run: npm run e2e"]),
    ].join("\n");
  const GOOD = [
    "      # 注释里也写 upload-artifact，抽取器必须不把它当步骤",
    "      - name: 上传 e2e 失败现场",
    "        if: failure()",
    "        uses: actions/upload-artifact@v4",
    "        with:",
    "          name: e2e-test-results-ci",
    "          path: test-results/",
    "          retention-days: 7",
  ];

  it("变异·删步：整段去掉上传步骤 → evidenceStepOf 返回 undefined（不是空集恒真）", () => {
    const y = mk([]);
    expect(uploadStepsOf(y, "e2e")).toEqual([]);
    expect(evidenceStepOf(y, "e2e")).toBeUndefined();
  });

  it("变异·只命中注释：把步骤换成一行注释里的 upload-artifact → 仍判「没有」", () => {
    const y = mk(["      # 以后可以加 upload-artifact 传 test-results"]);
    expect(evidenceStepOf(y, "e2e"), "注释不得被当成真步骤（本文件对 if: 踩过同一次）").toBeUndefined();
  });

  it("变异·无条件：去掉 if: → failure() 判据红", () => {
    const y = mk(GOOD.filter((l) => !/if: failure\(\)/.test(l)));
    const s = evidenceStepOf(y, "e2e");
    expect(s, "步骤本身还是要抽到的，否则这条变异没打在判定维度上").toBeTruthy();
    expect(s.ifLine || "", "缺 if 时必须判红").not.toMatch(/failure\(\)/);
  });

  it("变异·换序：上传步骤挪到 npm run e2e 之前 → at 判据红", () => {
    const y = mk(GOOD.filter((l) => !l.trim().startsWith("#")), false);
    const s = evidenceStepOf(y, "e2e");
    expect(s.at, "上传必须在跑之后，否则现场是空目录").toBeLessThan(runE2eLineOf(y, "e2e"));
  });

  it("变异·工件名落到 name 层：with.name 不得覆盖步骤名（两层缩进必须分开解析）", () => {
    const y = mk(GOOD);
    const s = evidenceStepOf(y, "e2e");
    expect(s.name, "步骤级 name 应保持为标题").toBe("上传 e2e 失败现场");
    expect(s.artifact, "with.name 才是工件名").toBe("e2e-test-results-ci");
  });

  it("正控·块写法：path: | 多行也必须被抽到（否则真文件改成块写法会假红）", () => {
    const y = mk([
      "      - name: 上传",
      "        if: failure()",
      "        uses: actions/upload-artifact@v4",
      "        with:",
      "          name: ev",
      "          path: |",
      "            test-results/",
      "            playwright-report/",
      "          retention-days: 7",
    ]);
    const s = evidenceStepOf(y, "e2e");
    expect(s, "块写法 path 不得漏抽").toBeTruthy();
    expect(s.path).toContain("test-results/");
    expect(s.path).toContain("playwright-report/");
    expect(s.artifact, "块续行不得把 retention-days 当成 path 的一部分").toBe("ev");
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

  it("e2e 的 ref 守卫必须与取消门并存（v3.7.92 防被动跳过 + v3.7.93 防非 main + R-21 禁僵尸）", () => {
    const ifBlock = ifBlockOf(dep, "e2e");
    expect(ifBlock).toContain("!cancelled()");
    expect(ifBlock).toContain("github.ref == 'refs/heads/main'");
  });

  it("concurrency group 必须带 ${{ github.ref }}（非 main run 不得取消在途 main 部署）", () => {
    expect(dep, "group 必须并入 ref 维度").toMatch(/group:\s*pages-deploy-\$\{\{\s*github\.ref\s*\}\}/);
  });
});
