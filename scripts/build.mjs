#!/usr/bin/env node
/**
 * Zero-dependency build for agent-workbench.html
 * --------------------------------------------------
 * Assembles the single-file SPA from modular sources:
 *   src/shell/top.html     -> everything before <script> (incl. <script> tag)
 *   src/modules/*.js       -> JS modules, concatenated in filename order
 *   src/shell/bottom.html  -> </script></body></html>
 *
 * Byte-level guarantee: every part is read/written as a raw Buffer, so the
 * output is byte-identical to the original monolithic file (verified by --check).
 *
 * Usage:
 *   node scripts/build.mjs          # build -> agent-workbench.html
 *   node scripts/build.mjs --check  # build in-memory, diff vs current file, exit 1 on mismatch
 *
 * NOTE: src/ is the source of truth. agent-workbench.html is GENERATED.
 * Do not hand-edit agent-workbench.html; edit src/ and re-run build.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const SHELL_TOP = join(root, 'src', 'shell', 'top.html');
const SHELL_BOTTOM = join(root, 'src', 'shell', 'bottom.html');
const MOD_DIR = join(root, 'src', 'modules');
const OUT = join(root, 'agent-workbench.html');

function fail(msg) {
  console.error('[build] ' + msg);
  process.exit(1);
}

if (!existsSync(SHELL_TOP)) fail(`missing ${SHELL_TOP}`);
if (!existsSync(SHELL_BOTTOM)) fail(`missing ${SHELL_BOTTOM}`);
if (!existsSync(MOD_DIR)) fail(`missing ${MOD_DIR}`);

const mods = readdirSync(MOD_DIR).filter((f) => f.endsWith('.js')).sort();

const parts = [readFileSync(SHELL_TOP)];
for (const m of mods) parts.push(readFileSync(join(MOD_DIR, m)));
parts.push(readFileSync(SHELL_BOTTOM));

const out = Buffer.concat(parts);

function sha(b) {
  return createHash('sha256').update(b).digest('hex').slice(0, 16);
}

if (process.argv.includes('--check')) {
  if (!existsSync(OUT)) fail(`current ${OUT} does not exist; nothing to verify against`);
  const cur = readFileSync(OUT);
  if (Buffer.compare(cur, out) === 0) {
    console.log(`[build] OK byte-equivalent: ${out.length} bytes, sha256:${sha(out)} (${mods.length} modules)`);
    process.exit(0);
  } else {
    console.error(`[build] MISMATCH: generated ${out.length} bytes vs current ${cur.length} bytes`);
    process.exit(1);
  }
}

writeFileSync(OUT, out);
console.log(`[build] wrote ${OUT} (${out.length} bytes, sha256:${sha(out)}) from ${mods.length} modules`);
