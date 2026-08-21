import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { drawIcon, makeIco, crc32 } from "../scripts/make-icon.mjs";

/**
 * 第六轮 R2 · exe 图标生成（scripts/make-icon.mjs）
 * ----------------------------------------------------------------
 * 直接断言 ICO 结构与像素内容（导入时不写文件，CLI 有运行入口守卫）。
 */
describe("R2 · make-icon ICO 生成", () => {
  it("drawIcon 输出合法 32×32 RGBA PNG", () => {
    const png = drawIcon();
    // PNG 签名
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    // IHDR：宽高 32、8bit、colorType 6（RGBA）
    expect(png.readUInt32BE(16)).toBe(32);
    expect(png.readUInt32BE(20)).toBe(32);
    expect(png[24]).toBe(8);
    expect(png[25]).toBe(6);
  });

  it("makeIco 输出合法 ICO：type=1、count=1、32bpp、PNG 签名位于数据区", () => {
    const png = drawIcon();
    const ico = makeIco(png);
    expect(ico.readUInt16LE(0)).toBe(0);        // reserved
    expect(ico.readUInt16LE(2)).toBe(1);        // type: ICO
    expect(ico.readUInt16LE(4)).toBe(1);        // count: 1 image
    // 条目从偏移 6 开始：width/height/colors/reserved(1B*4) + planes/bpp(2B) + size/offset(4B)
    expect(ico[6]).toBe(32);                     // width
    expect(ico[7]).toBe(32);                     // height
    expect(ico.readUInt16LE(6 + 4)).toBe(1);     // color planes
    expect(ico.readUInt16LE(6 + 6)).toBe(32);    // bpp
    expect(ico.readUInt32LE(6 + 8)).toBe(png.length); // image size
    expect(ico.readUInt32LE(6 + 12)).toBe(22);   // offset = 6 + 16
    // 数据区是合法 PNG
    const off = ico.readUInt32LE(6 + 12);
    expect([...ico.subarray(off, off + 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it("像素内容：圆角外透明、蓝底、A 字标近白色（与托盘图标一致）", () => {
    const png = drawIcon();
    // 解压 IDAT 读取像素
    let idatOff = 8, idat = [];
    while (idatOff < png.length){
      const len = png.readUInt32BE(idatOff);
      const type = png.subarray(idatOff + 4, idatOff + 8).toString("ascii");
      if (type === "IDAT") idat.push(png.subarray(idatOff + 8, idatOff + 8 + len));
      idatOff += 12 + len;
    }
    const raw = inflateSync(Buffer.concat(idat));
    const px = (x, y) => { const o = y * (32 * 4 + 1) + 1 + x * 4; return [raw[o], raw[o + 1], raw[o + 2], raw[o + 3]]; };
    expect(px(1, 1)[3]).toBe(0);          // 圆角外：全透明
    const top = px(16, 1);                 // 顶部边缘中央：蓝底
    expect(top[0]).toBe(0x0a); expect(top[1]).toBe(0x6c); expect(top[2]).toBe(0xbd);
    const stroke = px(12, 16);             // A 左斜边：近白
    expect(stroke[0]).toBeGreaterThan(180);
    const gap = px(16, 23);                // 两腿之间：蓝底
    expect(gap[0]).toBe(0x0a); expect(gap[1]).toBe(0x6c);
  });

  it("crc32 已知值校验", () => {
    // "123456789" 的 CRC32 = 0xCBF43926
    expect(crc32(Buffer.from("123456789"))).toBe(0xCBF43926);
  });
});
