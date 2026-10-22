/**
 * docx-import.test.js —— .docx 零依赖文本抽取 + 知识库导入（2026-10-22）
 * ----------------------------------------------------------------------------
 * .docx 是 ZIP，正文在 word/document.xml；用浏览器原生 DecompressionStream('deflate-raw') 解压，
 * 不引任何库（单文件交付的体积反目标）。本文件用 Node zlib **现造**一个真 ZIP 夹具（含 deflate 与
 * store 两种压缩方式），验证：段落/制表/实体解码、两种压缩方式、非 ZIP 的诚实报错、
 * 以及知识库导入的准入（.docx 只有经抽取才收；直接塞二进制会被拒）。
 * PDF 不在本文件：它需要字体/CMap 解析（必须引库），导入层保持"明确不支持"的提示。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import zlib from "node:zlib";
import { loadApp } from "./helpers/loadApp.js";

const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));

/** 现造一个最小 ZIP（只写我们的解析器需要的字段；CRC 置 0，解析器不校验） */
function makeZip(files, method) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const f of files) {
    const raw = Buffer.from(f.data);
    const comp = method === 8 ? zlib.deflateRawSync(raw) : raw;
    const name = Buffer.from(f.name, "utf8");
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(method, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(0, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    const local = Buffer.concat([lh, name, comp]);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(method, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(0, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([ch, name]));
    locals.push(local);
    offset += local.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, cd, eocd]);
}

const DOC_XML = '<?xml version="1.0" encoding="UTF-8"?>'
  + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
  + '<w:p><w:r><w:t>第一段 标题</w:t></w:r></w:p>'
  + '<w:p><w:r><w:t>第二段</w:t></w:r><w:r><w:tab/><w:t>带制表</w:t></w:r></w:p>'
  + '<w:p><w:r><w:t>A &amp; B &lt;tag&gt;</w:t></w:r></w:p>'
  + '</w:body></w:document>';

const docxBuffer = (method) => makeZip([
  { name: "[Content_Types].xml", data: "<Types/>" },
  { name: "word/document.xml", data: DOC_XML },
], method);

async function boot() {
  const win = loadApp();
  windows.push(win);
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  return win;
}

describe(".docx 文本抽取", () => {
  it("deflate（真实 docx 的常见方式）：段落/制表/实体都正确", async () => {
    const win = await boot();
    const ab = docxBuffer(8);
    const text = await win.extractDocxText(ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength));
    expect(text).toContain("第一段 标题");
    expect(text, "段落之间应有换行").toMatch(/第一段 标题\n/);
    expect(text, "w:tab 应转成制表符").toContain("第二段\t带制表");
    expect(text, "XML 实体应解码").toContain("A & B <tag>");
  });

  it("store（method 0）也能解", async () => {
    const win = await boot();
    const ab = docxBuffer(0);
    const text = await win.extractDocxText(ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength));
    expect(text).toContain("第一段 标题");
  });

  it("非 ZIP：抛出可读错误（不许返回空串冒充成功）", async () => {
    const win = await boot();
    const junk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
    await expect(win.extractDocxText(junk)).rejects.toThrow(/ZIP|DOCX/);
  });

  it("知识库准入：.docx 只有经抽取才收；直接塞二进制被拒", async () => {
    const win = await boot();
    const ok = await win.ragImportText("会议纪要.docx", "第一段\n\n第二段", { preExtracted: true });
    expect(ok, "经抽取的文本应入库").toBeTruthy();
    expect(win.getRagFiles().some((f) => f.name === "会议纪要.docx" && f.chunks.length > 0)).toBe(true);
    const rejected = await win.ragImportText("坏文件.docx", "PK\u0003\u0004binary");
    expect(rejected, "未经抽取的 .docx 原始串必须被拒").toBeNull();
  });
});
