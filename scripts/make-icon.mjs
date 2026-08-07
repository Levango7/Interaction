#!/usr/bin/env node
/**
 * R2：生成 exe/窗口图标 electron/icon.ico（32×32，PNG-in-ICO 格式）
 * --------------------------------------------------
 * 复用 electron/main.js makeTrayIcon 的像素绘制逻辑（圆角蓝底 + 白色 A 字标，抗锯齿），
 * 保证托盘图标与 exe 图标视觉一致。零外部依赖。
 *
 * 用法：
 *   node scripts/make-icon.mjs            # 生成 -> electron/icon.ico
 *   node scripts/make-icon.mjs --check    # 内存生成并对比现有文件，不一致则 exit 1
 *
 * 测试：drawIcon / makeIco 已导出，供 vitest 直接断言 ICO 结构（见 tests/round6-icon.test.js）。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const OUT = join(root, 'electron', 'icon.ico');

/* ---------- PNG 编码（与 main.js 一致） ---------- */
export function crc32(buf){
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
export function pngChunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

/* ---------- 像素绘制：圆角蓝底 + 白色 A（与 main.js makeTrayIcon 同款） ---------- */
export function drawIcon(){
  const W = 32, H = 32;
  const px = new Array(W * H).fill(null);
  const R = 8;
  function sdRoundRect(x, y){
    const qx = Math.abs(x - 16) - (16 - R), qy = Math.abs(y - 16) - (16 - R);
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
    return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - R;
  }
  function segDist(x, y, ax, ay, bx, by){
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
    const px2 = ax + t * dx, py2 = ay + t * dy;
    return Math.sqrt((x - px2) * (x - px2) + (y - py2) * (y - py2));
  }
  const STROKE = 3.6;
  for (let y = 0; y < H; y++){
    for (let x = 0; x < W; x++){
      const cx = x + 0.5, cy = y + 0.5;
      const d = sdRoundRect(cx, cy);
      if (d > 0.5) continue;
      const cover = Math.max(0, Math.min(1, 0.5 - d));
      px[y * W + x] = [0x0a, 0x6c, 0xbd, Math.round(255 * cover)];
      const dA = Math.min(
        segDist(cx, cy, 16, 6.5, 8.5, 25.5),
        segDist(cx, cy, 16, 6.5, 23.5, 25.5),
        segDist(cx, cy, 11.6, 18.5, 20.4, 18.5)
      );
      const aCover = Math.max(0, Math.min(1, (STROKE / 2 + 0.5) - dA)) * cover;
      if (aCover > 0){
        const base = px[y * W + x];
        px[y * W + x] = [
          Math.round(base[0] + (255 - base[0]) * aCover),
          Math.round(base[1] + (255 - base[1]) * aCover),
          Math.round(base[2] + (255 - base[2]) * aCover),
          Math.max(base[3], Math.round(255 * cover))
        ];
      }
    }
  }
  // RGBA -> PNG（filter 字节恒 0）
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++){
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++){
      const o = y * (W * 4 + 1) + 1 + x * 4;
      const p = px[y * W + x];
      if (p){ raw[o] = p[0]; raw[o + 1] = p[1]; raw[o + 2] = p[2]; raw[o + 3] = p[3]; }
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit, RGBA
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

/* ---------- ICO 封装（PNG-in-ICO，electron-builder 支持） ---------- */
export function makeIco(png){
  const W = 32, H = 32;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // type: 1 = ICO
  header.writeUInt16LE(1, 4);      // count: 1 image
  const entry = Buffer.alloc(16);
  entry[0] = W & 0xFF;             // width（32 → 32）
  entry[1] = H & 0xFF;             // height
  entry[2] = 0;                    // color palette
  entry[3] = 0;                    // reserved
  entry.writeUInt16LE(1, 4);       // color planes
  entry.writeUInt16LE(32, 6);      // bpp
  entry.writeUInt32LE(png.length, 8);  // image data size
  entry.writeUInt32LE(22, 12);     // image data offset（6 + 16）
  return Buffer.concat([header, entry, png]);
}

/* ---------- CLI 入口（仅直接运行时写文件） ---------- */
function cli(){
  const png = drawIcon();
  const ico = makeIco(png);
  if (process.argv.includes('--check')){
    if (!existsSync(OUT)){ console.error('[icon] missing ' + OUT); process.exit(1); }
    const cur = readFileSync(OUT);
    if (Buffer.compare(cur, ico) === 0){
      console.log('[icon] OK byte-equivalent: ' + ico.length + ' bytes');
      process.exit(0);
    }
    console.error('[icon] MISMATCH: generated ' + ico.length + ' bytes vs current ' + cur.length + ' bytes');
    process.exit(1);
  }
  writeFileSync(OUT, ico);
  console.log('[icon] wrote ' + OUT + ' (' + ico.length + ' bytes)');
}
// 直接运行（node scripts/make-icon.mjs）才执行 CLI；被 import（测试）时不写文件
if (process.argv[1] && process.argv[1].endsWith('make-icon.mjs')) cli();
