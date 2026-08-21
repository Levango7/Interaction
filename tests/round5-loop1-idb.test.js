import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * 架构项① · IndexedDB 持久镜像（Loop 1）回归测试
 * ----------------------------------------------------------------
 * jsdom 无原生 indexedDB：本文件重点验证「无 IDB 环境安全降级」契约，
 * 以及镜像范围判定纯函数 idbShouldMirror。
 *   1) idbShouldMirror：wb_agent_* / wb_custom_links 命中，其余不命中
 *   2) 无 indexedDB 时：idbOpen 返回 null；各函数 no-op，不抛、不阻塞
 *   3) save 热路径：接入 idbQueueMirror 后行为不变（localStorage 仍是真相源）
 *   4) initIdb 启动：无 IDB 时返回 { mirrored:0 }
 */

describe("架构项① IndexedDB 持久镜像", () => {
  let win, __test;
  beforeEach(async () => {
    win = await loadApp();
    __test = win.__test;
    __test.setTasks([]);
  });

  it("idbShouldMirror：wb_agent_* 前缀命中", () => {
    expect(__test.idbShouldMirror("wb_agent_tasks")).toBe(true);
    expect(__test.idbShouldMirror("wb_agent_cfg")).toBe(true);
    expect(__test.idbShouldMirror("wb_agent_chat_office")).toBe(true);
  });

  it("idbShouldMirror：wb_custom_links 命中，外部键不命中", () => {
    expect(__test.idbShouldMirror("wb_custom_links")).toBe(true);
    expect(__test.idbShouldMirror("wb_other_app")).toBe(false);
    expect(__test.idbShouldMirror("foo")).toBe(false);
    expect(__test.idbShouldMirror("")).toBe(false);
  });

  it("无 indexedDB：idbOpen 返回 null", async () => {
    expect(typeof win.indexedDB).toBe("undefined");
    const db = await __test.idbOpen();
    expect(db).toBeNull();
  });

  it("无 indexedDB：各函数安全 no-op，不抛、不阻塞", async () => {
    expect(await __test.idbMirrorKey("wb_agent_tasks", [])).toBeUndefined();
    expect(await __test.idbReadKey("wb_agent_tasks")).toBeUndefined();
    expect(await __test.idbDeleteKey("wb_agent_tasks")).toBeUndefined();
    expect(await __test.idbKeys()).toEqual([]);
    expect(await __test.idbFlushQueue()).toBe(0);
    expect(await __test.idbRestoreAll()).toEqual([]);
    expect(await __test.idbClearAll()).toBe(0);
    expect(await __test.idbMirrorAll()).toBe(0);
    expect(await __test.initIdb()).toEqual({ mirrored: 0 });
  });

  it("save 热路径不受 IDB 钩子影响：localStorage 仍是真相源", () => {
    __test.execTool("create_task", { scenario: "office", title: "IDB 不影响保存" }, true);
    const raw = win.localStorage.getItem("wb_agent_tasks");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw).some(t => t.title === "IDB 不影响保存")).toBe(true);
  });

  it("idbQueueMirror：非镜像键不入队，镜像键入队但无 IDB 时冲刷为 0", async () => {
    __test.idbQueueMirror("foo", { a: 1 });          // 非镜像键，被忽略
    __test.idbQueueMirror("wb_agent_tasks", []);      // 镜像键，入队
    const flushed = await __test.idbFlushQueue();
    expect(flushed).toBe(0); // 无 IDB：入队但不落盘，返回 0
  });

  it("idbRestoreAll：无 IDB 时返回空数组不崩溃", async () => {
    const restored = await __test.idbRestoreAll();
    expect(restored).toEqual([]);
  });
});
