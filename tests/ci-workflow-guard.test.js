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
