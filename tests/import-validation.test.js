import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadApp } from './helpers/loadApp.js';

const PREFIX = "wb_agent_";

function makeFakeReader(jsonStr) {
  return class FakeFileReader {
    constructor() { this.result = ""; }
    readAsText() {
      this.result = jsonStr;
      setTimeout(() => { if (typeof this.onload === "function") this.onload({ target: this }); }, 0);
    }
  };
}

describe('Import validation', () => {
  let win;
  beforeEach(() => {
    win = loadApp();
    win.localStorage.clear();
    Object.defineProperty(win, 'confirm', { value: () => true, writable: true, configurable: true });
    win.__toastCalls = [];
    win.toast = (msg, type) => { win.__toastCalls.push({msg, type}); };
  });

  it('valid import with _deviceMeta succeeds', async () => {
    const data = { _deviceMeta: { version: '1.0', exportedAt: Date.now() } };
    data[`${PREFIX}tasks`] = JSON.stringify([{id:1, title:'test'}]);
    const origFR = win.FileReader;
    win.FileReader = makeFakeReader(JSON.stringify(data));
    win.doImport({ name: 'test.json' });
    await vi.waitFor(() => {
      expect(win.localStorage.getItem(`${PREFIX}tasks`)).toBe(JSON.stringify([{id:1, title:'test'}]));
    }, { timeout: 3000, interval: 50 });
    expect(win.__toastCalls.find(t=>t.type==='error')).toBeUndefined();
    win.FileReader = origFR;
  });

  it('missing version in _deviceMeta rejected', async () => {
    const data = { _deviceMeta: { exportedAt: Date.now() } };
    data[`${PREFIX}tasks`] = JSON.stringify([]);
    const origFR = win.FileReader;
    win.FileReader = makeFakeReader(JSON.stringify(data));
    win.doImport({ name: 'test.json' });
    await vi.waitFor(() => {
      expect(win.__toastCalls.some(t=>t.msg.includes('version'))).toBeTruthy();
    }, { timeout: 3000, interval: 50 });
    win.FileReader = origFR;
  });

  it('missing exportedAt in _deviceMeta rejected', async () => {
    const data = { _deviceMeta: { version: '1.0' } };
    data[`${PREFIX}tasks`] = JSON.stringify([]);
    const origFR = win.FileReader;
    win.FileReader = makeFakeReader(JSON.stringify(data));
    win.doImport({ name: 'test.json' });
    await vi.waitFor(() => {
      expect(win.__toastCalls.some(t=>t.msg.includes('exportedAt'))).toBeTruthy();
    }, { timeout: 3000, interval: 50 });
    win.FileReader = origFR;
  });

  it('non-array tasks with _deviceMeta rejected', async () => {
    const data = { _deviceMeta: { version: '1.0', exportedAt: Date.now() } };
    data[`${PREFIX}tasks`] = 'not-an-array';
    const origFR = win.FileReader;
    win.FileReader = makeFakeReader(JSON.stringify(data));
    win.doImport({ name: 'test.json' });
    await vi.waitFor(() => {
      expect(win.__toastCalls.some(t=>t.msg.includes('tasks'))).toBeTruthy();
    }, { timeout: 3000, interval: 50 });
    win.FileReader = origFR;
  });

  it('empty object without _deviceMeta accepted (backward compat)', async () => {
    const origFR = win.FileReader;
    win.FileReader = makeFakeReader(JSON.stringify({}));
    win.doImport({ name: 'test.json' });
    await vi.waitFor(() => {
      expect(win.__toastCalls.some(t=>t.msg.includes('version'))).toBeFalsy();
    }, { timeout: 3000, interval: 50 });
    win.FileReader = origFR;
  });

  it('legacy import without _deviceMeta still works', async () => {
    const data = { 'wb_agent_tasks': JSON.stringify([{id:2}]) };
    const origFR = win.FileReader;
    win.FileReader = makeFakeReader(JSON.stringify(data));
    win.doImport({ name: 'test.json' });
    await vi.waitFor(() => {
      expect(win.localStorage.getItem('wb_agent_tasks')).toBe(JSON.stringify([{id:2}]));
    }, { timeout: 3000, interval: 50 });
    win.FileReader = origFR;
  });
});
