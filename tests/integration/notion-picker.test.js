// tests/integration/notion-picker.test.js
// B4: NotionPicker 卡片渲染集成测试
const assert = require('assert');

// 用 JSDOM 模拟 DOM
const { JSDOM } = require('jsdom');

function setupDom() {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div id="integrationPanel"></div>
  </body></html>`, { runScripts: 'outside-only' });
  return dom;
}

describe('NotionPicker', () => {
  it('should render card when renderNotionCard is called', () => {
    const dom = setupDom();
    const { window } = dom;
    global.document = window.document;
    global.window = window;

    // 模拟 getProvider
    window.getProvider = () => null;

    // 注入 renderNotionCard（从 agent-workbench.html 提取）
    const fs = require('fs');
    const html = fs.readFileSync('F:/Nexus/Interaction/agent-workbench.html', 'utf-8');
    const match = html.match(/function renderNotionCard\(\)\{[\s\S]*?\n\}/);
    if(!match) throw new Error('renderNotionCard not found');
    const fn = new Function('document', 'window', match[0] + '\n;renderNotionCard;');
    fn(window.document, window);

    const panel = window.document.getElementById('integrationPanel');
    assert.ok(panel, 'panel should exist');
    assert.equal(panel.children.length, 1, 'should have one card');
    assert.ok(panel.querySelector('.int-card'), 'should have int-card class');
    assert.ok(panel.querySelector('.int-conn'), 'should have connect button when disabled');
  });

  it('should show disconnect button when provider enabled', () => {
    const dom = setupDom();
    const { window } = dom;
    global.document = window.document;
    global.window = window;

    window.getProvider = () => ({ enabled: true });

    const fs = require('fs');
    const html = fs.readFileSync('F:/Nexus/Interaction/agent-workbench.html', 'utf-8');
    const match = html.match(/function renderNotionCard\(\)\{[\s\S]*?\n\}/);
    const fn = new Function('document', 'window', match[0] + '\n;renderNotionCard;');
    fn(window.document, window);

    const panel = window.document.getElementById('integrationPanel');
    assert.ok(panel.querySelector('.int-disc'), 'should have disconnect button when enabled');
    assert.ok(panel.querySelector('.int-on'), 'should have int-on badge');
  });
});