/**
 * 多 AI Profile · 用例验证
 * ----------------------------------------------------------------------------
 * 验证对象：多 AI 供应商配置（profiles + activeId）功能。覆盖：
 *   - 旧配置自动迁移：localStorage 存旧格式 {base,key,model} → migrate 后转 profiles 数组
 *   - getActiveProfile() 返回正确 profile（按 activeId 索引；缺失时回退首个）
 *   - 切换 activeId 后 getActiveProfile() 返回新 profile
 *   - 新建 profile：profiles 数组长度 +1，并自动切到新 profile
 *   - 删除 profile：profiles 数组长度 -1，至少保留 1 个（最后 1 个时禁用删除）
 *   - 复制 profile：复制当前 profile 为新 profile（深拷贝，新 id）
 *   - saveCfg 把表单值写回当前 active profile（多 profile 加密持久化）
 *   - genProfileId 格式符合要求
 *
 * 设计原则：
 *   - 黑盒优先：通过 window.__test 访问内部函数，不修改生产文件
 *   - 断言「可观测行为」：返回值、localStorage 状态、profiles 数组长度
 *
 * 运行：npx vitest run tests/ai-profile.test.js
 */

import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";

/** 取全新 window 并等待启动 async 完成 */
async function boot() {
  const win = loadApp();
  await new Promise((r) => setTimeout(r, 60));
  return win;
}

describe("多 AI Profile · 旧配置自动迁移", () => {
  it("旧 cfg {base,key,model} → migrate 后转 profiles 数组，activeId 指向该 profile", async () => {
    const win = await boot();
    const { migrate, PREFIX } = win.__test;
    // 写旧格式 cfg
    win.localStorage.setItem(
      PREFIX + "cfg",
      JSON.stringify({ enabled: true, base: "https://api.old.com/v1", key: "sk-old", model: "gpt-4o-mini", theme: "auto" })
    );
    migrate();
    const stored = JSON.parse(win.localStorage.getItem(PREFIX + "cfg"));
    expect(Array.isArray(stored.profiles)).toBe(true);
    expect(stored.profiles.length).toBe(1);
    expect(stored.profiles[0].base).toBe("https://api.old.com/v1");
    expect(stored.profiles[0].key).toBe("sk-old");
    expect(stored.profiles[0].model).toBe("gpt-4o-mini");
    expect(stored.profiles[0].name).toBe("默认");
    expect(stored.activeId).toBe(stored.profiles[0].id);
    // 非 AI 字段保留
    expect(stored.enabled).toBe(true);
    expect(stored.theme).toBe("auto");
    // 旧顶层 base/key/model 已删除
    expect(stored.base).toBeUndefined();
    expect(stored.key).toBeUndefined();
    expect(stored.model).toBeUndefined();
  });

  it("已是新格式 cfg（含 profiles）→ migrate 不重复迁移", async () => {
    const win = await boot();
    const { migrate, PREFIX } = win.__test;
    const profiles = [{ id: "p1", name: "OpenAI", base: "https://a", key: "sk-1", model: "gpt-4o" }];
    win.localStorage.setItem(
      PREFIX + "cfg",
      JSON.stringify({ enabled: true, profiles, activeId: "p1" })
    );
    migrate();
    const stored = JSON.parse(win.localStorage.getItem(PREFIX + "cfg"));
    expect(stored.profiles.length).toBe(1);
    expect(stored.profiles[0].id).toBe("p1");
    expect(stored.activeId).toBe("p1");
  });

  it("空 cfg（无 base/key/model）→ migrate 不构造 profiles", async () => {
    const win = await boot();
    const { migrate, PREFIX } = win.__test;
    win.localStorage.setItem(PREFIX + "cfg", JSON.stringify({ enabled: false, theme: "auto" }));
    migrate();
    const stored = JSON.parse(win.localStorage.getItem(PREFIX + "cfg"));
    expect(stored.profiles).toBeUndefined();
  });

  it("无 cfg → migrateProfiles 不抛、不创建空 profiles", async () => {
    const win = await boot();
    const { migrate, PREFIX } = win.__test;
    win.localStorage.removeItem(PREFIX + "cfg");
    let threw = false;
    try { migrate(); } catch (e) { threw = true; }
    expect(threw).toBe(false);
    expect(win.localStorage.getItem(PREFIX + "cfg")).toBe(null);
  });
});

describe("多 AI Profile · getActiveProfile", () => {
  it("返回 activeId 对应的 profile", async () => {
    const win = await boot();
    const { getCfg, getActiveProfile, _resetCrypto, PREFIX } = win.__test;
    _resetCrypto();
    win.localStorage.setItem(
      PREFIX + "cfg",
      JSON.stringify({
        enabled: true,
        profiles: [
          { id: "p1", name: "OpenAI", base: "https://a", key: "sk-1", model: "gpt-4o" },
          { id: "p2", name: "Anthropic", base: "https://b", key: "sk-2", model: "claude-3" }
        ],
        activeId: "p2"
      })
    );
    const ap = getActiveProfile();
    expect(ap).not.toBeNull();
    expect(ap.id).toBe("p2");
    expect(ap.name).toBe("Anthropic");
    expect(ap.base).toBe("https://b");
  });

  it("activeId 不存在时回退到 profiles[0]", async () => {
    const win = await boot();
    const { getActiveProfile, _resetCrypto, PREFIX } = win.__test;
    _resetCrypto();
    win.localStorage.setItem(
      PREFIX + "cfg",
      JSON.stringify({
        enabled: true,
        profiles: [
          { id: "p1", name: "OpenAI", base: "https://a", key: "sk-1", model: "gpt-4o" }
        ],
        activeId: "non-existent"
      })
    );
    const ap = getActiveProfile();
    expect(ap.id).toBe("p1");
  });

  it("无 profiles 时返回 null（或旧格式兼容）", async () => {
    const win = await boot();
    const { getActiveProfile, _resetCrypto, PREFIX } = win.__test;
    _resetCrypto();
    win.localStorage.setItem(PREFIX + "cfg", JSON.stringify({ enabled: false }));
    const ap = getActiveProfile();
    expect(ap).toBeNull();
  });

  it("旧格式兼容：cfg 有 base/key/model 但无 profiles → 构造临时 profile", async () => {
    const win = await boot();
    const { getActiveProfile, _resetCrypto, PREFIX } = win.__test;
    _resetCrypto();
    win.localStorage.setItem(
      PREFIX + "cfg",
      JSON.stringify({ enabled: true, base: "https://legacy", key: "sk-legacy", model: "gpt-4o" })
    );
    const ap = getActiveProfile();
    expect(ap).not.toBeNull();
    expect(ap.base).toBe("https://legacy");
    expect(ap.key).toBe("sk-legacy");
    expect(ap.model).toBe("gpt-4o");
  });
});

describe("多 AI Profile · 切换 / 新建 / 删除 / 复制", () => {
  function setupTwoProfiles(win) {
    const { _resetCrypto, PREFIX } = win.__test;
    _resetCrypto();
    win.localStorage.setItem(
      PREFIX + "cfg",
      JSON.stringify({
        enabled: true,
        profiles: [
          { id: "p1", name: "OpenAI", base: "https://a", key: "sk-1", model: "gpt-4o" },
          { id: "p2", name: "Anthropic", base: "https://b", key: "sk-2", model: "claude-3" }
        ],
        activeId: "p1"
      })
    );
  }

  it("switchProfile 切换 activeId 后 getActiveProfile 返回新 profile", async () => {
    const win = await boot();
    setupTwoProfiles(win);
    const { switchProfile, getActiveProfile } = win.__test;
    switchProfile("p2");
    const ap = getActiveProfile();
    expect(ap.id).toBe("p2");
    expect(ap.name).toBe("Anthropic");
  });

  it("switchProfile 后表单字段被填充为新 profile 的值", async () => {
    const win = await boot();
    setupTwoProfiles(win);
    const { switchProfile } = win.__test;
    switchProfile("p2");
    expect(win.document.getElementById("cfgName").value).toBe("Anthropic");
    expect(win.document.getElementById("cfgBase").value).toBe("https://b");
    expect(win.document.getElementById("cfgKey").value).toBe("sk-2");
    expect(win.document.getElementById("cfgModel").value).toBe("claude-3");
  });

  it("newProfile 创建空 profile：profiles 长度 +1，并切到新 profile", async () => {
    const win = await boot();
    setupTwoProfiles(win);
    const { newProfile, getCfg, getActiveProfile } = win.__test;
    const before = getCfg().profiles.length;
    newProfile();
    const cfg = getCfg();
    expect(cfg.profiles.length).toBe(before + 1);
    const ap = getActiveProfile();
    expect(ap.name).toBe("新 Profile");
    expect(ap.base).toBe("https://api.openai.com/v1");
    expect(ap.model).toBe("gpt-4o-mini");
  });

  it("delProfile 删除当前 profile：profiles 长度 -1", async () => {
    const win = await boot();
    setupTwoProfiles(win);
    const { delProfile, getCfg, getActiveProfile } = win.__test;
    // 屏蔽 confirm
    win.confirm = () => true;
    const before = getCfg().profiles.length;
    delProfile();
    const cfg = getCfg();
    expect(cfg.profiles.length).toBe(before - 1);
    // activeId 切到剩余 profile
    const ap = getActiveProfile();
    expect(ap.id).toBe("p2");
  });

  it("delProfile 至少保留 1 个：只剩 1 个时不删除", async () => {
    const win = await boot();
    setupTwoProfiles(win);
    const { delProfile, getCfg } = win.__test;
    win.confirm = () => true;
    // 删 1 个剩 1 个
    delProfile();
    expect(getCfg().profiles.length).toBe(1);
    // 再删不应生效
    delProfile();
    expect(getCfg().profiles.length).toBe(1);
  });

  it("dupProfile 复制当前 profile：profiles 长度 +1，新 profile 名含「副本」", async () => {
    const win = await boot();
    setupTwoProfiles(win);
    const { dupProfile, getCfg, getActiveProfile } = win.__test;
    const before = getCfg().profiles.length;
    dupProfile();
    const cfg = getCfg();
    expect(cfg.profiles.length).toBe(before + 1);
    const ap = getActiveProfile();
    expect(ap.name).toContain("副本");
    expect(ap.base).toBe("https://a"); // 复制了 p1 的 base
    expect(ap.key).toBe("sk-1");
  });

  it("delProfile 用户取消确认时不删除", async () => {
    const win = await boot();
    setupTwoProfiles(win);
    const { delProfile, getCfg } = win.__test;
    win.confirm = () => false;
    const before = getCfg().profiles.length;
    delProfile();
    expect(getCfg().profiles.length).toBe(before);
  });
});

describe("多 AI Profile · saveCfg 写回 active profile", () => {
  it("saveCfg 把表单值写入当前 active profile，保留其他 profile 不变", async () => {
    const win = await boot();
    const { saveCfg, getCfg, getActiveProfile, _resetCrypto, PREFIX, initCrypto } = win.__test;
    _resetCrypto();
    win.localStorage.removeItem(PREFIX + "__dk");
    await initCrypto();
    win.localStorage.setItem(
      PREFIX + "cfg",
      JSON.stringify({
        enabled: true,
        profiles: [
          { id: "p1", name: "OpenAI", base: "https://a", key: "sk-1", model: "gpt-4o" },
          { id: "p2", name: "Anthropic", base: "https://b", key: "sk-2", model: "claude-3" }
        ],
        activeId: "p1"
      })
    );
    // 清 _cfgCache 让 getCfg 重新读 localStorage（initCrypto 已设 _cfgCache 为旧值）
    _resetCrypto();
    await initCrypto();
    // 切到 p1 并填新值
    win.document.getElementById("cfgEnabled").checked = true;
    win.document.getElementById("cfgName").value = "OpenAI-Updated";
    win.document.getElementById("cfgBase").value = "https://new";
    win.document.getElementById("cfgKey").value = "sk-new";
    win.document.getElementById("cfgModel").value = "gpt-4o-mini";
    win.alert = () => {};
    await saveCfg();
    const cfg = getCfg();
    expect(cfg.profiles.length).toBe(2);
    const p1 = cfg.profiles.find(p => p.id === "p1");
    expect(p1.name).toBe("OpenAI-Updated");
    expect(p1.base).toBe("https://new");
    expect(p1.model).toBe("gpt-4o-mini");
    // p2 不变
    const p2 = cfg.profiles.find(p => p.id === "p2");
    expect(p2.name).toBe("Anthropic");
    expect(p2.base).toBe("https://b");
    // active profile 返回新值
    const ap = getActiveProfile();
    expect(ap.key).toBe("sk-new");
  });
});

describe("多 AI Profile · genProfileId 格式", () => {
  it("genProfileId 返回字符串，长度 > 0，两次调用不同", async () => {
    const win = await boot();
    const { genProfileId } = win.__test;
    const a = genProfileId();
    const b = genProfileId();
    expect(typeof a).toBe("string");
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });
});

describe("多 AI Profile · UI 渲染", () => {
  it("renderProfileSelect 列出所有 profile，选中 activeId", async () => {
    const win = await boot();
    const { renderProfileSelect, _resetCrypto, PREFIX } = win.__test;
    _resetCrypto();
    win.localStorage.setItem(
      PREFIX + "cfg",
      JSON.stringify({
        enabled: true,
        profiles: [
          { id: "p1", name: "OpenAI", base: "https://a", key: "sk-1", model: "gpt-4o" },
          { id: "p2", name: "Anthropic", base: "https://b", key: "sk-2", model: "claude-3" }
        ],
        activeId: "p2"
      })
    );
    renderProfileSelect();
    const sel = win.document.getElementById("cfgProfileSelect");
    expect(sel.children.length).toBe(2);
    expect(sel.children[0].value).toBe("p1");
    expect(sel.children[1].value).toBe("p2");
    expect(sel.value).toBe("p2");
  });

  it("只剩 1 个 profile 时删除按钮禁用", async () => {
    const win = await boot();
    const { renderProfileSelect, _resetCrypto, PREFIX } = win.__test;
    _resetCrypto();
    win.localStorage.setItem(
      PREFIX + "cfg",
      JSON.stringify({
        enabled: true,
        profiles: [{ id: "p1", name: "OpenAI", base: "https://a", key: "sk-1", model: "gpt-4o" }],
        activeId: "p1"
      })
    );
    renderProfileSelect();
    const delBtn = win.document.getElementById("cfgProfileDel");
    expect(delBtn.disabled).toBe(true);
  });

  it("openDrawer 打开后表单填入 active profile 值", async () => {
    const win = await boot();
    const { _resetCrypto, PREFIX } = win.__test;
    _resetCrypto();
    win.localStorage.setItem(
      PREFIX + "cfg",
      JSON.stringify({
        enabled: true,
        profiles: [
          { id: "p1", name: "OpenAI", base: "https://api.openai.com/v1", key: "sk-test", model: "gpt-4o-mini" }
        ],
        activeId: "p1"
      })
    );
    win.__test.openDrawer();
    expect(win.document.getElementById("cfgName").value).toBe("OpenAI");
    expect(win.document.getElementById("cfgBase").value).toBe("https://api.openai.com/v1");
    expect(win.document.getElementById("cfgKey").value).toBe("sk-test");
    expect(win.document.getElementById("cfgModel").value).toBe("gpt-4o-mini");
  });
});

describe("多 AI Profile · fetchCoachAdvice 使用 active profile", () => {
  it("cfg.enabled=true 但 active profile 无 key → 返回 no-ai", async () => {
    const win = await boot();
    const { fetchCoachAdvice, _resetCrypto, PREFIX } = win.__test;
    _resetCrypto();
    win.localStorage.setItem(
      PREFIX + "cfg",
      JSON.stringify({
        enabled: true,
        profiles: [{ id: "p1", name: "OpenAI", base: "https://a", key: "", model: "gpt-4o" }],
        activeId: "p1"
      })
    );
    const r = await fetchCoachAdvice();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no-ai");
  });

  it("cfg.enabled=false → 返回 no-ai", async () => {
    const win = await boot();
    const { fetchCoachAdvice, _resetCrypto, PREFIX } = win.__test;
    _resetCrypto();
    win.localStorage.setItem(
      PREFIX + "cfg",
      JSON.stringify({
        enabled: false,
        profiles: [{ id: "p1", name: "OpenAI", base: "https://a", key: "sk-1", model: "gpt-4o" }],
        activeId: "p1"
      })
    );
    const r = await fetchCoachAdvice();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no-ai");
  });
});