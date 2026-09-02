// 任务235：后端 API 客户端测试
// 覆盖：apiFetch（mock fetch / token 管理 / 401 自动刷新 / 离线降级）、
//       登录/注册（token 存储到 localStorage）、通知偏好 CRUD、定时提醒 CRUD、
//       集成连接/断开、数据同步 debounce、离线模式降级。
// 策略：每个 it 用 loadApp 取独立 window，win.fetch = vi.fn() mock fetch，
//       不实际请求网络。token 键 wb_access_token 等不带 wb_agent_ 前缀，
//       setup.js 只清 wb_agent_*，故每个 it 手动 win.localStorage.clear()。

import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

// token 存储键（与实现保持一致）
const API_TOKEN_KEY = "wb_access_token";
const API_REFRESH_KEY = "wb_refresh_token";
const API_EXPIRY_KEY = "wb_token_expiry";

// 构造 mock fetch 响应
function mockResponse(ok, data, status) {
  return {
    ok: ok,
    status: status || (ok ? 200 : 400),
    json: async () => data,
  };
}

// 构造网络错误（fetch 抛 TypeError）
function networkError() {
  return new TypeError("Failed to fetch");
}

// 加载应用并 mock fetch：返回 { win, fetchMock }
function loadAppWithMockFetch() {
  const win = loadApp();
  win.localStorage.clear();
  const fetchMock = vi.fn();
  // 覆盖 jsdom window 的 fetch，使 IIFE 中的 fetch() 调用命中 mock
  win.fetch = fetchMock;
  return { win, fetchMock };
}

describe("任务235：API 客户端 - 基础功能", () => {
  it("AC1: apiSetTokens 存储 token 到内存与 localStorage", () => {
    const win = loadApp(); win.localStorage.clear();
    const { apiSetTokens } = win.__test;
    apiSetTokens("access123", "refresh456", Date.now() + 60000);
    expect(win.localStorage.getItem(API_TOKEN_KEY)).toBe("access123");
    expect(win.localStorage.getItem(API_REFRESH_KEY)).toBe("refresh456");
    expect(Number(win.localStorage.getItem(API_EXPIRY_KEY))).toBeGreaterThan(Date.now());
  });

  it("AC2: apiClearTokens 清除 token 与 localStorage", () => {
    const win = loadApp(); win.localStorage.clear();
    const { apiSetTokens, apiClearTokens } = win.__test;
    apiSetTokens("access123", "refresh456", Date.now() + 60000);
    apiClearTokens();
    expect(win.localStorage.getItem(API_TOKEN_KEY)).toBeNull();
    expect(win.localStorage.getItem(API_REFRESH_KEY)).toBeNull();
    expect(win.localStorage.getItem(API_EXPIRY_KEY)).toBe("0");
  });

  it("AC3: isApiLoggedIn 已登录且未过期返回 true", () => {
    const win = loadApp(); win.localStorage.clear();
    const { apiSetTokens, isApiLoggedIn } = win.__test;
    apiSetTokens("access", "refresh", Date.now() + 60000);
    expect(isApiLoggedIn()).toBe(true);
  });

  it("AC4: isApiLoggedIn token 过期返回 false", () => {
    const win = loadApp(); win.localStorage.clear();
    const { apiSetTokens, isApiLoggedIn } = win.__test;
    apiSetTokens("access", "refresh", Date.now() - 1000);
    expect(isApiLoggedIn()).toBe(false);
  });

  it("AC5: isApiLoggedIn 无 token 返回 false", () => {
    const win = loadApp(); win.localStorage.clear();
    const { isApiLoggedIn } = win.__test;
    expect(isApiLoggedIn()).toBe(false);
  });

  it("AC6: apiGetHeaders 无 token 时不带 Authorization", () => {
    const win = loadApp(); win.localStorage.clear();
    const { apiGetHeaders } = win.__test;
    const h = apiGetHeaders();
    expect(h["Content-Type"]).toBe("application/json");
    expect(h["Authorization"]).toBeUndefined();
  });

  it("AC7: apiGetHeaders 有 token 时带 Authorization Bearer", () => {
    const win = loadApp(); win.localStorage.clear();
    const { apiSetTokens, apiGetHeaders } = win.__test;
    apiSetTokens("mytoken", "refresh", Date.now() + 60000);
    const h = apiGetHeaders();
    expect(h["Authorization"]).toBe("Bearer mytoken");
  });
});

describe("任务235：API 客户端 - apiFetch 核心", () => {
  it("AC8: apiFetch 成功返回 {ok, data, status}", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiFetch } = win.__test;
    fetchMock.mockResolvedValue(mockResponse(true, { hello: "world" }, 200));
    const r = await apiFetch("/api/test");
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ hello: "world" });
    expect(r.status).toBe(200);
  });

  it("AC9: apiFetch 自动加 Authorization header", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiSetTokens, apiFetch } = win.__test;
    apiSetTokens("tok123", "ref", Date.now() + 60000);
    fetchMock.mockResolvedValue(mockResponse(true, {}, 200));
    await apiFetch("/api/test");
    expect(fetchMock).toHaveBeenCalled();
    // 找到带 Authorization 的调用
    const authCall = fetchMock.mock.calls.find(c => c[1] && c[1].headers && c[1].headers["Authorization"]);
    expect(authCall).toBeTruthy();
    expect(authCall[1].headers["Authorization"]).toBe("Bearer tok123");
  });

  it("AC10: apiFetch 网络错误 throw {offline:true}", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiFetch } = win.__test;
    fetchMock.mockRejectedValue(networkError());
    await expect(apiFetch("/api/test")).rejects.toHaveProperty("offline", true);
  });

  it("AC11: apiFetch 401 时自动刷新并重试一次", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiSetTokens, apiFetch } = win.__test;
    apiSetTokens("oldtoken", "validrefresh", Date.now() + 60000);
    // 默认返回 refresh 成功响应；第1次返回 401 触发刷新
    fetchMock.mockResolvedValue(mockResponse(true, { accessToken: "newtoken" }, 200));
    fetchMock.mockResolvedValueOnce(mockResponse(false, { error: "token expired" }, 401));
    const r = await apiFetch("/api/test");
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("AC12: apiFetch 401 且刷新失败时返回 401", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiSetTokens, apiFetch } = win.__test;
    apiSetTokens("oldtoken", "badrefresh", Date.now() + 60000);
    fetchMock
      .mockResolvedValueOnce(mockResponse(false, { error: "expired" }, 401))
      .mockResolvedValueOnce(mockResponse(false, { error: "invalid refresh" }, 401));
    const r = await apiFetch("/api/test");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
  });

  it("AC13: apiFetch 无 refreshToken 时 401 不刷新直接返回", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiFetch } = win.__test;
    fetchMock.mockResolvedValue(mockResponse(false, { error: "unauthorized" }, 401));
    const r = await apiFetch("/api/test");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("任务235：API 客户端 - apiRefreshAccessToken", () => {
  it("AC14: apiRefreshAccessToken 成功更新 accessToken", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiSetTokens, apiRefreshAccessToken, isApiLoggedIn } = win.__test;
    apiSetTokens("old", "validrefresh", Date.now() - 1000);
    fetchMock.mockResolvedValue(mockResponse(true, { accessToken: "newtoken" }, 200));
    const ok = await apiRefreshAccessToken();
    expect(ok).toBe(true);
    expect(isApiLoggedIn()).toBe(true);
    expect(win.localStorage.getItem(API_TOKEN_KEY)).toBe("newtoken");
  });

  it("AC15: apiRefreshAccessToken 无 refreshToken 返回 false", async () => {
    const { win } = loadAppWithMockFetch();
    const { apiRefreshAccessToken } = win.__test;
    const ok = await apiRefreshAccessToken();
    expect(ok).toBe(false);
  });

  it("AC16: apiRefreshAccessToken 后端拒绝时返回 false", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiSetTokens, apiRefreshAccessToken } = win.__test;
    apiSetTokens("old", "invalid", Date.now() - 1000);
    fetchMock.mockResolvedValue(mockResponse(false, { error: "invalid" }, 401));
    const ok = await apiRefreshAccessToken();
    expect(ok).toBe(false);
  });

  it("AC17: apiRefreshAccessToken 网络错误返回 false", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiSetTokens, apiRefreshAccessToken } = win.__test;
    apiSetTokens("old", "any", Date.now() - 1000);
    fetchMock.mockRejectedValue(networkError());
    const ok = await apiRefreshAccessToken();
    expect(ok).toBe(false);
  });
});

describe("任务235：API 客户端 - 登录/注册", () => {
  it("AC18: apiLogin 成功后 token 存储到 localStorage", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiLogin, isApiLoggedIn } = win.__test;
    fetchMock.mockResolvedValue(mockResponse(true, {
      accessToken: "loginAccess",
      refreshToken: "loginRefresh",
      user: { id: "u1", email: "a@b.com", name: "Alice" },
    }, 200));
    const r = await apiLogin("a@b.com", "password1");
    expect(r.ok).toBe(true);
    expect(isApiLoggedIn()).toBe(true);
    expect(win.localStorage.getItem(API_TOKEN_KEY)).toBe("loginAccess");
    expect(win.localStorage.getItem(API_REFRESH_KEY)).toBe("loginRefresh");
  });

  it("AC19: apiLogin 失败时不存储 token", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiLogin, isApiLoggedIn } = win.__test;
    fetchMock.mockResolvedValue(mockResponse(false, { error: "邮箱或密码错误" }, 401));
    const r = await apiLogin("a@b.com", "wrong");
    expect(r.ok).toBe(false);
    expect(isApiLoggedIn()).toBe(false);
    expect(win.localStorage.getItem(API_TOKEN_KEY)).toBeNull();
  });

  it("AC20: apiRegister 成功返回用户信息", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiRegister } = win.__test;
    fetchMock.mockResolvedValue(mockResponse(true, {
      message: "注册成功",
      user: { id: "u2", email: "c@d.com", name: "Bob" },
    }, 201));
    const r = await apiRegister("c@d.com", "password1", "Bob");
    expect(r.ok).toBe(true);
    expect(r.data.user.name).toBe("Bob");
  });

  it("AC21: apiRegister 邮箱已存在返回 409", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiRegister } = win.__test;
    fetchMock.mockResolvedValue(mockResponse(false, { error: "该邮箱已被注册" }, 409));
    const r = await apiRegister("exists@e.com", "password1", "Dup");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(409);
  });
});

describe("任务235：API 客户端 - 用户资料", () => {
  it("AC22: apiGetProfile 返回当前用户信息", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiSetTokens, apiGetProfile } = win.__test;
    apiSetTokens("tok", "ref", Date.now() + 60000);
    fetchMock.mockResolvedValue(mockResponse(true, {
      user: { id: "u1", email: "a@b.com", name: "Alice" },
    }, 200));
    const r = await apiGetProfile();
    expect(r.ok).toBe(true);
    expect(r.data.user.email).toBe("a@b.com");
  });

  it("AC23: apiUpdateProfile 更新用户名", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiSetTokens, apiUpdateProfile } = win.__test;
    apiSetTokens("tok", "ref", Date.now() + 60000);
    fetchMock.mockResolvedValue(mockResponse(true, {
      user: { id: "u1", email: "a@b.com", name: "NewName" },
    }, 200));
    const r = await apiUpdateProfile({ name: "NewName" });
    expect(r.ok).toBe(true);
    expect(r.data.user.name).toBe("NewName");
  });

  it("AC24: apiGetDevices 返回设备列表", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiSetTokens, apiGetDevices } = win.__test;
    apiSetTokens("tok", "ref", Date.now() + 60000);
    fetchMock.mockResolvedValue(mockResponse(true, {
      devices: [{ id: "d1", deviceName: "Web", lastSeen: "2026-01-01", createdAt: "2026-01-01" }],
    }, 200));
    const r = await apiGetDevices();
    expect(r.ok).toBe(true);
    expect(r.data.devices).toHaveLength(1);
  });

  it("AC25: apiDeleteDevice 删除指定设备", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiSetTokens, apiDeleteDevice } = win.__test;
    apiSetTokens("tok", "ref", Date.now() + 60000);
    fetchMock.mockResolvedValue(mockResponse(true, { message: "设备已删除" }, 200));
    const r = await apiDeleteDevice("dev123");
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/auth/devices/dev123");
  });
});

describe("任务235：API 客户端 - 通知偏好 CRUD", () => {
  it("AC26: apiGetNotifyPrefs 返回偏好", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiSetTokens, apiGetNotifyPrefs } = win.__test;
    apiSetTokens("tok", "ref", Date.now() + 60000);
    fetchMock.mockResolvedValue(mockResponse(true, {
      preferences: { taskDue: { email: true, push: false, local: true } },
    }, 200));
    const r = await apiGetNotifyPrefs();
    expect(r.ok).toBe(true);
    expect(r.data.preferences.taskDue.email).toBe(true);
  });

  it("AC27: apiUpdateNotifyPrefs 更新偏好", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiSetTokens, apiUpdateNotifyPrefs } = win.__test;
    apiSetTokens("tok", "ref", Date.now() + 60000);
    fetchMock.mockResolvedValue(mockResponse(true, {
      preferences: { taskDue: { email: false, push: true, local: true } },
    }, 200));
    const r = await apiUpdateNotifyPrefs({ taskDue: { email: false, push: true, local: true } });
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
  });
});

describe("任务235：API 客户端 - Web Push", () => {
  it("AC28: apiPushSubscribe POST 订阅信息", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiSetTokens, apiPushSubscribe } = win.__test;
    apiSetTokens("tok", "ref", Date.now() + 60000);
    fetchMock.mockResolvedValue(mockResponse(true, { message: "订阅成功" }, 201));
    const r = await apiPushSubscribe({ endpoint: "https://push.example/s1", keys: { p256dh: "k1", auth: "k2" } });
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });

  it("AC29: apiPushUnsubscribe 取消订阅", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiSetTokens, apiPushUnsubscribe } = win.__test;
    apiSetTokens("tok", "ref", Date.now() + 60000);
    fetchMock.mockResolvedValue(mockResponse(true, { message: "已取消订阅" }, 200));
    const r = await apiPushUnsubscribe("https://push.example/s1");
    expect(r.ok).toBe(true);
  });
});

describe("任务235：API 客户端 - 定时提醒 CRUD", () => {
  it("AC30: apiGetSchedules 返回提醒列表", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiSetTokens, apiGetSchedules } = win.__test;
    apiSetTokens("tok", "ref", Date.now() + 60000);
    fetchMock.mockResolvedValue(mockResponse(true, {
      schedules: [{ id: "s1", type: "taskDue", cron: "0 9 * * *", enabled: true }],
    }, 200));
    const r = await apiGetSchedules();
    expect(r.ok).toBe(true);
    expect(r.data.schedules).toHaveLength(1);
  });

  it("AC31: apiCreateSchedule POST 新提醒", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiSetTokens, apiCreateSchedule } = win.__test;
    apiSetTokens("tok", "ref", Date.now() + 60000);
    fetchMock.mockResolvedValue(mockResponse(true, {
      schedule: { id: "s2", type: "dailyDigest", cron: "0 8 * * *", enabled: true },
    }, 201));
    const r = await apiCreateSchedule({ type: "dailyDigest", cron: "0 8 * * *", enabled: true });
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });

  it("AC32: apiUpdateSchedule PUT 更新提醒", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiSetTokens, apiUpdateSchedule } = win.__test;
    apiSetTokens("tok", "ref", Date.now() + 60000);
    fetchMock.mockResolvedValue(mockResponse(true, {
      schedule: { id: "s1", type: "taskDue", cron: "0 10 * * *", enabled: false },
    }, 200));
    const r = await apiUpdateSchedule("s1", { cron: "0 10 * * *", enabled: false });
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/notifications/schedules/s1");
    expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
  });

  it("AC33: apiDeleteSchedule DELETE 删除提醒", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiSetTokens, apiDeleteSchedule } = win.__test;
    apiSetTokens("tok", "ref", Date.now() + 60000);
    fetchMock.mockResolvedValue(mockResponse(true, { message: "提醒已删除" }, 200));
    const r = await apiDeleteSchedule("s1");
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });
});

describe("任务235：API 客户端 - 第三方集成", () => {
  it("AC34: apiGetIntegrations 返回集成状态", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiSetTokens, apiGetIntegrations } = win.__test;
    apiSetTokens("tok", "ref", Date.now() + 60000);
    fetchMock.mockResolvedValue(mockResponse(true, {
      integrations: [
        { provider: "notion", authorized: true, enabled: true },
        { provider: "todoist", authorized: false, enabled: false },
      ],
    }, 200));
    const r = await apiGetIntegrations();
    expect(r.ok).toBe(true);
    expect(r.data.integrations).toHaveLength(2);
  });

  it("AC35: apiConnectNotion 调用回调端点", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiSetTokens, apiConnectNotion } = win.__test;
    apiSetTokens("tok", "ref", Date.now() + 60000);
    fetchMock.mockResolvedValue(mockResponse(true, { message: "授权成功", provider: "notion" }, 200));
    const r = await apiConnectNotion("code123");
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toContain("notion");
  });

  it("AC36: apiConnectTodoist 调用回调端点", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiSetTokens, apiConnectTodoist } = win.__test;
    apiSetTokens("tok", "ref", Date.now() + 60000);
    fetchMock.mockResolvedValue(mockResponse(true, { message: "授权成功", provider: "todoist" }, 200));
    const r = await apiConnectTodoist("code123");
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toContain("todoist");
  });

  it("AC37: apiConnectGCalendar 调用回调端点", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiSetTokens, apiConnectGCalendar } = win.__test;
    apiSetTokens("tok", "ref", Date.now() + 60000);
    fetchMock.mockResolvedValue(mockResponse(true, { message: "授权成功", provider: "google" }, 200));
    const r = await apiConnectGCalendar("code123");
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toContain("google");
  });

  it("AC38: apiDisconnectIntegration DELETE 撤销授权", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiSetTokens, apiDisconnectIntegration } = win.__test;
    apiSetTokens("tok", "ref", Date.now() + 60000);
    fetchMock.mockResolvedValue(mockResponse(true, { message: "已撤销授权" }, 200));
    const r = await apiDisconnectIntegration("notion");
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });
});

describe("任务235：API 客户端 - 同步状态", () => {
  it("AC39: getSyncStatus 初始为 idle", () => {
    const win = loadApp(); win.localStorage.clear();
    const { getSyncStatus } = win.__test;
    expect(getSyncStatus()).toBe("idle");
  });

  it("AC40: setSyncStatus 更新状态", () => {
    const win = loadApp(); win.localStorage.clear();
    const { setSyncStatus, getSyncStatus } = win.__test;
    setSyncStatus("syncing");
    expect(getSyncStatus()).toBe("syncing");
    setSyncStatus("offline");
    expect(getSyncStatus()).toBe("offline");
    setSyncStatus("error");
    expect(getSyncStatus()).toBe("error");
    setSyncStatus("idle");
    expect(getSyncStatus()).toBe("idle");
  });

  it("AC41: setSyncStatus 渲染同步指示器 DOM", () => {
    const win = loadApp(); win.localStorage.clear();
    const { setSyncStatus } = win.__test;
    const el = win.document.getElementById("syncStatus");
    expect(el).toBeTruthy();
    setSyncStatus("syncing");
    expect(el.classList.contains("syncing")).toBe(true);
    setSyncStatus("offline");
    expect(el.classList.contains("offline")).toBe(true);
    setSyncStatus("error");
    expect(el.classList.contains("error")).toBe(true);
  });
});

describe("任务235：API 客户端 - 离线降级", () => {
  it("AC42: apiFetch 网络错误时 throw offline:true", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiFetch } = win.__test;
    fetchMock.mockRejectedValue(networkError());
    try {
      await apiFetch("/api/health");
      expect.fail("应该 throw offline 错误");
    } catch (e) {
      expect(e.offline).toBe(true);
    }
  });

  it("AC43: apiHealthCheck 离线返回 false", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiHealthCheck } = win.__test;
    fetchMock.mockRejectedValue(networkError());
    const ok = await apiHealthCheck();
    expect(ok).toBe(false);
  });

  it("AC44: apiHealthCheck 在线返回 true", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiHealthCheck } = win.__test;
    fetchMock.mockResolvedValue(mockResponse(true, { status: "ok" }, 200));
    const ok = await apiHealthCheck();
    expect(ok).toBe(true);
  });

  it("AC45: apiLogin 离线时 throw offline（调用方降级到本地）", async () => {
    const { win, fetchMock } = loadAppWithMockFetch();
    const { apiLogin, isApiLoggedIn } = win.__test;
    fetchMock.mockRejectedValue(networkError());
    try {
      await apiLogin("a@b.com", "password1");
      expect.fail("应该 throw offline 错误");
    } catch (e) {
      expect(e.offline).toBe(true);
    }
    // 离线登录不改变登录状态
    expect(isApiLoggedIn()).toBe(false);
  });
});

describe("任务235：API 客户端 - 数据同步 debounce", () => {
  it("AC46: scheduleSync 未登录时不触发同步", async () => {
    const win = loadApp(); win.localStorage.clear();
    const { scheduleSync, getSyncStatus } = win.__test;
    scheduleSync();
    // 等待 debounce 定时器
    await new Promise(r => setTimeout(r, 2500));
    expect(getSyncStatus()).toBe("idle");
  });

  it("AC47: doSync 未登录时直接返回不改变状态", async () => {
    const win = loadApp(); win.localStorage.clear();
    const { doSync, getSyncStatus } = win.__test;
    await doSync();
    expect(getSyncStatus()).toBe("idle");
  });

  it("AC48: doSync 登录后无变更数据时设为 idle", async () => {
    const win = loadApp(); win.localStorage.clear();
    const { apiSetTokens, doSync, getSyncStatus } = win.__test;
    apiSetTokens("tok", "ref", Date.now() + 60000);
    await doSync();
    expect(getSyncStatus()).toBe("idle");
  });
});

describe("任务235：API 客户端 - UI 绑定", () => {
  it("AC49: openAuthModal 打开登录弹窗", () => {
    const win = loadApp(); win.localStorage.clear();
    const { openAuthModal } = win.__test;
    const modal = win.document.getElementById("authModal");
    expect(modal).toBeTruthy();
    expect(modal.classList.contains("show")).toBe(false);
    openAuthModal();
    expect(modal.classList.contains("show")).toBe(true);
  });

  it("AC50: closeAuthModal 关闭登录弹窗", () => {
    const win = loadApp(); win.localStorage.clear();
    const { openAuthModal, closeAuthModal } = win.__test;
    const modal = win.document.getElementById("authModal");
    openAuthModal();
    closeAuthModal();
    expect(modal.classList.contains("show")).toBe(false);
  });

  it("AC51: 顶栏用户按钮存在", () => {
    const win = loadApp(); win.localStorage.clear();
    const btn = win.document.getElementById("btnUser");
    expect(btn).toBeTruthy();
  });

  it("AC52: 同步状态指示器存在", () => {
    const win = loadApp(); win.localStorage.clear();
    const el = win.document.getElementById("syncStatus");
    expect(el).toBeTruthy();
  });

  it("AC53: 设置面板 API 账号区存在", () => {
    const win = loadApp(); win.localStorage.clear();
    const panel = win.document.getElementById("apiAccountPanel");
    expect(panel).toBeTruthy();
  });

  it("AC54: 设置面板通知偏好区存在", () => {
    const win = loadApp(); win.localStorage.clear();
    const panel = win.document.getElementById("apiNotifyPanel");
    expect(panel).toBeTruthy();
  });

  it("AC55: 设置面板集成区存在", () => {
    const win = loadApp(); win.localStorage.clear();
    const panel = win.document.getElementById("apiIntegrationsPanel");
    expect(panel).toBeTruthy();
  });

  it("AC56: 登录表单存在 email/password 输入", () => {
    const win = loadApp(); win.localStorage.clear();
    const email = win.document.getElementById("authLoginEmail");
    const password = win.document.getElementById("authLoginPassword");
    expect(email).toBeTruthy();
    expect(password).toBeTruthy();
  });

  it("AC57: 注册表单存在 name/email/password/confirm 输入", () => {
    const win = loadApp(); win.localStorage.clear();
    const name = win.document.getElementById("authRegName");
    const email = win.document.getElementById("authRegEmail");
    const password = win.document.getElementById("authRegPassword");
    const confirm = win.document.getElementById("authRegConfirm");
    expect(name).toBeTruthy();
    expect(email).toBeTruthy();
    expect(password).toBeTruthy();
    expect(confirm).toBeTruthy();
  });
});

describe("任务235：API 客户端 - i18n 键", () => {
  it("AC58: MESSAGES.zh 包含 api_ 键", () => {
    const win = loadApp(); win.localStorage.clear();
    const { MESSAGES } = win.__test;
    expect(MESSAGES.zh["api.login"]).toBe("登录");
    expect(MESSAGES.zh["api.register"]).toBe("注册");
    expect(MESSAGES.zh["api.logout"]).toBe("登出");
    expect(MESSAGES.zh["api.syncIdle"]).toBe("已同步");
    expect(MESSAGES.zh["api.syncOffline"]).toBe("离线模式");
  });

  it("AC59: MESSAGES.en 包含 api_ 键", () => {
    const win = loadApp(); win.localStorage.clear();
    const { MESSAGES } = win.__test;
    expect(MESSAGES.en["api.login"]).toBe("Login");
    expect(MESSAGES.en["api.register"]).toBe("Register");
    expect(MESSAGES.en["api.logout"]).toBe("Log out");
    expect(MESSAGES.en["api.syncIdle"]).toBe("Synced");
    expect(MESSAGES.en["api.syncOffline"]).toBe("Offline");
  });

  it("AC60: t() 翻译 api_ 键", () => {
    const win = loadApp(); win.localStorage.clear();
    const { t } = win.__test;
    expect(t("api.login")).toBe("登录");
    expect(t("api.syncIdle")).toBe("已同步");
  });
});
