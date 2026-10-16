/**
 * src-blocks.js —— 按 `src/order.json` 的**求值顺序**读源码块，供「关心某层/某块整体文本」的测试使用
 * ----------------------------------------------------------------------------
 * 为什么会有这个文件（v3.7.132）：`src/core.js`（8,522 行）被拆成 4 块
 * （core / core-i18n / core-shared / core-commands），而此前有 5 个测试直接
 * `readFileSync("src/core.js")` —— 它们真正想断言的是「这些符号在 Core 层里怎么摆、谁先谁后」，
 * **不是「它们住在哪个文件」**。文件一拆，这些断言集体变红，但红的其实是一个与契约无关的细节
 * （同一个符号搬家 = 假红）。本文件把「按文件读」换成「按块读」，让拆块不再误伤契约测试。
 *
 * ⚠️ 拼接口径必须与拼回方向一致：`src/order.json` 的顺序 = 拼回 HTML 的顺序 = **运行时求值顺序**。
 *    这也是判断「A 是否先于 B 求值」的唯一正确依据 —— 比"在不在同一个文件里"更本质。
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(ROOT, "src");

/** 全部块：`{ name, layer, title, idx（拼回顺序，从 0 起）, text }` */
export function srcBlocks() {
  const order = JSON.parse(readFileSync(join(SRC, "order.json"), "utf8"));
  return order.map((b, idx) => ({
    ...b,
    idx,
    text: readFileSync(join(SRC, b.name + ".js"), "utf8"),
  }));
}

/** 某一层的所有块按求值顺序拼接（用于"这一层的源码整体"这类断言） */
export function readLayer(layer) {
  return srcBlocks().filter((b) => b.layer === layer).map((b) => b.text).join("\n");
}

/** 指定块名的内容按求值顺序拼接 */
export function readBlocks(names) {
  const all = srcBlocks();
  return names.map((n) => {
    const b = all.find((x) => x.name === n);
    if (!b) throw new Error("src/order.json 里没有块 " + n + "（可用：" + all.map((x) => x.name).join(", ") + "）");
    return b.text;
  }).join("\n");
}

/**
 * 某段文本（通常是 `const MESSAGES = {` 这种定义前缀）落在哪一块。
 * @returns {{name:string, layer:string, idx:number}|null}
 */
export function blockOf(snippet) {
  const b = srcBlocks().find((x) => x.text.includes(snippet));
  return b ? { name: b.name, layer: b.layer, idx: b.idx } : null;
}
