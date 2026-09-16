#!/usr/bin/env node
/**
 * make-pwa-icons.mjs — 生成 PWA 图标（192 / 512 PNG，纯 Node 零依赖）
 * --------------------------------------------------
 * 背景：manifest.json 曾引用 ./icon-192.png / ./icon-512.png，但仓库里**只有 icon.svg**（缺失 → 安装图标 404）。
 *   这里用与 electron 托盘/exe 图标**同一套品牌图形**（圆角蓝底 + 白色 A，见 scripts/make-icon.mjs），
 *   按任意尺寸重绘并输出 PNG，保证 PWA 安装有真实可用的位图图标。
 *
 * 与 make-icon.mjs 的关系：复用其 crc32 / pngChunk（PNG 编码），但绘制部分支持任意尺寸 + 超采样抗锯齿
 *   （原 drawIcon 固定 32×32、靠 0.5px 覆盖率做 AA；放大到 512 需要重采样，否则边缘发虚）。
 *
 * 用法：
 *   node scripts/make-pwa-icons.mjs            # 生成 icon-192.png / icon-512.png
 *   node scripts/make-pwa-icons.mjs --check    # 只校验：两文件存在且尺寸正确（不写盘）
 *
 * 品牌色：圆角底 #0a6cbd（与托盘图标一致）、字标纯白。
 */
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { crc32, pngChunk } from './make-icon.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const SIZES = [192, 512];
/* electron-builder 打包 Windows 要求图标 ≥256×256（现有 icon.ico 是自制 32×32 PNG-in-ICO，
   会在 WinPackager.getOrConvertIcon 阶段失败），故额外产出 electron/icon-256.png */
const ELECTRON_ICON = 'electron/icon-256.png';
const BG = [0x0a, 0x6c, 0xbd];
const CHECK = process.argv.includes('--check');

/* 几何全部以 32 单位为基准，按 size/32 缩放 —— 与 make-icon.mjs 的托盘图形完全同源 */
const BASE = 32;
const R_RECT = 8;      // 圆角半径
const STROKE = 3.6;    // 字标笔画宽
const GLYPH = [
  [16, 6.5, 8.5, 25.5],   // A 左斜
  [16, 6.5, 23.5, 25.5],  // A 右斜
  [11.6, 18.5, 20.4, 18.5] // A 横杠
];

function sdRoundRect(x, y, half, r) {
  const qx = Math.abs(x - half) - (half - r);
  const qy = Math.abs(y - half) - (half - r);
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
}
function segDist(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
  const px2 = ax + t * dx, py2 = ay + t * dy;
  return Math.hypot(x - px2, y - py2);
}

/* 返回 { w, h, data(RGBA Buffer) }：size×size，SS×SS 超采样 */
function drawMark(size, SS = 3) {
  const k = size / BASE;          // 32 单位 → 实际像素
  const glyph = GLYPH.map(s => s.map(v => v * k));
  const half = (BASE / 2) * k;
  const r = R_RECT * k, stroke = STROKE * k;
  const data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bgCov = 0, glyphCov = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
          if (sdRoundRect(px, py, half, r) <= 0) {
            bgCov++;
            let d = Infinity;
            for (const [ax, ay, bx, by] of glyph) d = Math.min(d, segDist(px, py, ax, ay, bx, by));
            if (d <= stroke / 2) glyphCov++;
          }
        }
      }
      const n = SS * SS;
      const a = bgCov / n;
      if (a <= 0) continue;
      const g = glyphCov / n;                 // 字标覆盖率（相对整像素）
      const mix = a > 0 ? Math.min(1, g / a) : 0;  // 字标在底色区域内的占比
      const o = (y * size + x) * 4;
      data[o] = Math.round(BG[0] + (255 - BG[0]) * mix);
      data[o + 1] = Math.round(BG[1] + (255 - BG[1]) * mix);
      data[o + 2] = Math.round(BG[2] + (255 - BG[2]) * mix);
      data[o + 3] = Math.round(255 * a);
    }
  }
  return { w: size, h: size, data };
}

function encodePNG({ w, h, data }) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;                 // filter type 0
    data.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;                   // 8bit RGBA
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]);
}

if (CHECK) {
  let bad = 0;
  for (const s of SIZES) {
    const p = join(root, `icon-${s}.png`);
    if (!existsSync(p)) { console.error(`[pwa-icon] 缺 ${p}`); bad++; continue; }
    const b = readFileSync(p);
    const okPng = b.readUInt32BE(0) === 0x89504e47;
    const w = okPng ? b.readUInt32BE(16) : -1, h = okPng ? b.readUInt32BE(20) : -1;
    const expect = encodePNG(drawMark(s));
    const same = Buffer.compare(b, expect) === 0;
    console.log(`  ${same ? '✓' : '✗'} icon-${s}.png  ${w}×${h}  ${Math.round(b.length / 1024)}KB${same ? '' : '（与重绘结果不一致）'}`);
    if (!same) bad++;
  }
  console.log(bad ? `[pwa-icon] check ✗ ${bad} 个不一致` : '[pwa-icon] check ✓ 192/512 均与重绘一致');
  process.exit(bad ? 1 : 0);
}

for (const s of SIZES) {
  const png = encodePNG(drawMark(s));
  writeFileSync(join(root, `icon-${s}.png`), png);
  console.log(`[pwa-icon] wrote icon-${s}.png (${png.length} bytes)`);
}
{
  const png = encodePNG(drawMark(256));
  writeFileSync(join(root, ELECTRON_ICON), png);
  console.log(`[pwa-icon] wrote ${ELECTRON_ICON} (${png.length} bytes) —— 供 electron-builder 打包用`);
}
console.log('[pwa-icon] 完成：manifest.json 的 ./icon-192.png 与 ./icon-512.png 现在真实存在');
