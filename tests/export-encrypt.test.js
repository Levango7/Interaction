import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './helpers/loadApp.js';

function base64ToUint8Array(b64) {
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

// v3.4.1 修 CI flaky：固定 sleep 50ms 在慢 runner（windows CI）上不够——FileReader 异步
// 读 blob 未完成导致 __lastExportData 仍为 null，JSON.parse(null)._deviceMeta 抛 TypeError。
// 改为轮询等待导出数据就绪（最多 3s，每 10ms 检查），与 sync-server 测试的 waitForServer 同模式。
async function waitForExportData(win, timeout = 3000) {
  const deadline = Date.now() + timeout;
  while (win.__lastExportData === null && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 10));
  }
}

describe('Export encryption option', () => {
  let win;
  beforeEach(() => {
    win = loadApp();
    win.localStorage.clear();
    win.confirm = () => true;
    win.toast = () => {};
    win.__lastExportData = null;
    win.URL.createObjectURL = (blob) => {
      // Capture blob content as string for testing
      const reader = new win.FileReader();
      reader.onload = (e) => { win.__lastExportData = e.target.result; };
      reader.readAsText(blob);
      return 'blob:url';
    };
    win.URL.revokeObjectURL = () => {};
    const origCreateElement = win.document.createElement.bind(win.document);
    win.document.createElement = (tag) => {
      if (tag === 'a') {
        const el = origCreateElement(tag);
        el.click = () => {};
        return el;
      }
      return origCreateElement(tag);
    };
    win.prompt = () => 'testpwd';
  });

  it('plain export produces JSON with version field', async () => {
    const chk = win.document.getElementById('exportEncryptOpt');
    if (chk) chk.checked = false;
    await win.doExport();
    // Wait for async FileReader to finish (poll, not fixed sleep — CI runners are slow)
    await waitForExportData(win);
    const data = JSON.parse(win.__lastExportData);
    expect(data._deviceMeta).toBeDefined();
    expect(typeof data._deviceMeta.version).toBe('string');
  });

  it('encrypted export produces encrypted object and can be decrypted', async () => {
    const chk = win.document.getElementById('exportEncryptOpt');
    if (chk) chk.checked = true;
    await win.doExport();
    await waitForExportData(win);
    const enc = JSON.parse(win.__lastExportData);
    expect(enc.encrypted).toBe(true);
    expect(enc.iv).toBeDefined();
    expect(enc.ciphertext).toBeDefined();
    expect(enc.salt).toBeDefined();
    const encBuf = base64ToUint8Array(enc.ciphertext);
    const iv = base64ToUint8Array(enc.iv);
    const salt = base64ToUint8Array(enc.salt);
    const pwKey = await win.crypto.subtle.importKey('raw', new TextEncoder().encode('testpwd'), {name:'PBKDF2'}, false, ['deriveKey']);
    const aesKey = await win.crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:210000, hash:'SHA-256'}, pwKey, {name:'AES-GCM', length:256}, false, ['decrypt']);
    const plainBuf = await win.crypto.subtle.decrypt({name:'AES-GCM', iv}, aesKey, encBuf);
    const plainStr = new TextDecoder().decode(plainBuf);
    const plainObj = JSON.parse(plainStr);
    expect(plainObj._deviceMeta).toBeDefined();
  });

  it('decryption fails with wrong password', async () => {
    const chk = win.document.getElementById('exportEncryptOpt');
    if (chk) chk.checked = true;
    win.prompt = () => 'correctpwd';
    await win.doExport();
    await waitForExportData(win);
    const enc = JSON.parse(win.__lastExportData);
    const encBuf = base64ToUint8Array(enc.ciphertext);
    const iv = base64ToUint8Array(enc.iv);
    const salt = base64ToUint8Array(enc.salt);
    const pwKey = await win.crypto.subtle.importKey('raw', new TextEncoder().encode('wrongpwd'), {name:'PBKDF2'}, false, ['deriveKey']);
    const aesKey = await win.crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:210000, hash:'SHA-256'}, pwKey, {name:'AES-GCM', length:256}, false, ['decrypt']);
    let threw = false;
    try {
      await win.crypto.subtle.decrypt({name:'AES-GCM', iv}, aesKey, encBuf);
    } catch (e) { threw = true; }
    expect(threw).toBe(true);
  });

  it('cancel password prompts plain export', async () => {
    const chk = win.document.getElementById('exportEncryptOpt');
    if (chk) chk.checked = true;
    win.prompt = () => null;
    await win.doExport();
    expect(win.__lastExportData).toBeNull();
  });
});
