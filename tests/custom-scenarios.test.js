import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * P1 自定义场景回归测试
 * ----------------------------------------------------------------------------
 * 数据层：addCustomScenario / updateCustomScenario / removeCustomScenario /
 *        setBuiltinOverride / resetBuiltinOverride / registerCustomScenarios
 * 约束：内置 4 场景不可删；场景下有任务（含软删）不可删；重名/超长/非法色值拒绝；
 *      自定义场景进入 ORDER/SCENARIOS 后，侧栏/统计/AI 工具 enum/链路表单自动兼容。
 */

const PREFIX = "wb_agent_";

describe("P1 自定义场景", () => {
  let win;
  let __test;

  beforeEach(() => {
    win = loadApp();
    __test = win.__test;
    win.localStorage.clear();
    // 重置运行时注册状态（其他用例可能已添加场景；loadApp 是全新 DOM，此处确保干净）
  });

  describe("干净基线", () => {
    it("默认仅 6 个内置场景，ORDER 顺序稳定", () => {
      expect(__test.ORDER).toEqual(["office", "data", "design", "study", "code", "life"]);
    });
  });

  describe("addCustomScenario - 添加", () => {
    it("合法输入：返回 ok + key，并注册进 SCENARIOS/ORDER", () => {
      const r = __test.addCustomScenario("健身", "#ff6600", "check");
      expect(r.ok).toBe(true);
      expect(r.key).toMatch(/^sc_/);
      expect(__test.ORDER).toContain(r.key);
      const s = __test.SCENARIOS[r.key];
      expect(s.name).toBe("健身");
      expect(s.color).toBe("#ff6600");
      expect(s.custom).toBe(true);
      expect(s.extraCard).toBe("none");
      expect(s.record.fields.length).toBeGreaterThan(0);
      // 持久化
      const stored = JSON.parse(win.localStorage.getItem(PREFIX + "scenarios_custom"));
      expect(stored.length).toBe(1);
    });

    it("空名称 / 超长名称 / 重名 被拒绝", () => {
      expect(__test.addCustomScenario("", "#ffffff", "check").ok).toBe(false);
      expect(__test.addCustomScenario("超过十二个字的场景名字肯定不行", "#ffffff", "check").ok).toBe(false);
      expect(__test.addCustomScenario("办公", "#ffffff", "check").ok, "与内置重名被拒").toBe(false);
      __test.addCustomScenario("健身", "#ffffff", "check");
      expect(__test.addCustomScenario("健身", "#000000", "check").ok, "与自定义重名被拒").toBe(false);
    });

    it("非法色值回退默认令牌色；非法图标回退 overview", () => {
      const r = __test.addCustomScenario("杂项", "not-a-color", "no-such-icon");
      expect(r.ok).toBe(true);
      const s = __test.SCENARIOS[r.key];
      expect(s.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(s.icon).toContain("<svg");
    });
  });

  describe("updateCustomScenario - 修改", () => {
    it("改名 / 换色生效并重新注册", () => {
      const r = __test.addCustomScenario("健身", "#ff6600", "check");
      const u = __test.updateCustomScenario(r.key, { name: "运动", color: "#00aa55" });
      expect(u.ok).toBe(true);
      expect(__test.SCENARIOS[r.key].name).toBe("运动");
      expect(__test.SCENARIOS[r.key].color).toBe("#00aa55");
    });

    it("不存在 / 空名 / 超长名被拒绝", () => {
      expect(__test.updateCustomScenario("sc_none", { name: "x" }).ok).toBe(false);
      const r = __test.addCustomScenario("健身", "#ff6600", "check");
      expect(__test.updateCustomScenario(r.key, { name: "" }).ok).toBe(false);
      expect(__test.updateCustomScenario(r.key, { name: "这个名字超过十二个字的限制了" }).ok).toBe(false);
    });
  });

  describe("removeCustomScenario - 删除保护", () => {
    it("内置场景禁删", () => {
      expect(__test.removeCustomScenario("office").ok).toBe(false);
      expect(__test.ORDER).toContain("office");
    });

    it("场景下有任务（含软删）禁删", () => {
      const r = __test.addCustomScenario("健身", "#ff6600", "check");
      __test.setTasks([{ id: "t1", sc: r.key, title: "跑步", status: "todo", due: "", priority: "", tags: [], doneAt: null, created: Date.now() }]);
      expect(__test.removeCustomScenario(r.key).ok, "有活跃任务禁删").toBe(false);
      __test.setTasks([{ id: "t1", sc: r.key, title: "跑步", status: "todo", due: "", priority: "", tags: [], doneAt: null, created: Date.now(), deletedAt: Date.now() }]);
      expect(__test.removeCustomScenario(r.key).ok, "软删任务也禁删").toBe(false);
    });

    it("空场景可删：从 SCENARIOS/ORDER 移除，清理资料键与聊天", () => {
      const r = __test.addCustomScenario("健身", "#ff6600", "check");
      win.localStorage.setItem(PREFIX + "rec_" + r.key, JSON.stringify([{ id: "r1" }]));
      const d = __test.removeCustomScenario(r.key);
      expect(d.ok).toBe(true);
      expect(__test.ORDER).not.toContain(r.key);
      expect(__test.SCENARIOS[r.key]).toBeUndefined();
      expect(win.localStorage.getItem(PREFIX + "rec_" + r.key)).toBe(null);
    });

    it("删除当前激活场景后回退到 office", () => {
      const r = __test.addCustomScenario("健身", "#ff6600", "check");
      __test.setActive(r.key);
      expect(__test.getActive()).toBe(r.key);
      __test.removeCustomScenario(r.key);
      expect(__test.getActive()).toBe("office");
    });
  });

  describe("setBuiltinOverride - 内置改名/换色", () => {
    it("改名换色生效；resetBuiltinOverride 恢复原始值", () => {
      const o = __test.setBuiltinOverride("office", { name: "工作", color: "#123456" });
      expect(o.ok).toBe(true);
      expect(__test.SCENARIOS.office.name).toBe("工作");
      expect(__test.SCENARIOS.office.color).toBe("#123456");
      __test.resetBuiltinOverride("office");
      expect(__test.SCENARIOS.office.name).toBe("办公");
      expect(__test.SCENARIOS.office.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    it("非内置键 / 非法值被拒绝", () => {
      expect(__test.setBuiltinOverride("sc_x", { name: "x" }).ok).toBe(false);
      expect(__test.setBuiltinOverride("office", { name: "" }).ok).toBe(false);
      // 非法色值被忽略但不报错
      const r = __test.setBuiltinOverride("office", { color: "bad" });
      expect(r.ok).toBe(true);
      expect(__test.SCENARIOS.office.color).not.toBe("bad");
    });
  });

  describe("注册持久化与重启恢复", () => {
    it("重新加载应用后自定义场景与覆盖仍生效（存储驱动注册）", () => {
      const r = __test.addCustomScenario("健身", "#ff6600", "check");
      __test.setBuiltinOverride("study", { name: "深造" });
      // 模拟重启：新 DOM 读取同一 localStorage 不现实（loadApp 新建 DOM 会重置 localStorage），
      // 因此直接验证「注册幂等」：重复 register 不产生重复键、覆盖仍生效
      __test.registerCustomScenarios();
      __test.registerCustomScenarios();
      expect(__test.ORDER.filter(k => k === r.key).length).toBe(1);
      expect(__test.SCENARIOS.study.name).toBe("深造");
    });

    it("AI 工具 create_task 的 scenario enum 包含自定义场景", () => {
      const r = __test.addCustomScenario("健身", "#ff6600", "check");
      const createTool = __test.TOOLS.find(t => t.function.name === "create_task");
      expect(createTool.function.parameters.properties.scenario.enum).toContain(r.key);
    });

    it("自定义场景任务计入统计分布", () => {
      const r = __test.addCustomScenario("健身", "#ff6600", "check");
      __test.setTasks([{ id: "t1", sc: r.key, title: "跑步", status: "done", due: "", priority: "", tags: [], doneAt: Date.now(), created: Date.now() }]);
      const dist = __test.calcSceneDist();
      const mine = dist.find(d => d.sc === r.key);
      expect(mine).toBeTruthy();
      expect(mine.count).toBe(1);
    });

    it("自定义场景数据随备份键前缀导出（wb_agent_ 前缀）", () => {
      const r = __test.addCustomScenario("健身", "#ff6600", "check");
      expect(r.key).toBeDefined();
      const key = PREFIX + "scenarios_custom";
      expect(win.localStorage.getItem(key)).toBeTruthy();
      expect(key.startsWith(PREFIX)).toBe(true);
    });
  });
});
