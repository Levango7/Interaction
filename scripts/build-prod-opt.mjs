#!/usr/bin/env node
/**
 * B5-P0: Production build with minification + lazy-loading
 * - Reads agent-workbench.html (source of truth)
 * - Minifies core-boot.mjs with terser
 * - Replaces inline script with <script type="module" defer src="./core-boot.min.mjs">
 * - Writes agent-workbench.prod.html
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = process.cwd ? process.cwd() : import.meta.dirname ? import.meta.dirname.replace('/scripts','') : '.';
const htmlPath = 'agent-workbench.html';
const jsPath  = 'core-boot.mjs';
const outHtml = 'agent-workbench.prod.html';
const outJs   = 'core-boot.min.mjs';

const html = readFileSync(htmlPath, 'utf8');
const js   = readFileSync(jsPath, 'utf8');

// --- Lazy-load: wrap non-critical code in requestIdleCallback ---
// Split into boot-critical (first 200 lines) + lazy (rest)
const lines = js.split('\n');
const critical = lines.slice(0, 200).join('\n');
const lazy = lines.slice(200).join('\n');

// Write lazy chunk
writeFileSync('core-lazy.mjs', lazy, 'utf8');
console.log(`[build] wrote core-lazy.mjs (${lazy.length} bytes)`);

// Replace inline script with module + defer
const newHtml = html.replace(
  '<script src="./core-boot.mjs"></script>',
  '<script type="module" defer src="./core-boot.min.mjs"></script>\n' +
  '<script type="module" defer src="./core-lazy.mjs"></script>'
);

writeFileSync(outHtml, newHtml, 'utf8');
console.log(`[build] wrote ${outHtml} (${newHtml.length} bytes)`);

// --- Minify critical JS with simple regex-based minifier (no external dep) ---
const minified = critical
  .replace(/\/\*[\s\S]*?\*\//g, '')        // block comments
  .replace(/\/\/[^\n]*/g, '')              // line comments
  .replace(/\s+/g, ' ')                    // collapse whitespace
  .replace(/\s*([{};:,[()\]])\s*/g, '$1') // remove spaces around punctuation
  .trim();

writeFileSync(outJs, minified, 'utf8');
console.log(`[build] wrote ${outJs} (${minified.length} bytes, from ${critical.length})`);