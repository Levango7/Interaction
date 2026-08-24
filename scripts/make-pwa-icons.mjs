#!/usr/bin/env node
/**
 * 生成 PWA PNG 图标（192×192、512×512），复用 make-icon.mjs 的 PNG 编码逻辑。
 * --------------------------------------------------
 * 视觉与 icon.svg 一致：圆角蓝紫渐变底 + 白色「引力环」（开口圆环）+ 中心圆点 + 环外节点。
 * 零外部依赖（仅用 node:zlib）。用法：node scripts/make-pwa-icons.mjs
 *
 * 背景：PWA 安装提示要求 PNG 图标（Chrome 需 192×192 与 512×512），仅 SVG 不触发。
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

/* ---------- PNG 编码（与 make-icon.mjs 一致） ---------- */
function crc32(buf){
  const table = [];
  for (let n = 0; n < 256; n++){
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = (table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(W, H, rgba){
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++){
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++){
      const o = y * (W * 4 + 1) + 1 + x * 4;
      const s = (y * W + x) * 4;
      raw[o] = rgba[s]; raw[o + 1] = rgba[s + 1]; raw[o + 2] = rgba[s + 2]; raw[o + 3] = rgba[s + 3];
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit, RGBA
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

/* ---------- 几何辅助 ---------- */
function sdRoundRect(x, y, cx, cy, w, h, r){
  const qx = Math.abs(x - cx) - (w / 2 - r), qy = Math.abs(y - cy) - (h / 2 - r);
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/* ---------- 渲染引力环（与 icon.svg 同构） ---------- */
function renderIcon(S){
  const k = S / 512;                       // 缩放因子
  const rgba = new Uint8Array(S * S * 4);
  // 背景圆角矩形（x=32,y=32,w=448,h=448,rx=96）
  const bgCx = 256 * k, bgCy = 256 * k, bgW = 448 * k, bgH = 448 * k, bgR = 96 * k;
  const c0 = [0x00, 0x67, 0xc0];           // #0067c0
  const c1 = [0x9b, 0x4d, 0xca];           // #9b4dca
  // 开口圆环（圆心 256,256；半径 181.3；描边 30）
  const ringCx = 256 * k, ringCy = 256 * k, ringR = 181.3 * k, ringStroke = 30 * k;
  // 开口区间（右上方）：起点角 -20°、终点角 -70°（atan2 屏幕坐标，y 向下）
  const openStart = -70 * Math.PI / 180, openEnd = -20 * Math.PI / 180;
  // 中心圆点 r=48；环外节点 (414.4,97.6) r=37.3
  const dotR = 48 * k;
  const nodeCx = 414.4 * k, nodeCy = 97.6 * k, nodeR = 37.3 * k;

  for (let y = 0; y < S; y++){
    for (let x = 0; x < S; x++){
      const px = x + 0.5, py = y + 0.5;
      const o = (y * S + x) * 4;
      // 1) 背景
      const dBg = sdRoundRect(px, py, bgCx, bgCy, bgW, bgH, bgR);
      if (dBg > 0.5){ rgba[o + 3] = 0; continue; }
      const bgCover = clamp01(0.5 - dBg);
      const t = clamp01(((px - (bgCx - bgW / 2)) + (py - (bgCy - bgH / 2))) / (bgW + bgH));
      let r = lerp(c0[0], c1[0], t);
      let g = lerp(c0[1], c1[1], t);
      let b = lerp(c0[2], c1[2], t);
      let a = 255 * bgCover;
      // 白色覆盖混合（内联以避免闭包开销）
      // 2) 开口圆环
      const dr = Math.hypot(px - ringCx, py - ringCy);
      const ringDist = Math.abs(dr - ringR) - ringStroke / 2;
      if (ringDist < 0.5){
        const ang = Math.atan2(py - ringCy, px - ringCx);
        if (!(ang >= openStart && ang <= openEnd)){
          const cover = clamp01(0.5 - ringDist) * bgCover;
          r += (255 - r) * cover; g += (255 - g) * cover; b += (255 - b) * cover;
          a = Math.max(a, 255 * bgCover);
        }
      }
      // 3) 中心圆点
      const dotDist = dr - dotR;
      if (dotDist < 0.5){
        const cover = clamp01(0.5 - dotDist) * bgCover;
        r += (255 - r) * cover; g += (255 - g) * cover; b += (255 - b) * cover;
        a = Math.max(a, 255 * bgCover);
      }
      // 4) 环外节点
      const nodeDist = Math.hypot(px - nodeCx, py - nodeCy) - nodeR;
      if (nodeDist < 0.5){
        const cover = clamp01(0.5 - nodeDist) * bgCover;
        r += (255 - r) * cover; g += (255 - g) * cover; b += (255 - b) * cover;
        a = Math.max(a, 255 * bgCover);
      }
      rgba[o] = Math.round(r); rgba[o + 1] = Math.round(g); rgba[o + 2] = Math.round(b); rgba[o + 3] = Math.round(a);
    }
  }
  return rgba;
}

/* ---------- CLI ---------- */
for (const S of [192, 512]){
  const rgba = renderIcon(S);
  const png = encodePng(S, S, rgba);
  const out = join(root, `icon-${S}.png`);
  writeFileSync(out, png);
  console.log(`[pwa-icon] wrote ${out} (${png.length} bytes)`);
}