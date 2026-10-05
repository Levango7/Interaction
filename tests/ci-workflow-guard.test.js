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
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const yml = readFileSync(join(root, ".github/workflows/electron-build.yml"), "utf8");

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
  const dep = readFileSync(join(root, ".github/workflows/deploy.yml"), "utf8");

  /** 抽某个 job 的片段（从 `  <name>:` 到下一个同级 job 或文件尾）。
   *  ⚠️ deploy.yml 是 **CRLF** 换行（实测 `dep.includes("\r\n") === true`），
   *  故行尾必须写成 `\r?\n`，否则 job 名根本匹配不到（首版踩过，报「缺少 job: deploy」）。 */
  function jobBlock(name) {
    const re = new RegExp(`\r?\n  ${name}:\r?\n([\\s\\S]*?)(?=\r?\n  [a-z][\\w-]*:\r?\n|$)`);
    const m = dep.match(re);
    if (!m) throw new Error(`deploy.yml 缺少 job: ${name}`);
    return m[1];
  }

  /** 抽某 job 里 `if:` 起、到下一个同级 key 之前的完整文本（处理 CRLF 与多行 `>-`）。
   *  ⚠️ 必须锚定**行首缩进**的 `if:`，不能用裸 indexOf("if:")：
   *  job 的注释里就写着「原实现 `if: ...skip != 'true'`」，裸 indexOf 会命中注释（本文件踩过）。 */
  function ifBlockOf(name) {
    const b = jobBlock(name).replace(/\r/g, "");
    const m0 = b.match(/\n    if:/);
    if (!m0) throw new Error(`${name} 无行首 if:`);
    const rest = b.slice(m0.index + m0[0].length);
    // 下一个缩进 4 空格的 key（如 runs-on:）即 if 区块结束
    const m = rest.match(/\n    [a-z][\w-]*:/);
    return m ? rest.slice(0, m.index) : rest;
  }

  it("e2e job 必须有 always()（否则上游 cancelled 会连带跳过它）", () => {
    const ifBlock = ifBlockOf("e2e");
    expect(ifBlock, "e2e 的 if 必须含 always()").toContain("always()");
  });

  it("e2e 跳过条件必须显式绑定『上游 success 且 skip=true』", () => {
    const ifBlock = ifBlockOf("e2e");
    expect(ifBlock, "必须检查 ci-e2e-status.result == 'success'").toMatch(/needs\.ci-e2e-status\.result\s*==\s*'success'/);
    expect(ifBlock, "必须检查 outputs.skip == 'true'").toMatch(/outputs\.skip\s*==\s*'true'/);
    // 负向：不得退回「只看 outputs.skip != 'true'」的旧写法
    expect(ifBlock, "不得退回不检查上游结论的旧写法").not.toMatch(/needs\.ci-e2e-status\.outputs\.skip\s*!=\s*'true'/);
  });

  it("deploy job 的 needs 必须包含 ci-e2e-status（否则无法区分两种 skipped）", () => {
    const b = jobBlock("deploy").replace(/\r/g, "");
    // 注意：jobBlock 从 `deploy:\n` 之后起，首行即 `    needs: [...]`，无前导 \n → 用 (?:^|\n)
    const needsLine = (b.match(/(?:^|\n)\s*needs:\s*(.+)/) || [])[1] || "";
    expect(needsLine, "必须依赖 ci-e2e-status").toContain("ci-e2e-status");
    expect(needsLine, "仍须依赖 verify").toContain("verify");
    expect(needsLine, "仍须依赖 e2e").toContain("e2e");
  });

  it("deploy 放行 skipped 时必须同时校验上游 ci-e2e-status 成功且 skip=true", () => {
    const ifBlock = ifBlockOf("deploy");
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
    const ifBlock = ifBlockOf("deploy");
    expect(ifBlock, "deploy 必须保留 always()").toContain("always()");
  });
});
