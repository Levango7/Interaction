import { describe, it, expect, beforeAll } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * 集成 Provider 异步取用 + 同步状态管理（注入式测试）
 *
 * 背景：_intRequireProvider 由同步改为 async——增加 await _intAwaitHydrated()
 * 注水闸门（safeStorage 密封态解封后再取用），17 处调用方全部机械变换为 await。
 * 本测试经 win.__test 注入点驱动真实实现：
 *   - 异步取用链：LS → _intLoadProviders(触发注水) → _intAwaitHydrated → 过滤(enabled/type)
 *   - 同步状态纯函数：_intGetSyncState / _intRecordSync / _intFindLocalId
 */

describe("集成 Provider 异步取用（_intRequireProvider）", () => {
  let T;
  let win;
  let PROVIDERS_KEY;

  beforeAll(() => {
    win = loadApp();
    T = win.__test;
    PROVIDERS_KEY = T.INTEGRATION_PROVIDERS_KEY;
  });

  /** 向 LS 写入 providers 快照（模拟持久化形态）；必须走 win.localStorage——与被测实现共享同一 JSDOM 实例 */
  function seedProviders(map) {
    // 守卫语义：内存是当前会话真相源，重复读盘不再覆盖。测试需重置加载缓存，
    // 使后续 _intLoadProviders 实际上从刚写入的 LS 全量加载（等价于新会话冷启动）。
    if (typeof T._intResetIntegrationCache === "function") T._intResetIntegrationCache();
    win.localStorage.setItem(PROVIDERS_KEY, JSON.stringify(map));
  }

  const ENABLED_NOTION = {
    notion: {
      name: "notion",
      type: "notion",
      config: { token: "secret_x", databaseId: "db1" },
      enabled: true,
      createdAt: "2026-08-27T00:00:00.000Z",
      updatedAt: "2026-08-27T00:00:00.000Z",
    },
  };

  it("导出点齐备且 _intRequireProvider 为函数", () => {
    expect(typeof T._intRequireProvider).toBe("function");
    expect(typeof T._intGetSyncState).toBe("function");
    expect(typeof T._intRecordSync).toBe("function");
    expect(typeof T._intFindLocalId).toBe("function");
  });

  it("空 name 直接返回 null（不入存储）", async () => {
    seedProviders(ENABLED_NOTION);
    await expect(T._intRequireProvider("")).resolves.toBeNull();
  });

  it("未注册的 name 返回 null", async () => {
    seedProviders({});
    await expect(T._intRequireProvider("notion")).resolves.toBeNull();
  });

  it("enabled provider：返回对象且字段完整（明文经注水后不被破坏）", async () => {
    seedProviders(ENABLED_NOTION);
    const p = await T._intRequireProvider("notion");
    expect(p).not.toBeNull();
    expect(p.name).toBe("notion");
    expect(p.type).toBe("notion");
    expect(p.enabled).toBe(true);
    expect(p.config.databaseId).toBe("db1");
  });

  it("expectedType 不匹配返回 null", async () => {
    seedProviders(ENABLED_NOTION);
    await expect(T._intRequireProvider("notion", "slack")).resolves.toBeNull();
  });

  it("expectedType 匹配则放行", async () => {
    seedProviders(ENABLED_NOTION);
    const p = await T._intRequireProvider("notion", "notion");
    expect(p).not.toBeNull();
  });

  it("disabled provider 返回 null", async () => {
    seedProviders({
      slack: { name: "slack", type: "slack", config: {}, enabled: false, createdAt: "", updatedAt: "" },
    });
    await expect(T._intRequireProvider("slack")).resolves.toBeNull();
  });

  it("LS 损坏 JSON 不抛异常（健壮性）", async () => {
    win.localStorage.setItem(PROVIDERS_KEY, "{corrupted!!");
    await expect(T._intRequireProvider("notion")).resolves.toBeNull();
  });
});

describe("集成同步状态管理（_intGetSyncState/_intRecordSync/_intFindLocalId）", () => {
  let T;
  let win;
  let SYNC_KEY;

  beforeAll(() => {
    win = loadApp(); // 独立 JSDOM，互不串扰
    T = win.__test;
    SYNC_KEY = T.INTEGRATION_SYNC_STATE_KEY;
  });

  it("首次取用创建空结构 {lastSyncAt:null, syncedItems:{}}", () => {
    const s = T._intGetSyncState("jira");
    expect(s.lastSyncAt).toBeNull();
    expect(s.syncedItems).toEqual({});
  });

  it("同 provider 状态一致（实现每次经 LS 重读重建，按值断言）", () => {
    const a = T._intGetSyncState("linear");
    const b = T._intGetSyncState("linear");
    expect(b).toEqual(a);
  });

  it("_intRecordSync 记录映射并持久化（含 lastSyncAt 与 syncedAt）", () => {
    T._intRecordSync("linear", "task-1", "LIN-42", "issue");
    const s = T._intGetSyncState("linear");
    expect(s.syncedItems["task-1"]).toMatchObject({ remoteId: "LIN-42", type: "issue" });
    expect(s.syncedItems["task-1"].syncedAt).toBeTruthy();
    expect(s.lastSyncAt).toBeTruthy();
    // 持久化验证：LS 里能读回
    const persisted = JSON.parse(win.localStorage.getItem(SYNC_KEY) || "{}");
    expect(persisted.linear?.syncedItems?.["task-1"]?.remoteId).toBe("LIN-42");
  });

  it("_intFindLocalId 双向反查：命中/未命/null", () => {
    expect(T._intFindLocalId("linear", "LIN-42")).toBe("task-1");
    expect(T._intFindLocalId("linear", "LIN-UNKNOWN")).toBeNull();
  });
});
