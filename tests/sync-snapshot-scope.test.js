// 云同步快照安全范围测试（v3.7.58）
// 背景：快照此前枚举全部 wb_agent_* 键，会把 wb_agent_cfg（AI Key 密文）推上自建后端；
//       无 IndexedDB 的环境更会把设备密钥本体 wb_agent___dk 一并上传（"密文+钥匙"同交）。
//       v3.7.58 起 _buildCloudSnapshot 排除：cfg / __dk / pre_restore_backup / sync_meta。
// 策略：loadApp 后手工播种各键，调 win.__test._buildCloudSnapshot 断言排除与保留。

import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

describe("云同步快照安全范围（_buildCloudSnapshot）", () => {
  it("1: 快照包含业务数据键与 _deviceMeta", () => {
    const win = loadApp();
    win.localStorage.setItem("wb_agent_tasks", JSON.stringify([{ id: "t1" }]));
    win.localStorage.setItem("wb_agent_notes", JSON.stringify([{ id: "n1" }]));
    const snap = win.__test._buildCloudSnapshot();
    expect(snap["wb_agent_tasks"]).toBe(JSON.stringify([{ id: "t1" }]));
    expect(snap["wb_agent_notes"]).toBe(JSON.stringify([{ id: "n1" }]));
    expect(snap._deviceMeta).toBeTruthy();
    expect(snap._deviceMeta.deviceId).toBeTruthy();
  });

  it("2: 快照不包含 AI 配置（cfg，内含 Key 密文）", () => {
    const win = loadApp();
    win.localStorage.setItem("wb_agent_cfg", JSON.stringify({
      enabled: true,
      profiles: [{ id: "p1", base: "https://api.example.com", model: "m", key: { __enc: true, iv: "x", data: "y" } }]
    }));
    const snap = win.__test._buildCloudSnapshot();
    expect(snap["wb_agent_cfg"]).toBeUndefined();
  });

  it("3: 快照不包含设备密钥（__dk，localStorage 回退路径）", () => {
    const win = loadApp();
    win.localStorage.setItem("wb_agent___dk", "base64-device-key-material");
    const snap = win.__test._buildCloudSnapshot();
    expect(snap["wb_agent___dk"]).toBeUndefined();
  });

  it("4: 快照不包含本机回滚备份（pre_restore_backup，内嵌全部本地键值）", () => {
    const win = loadApp();
    win.localStorage.setItem("wb_agent_pre_restore_backup", JSON.stringify({
      at: 1, keys: { "wb_agent_cfg": "..." }
    }));
    const snap = win.__test._buildCloudSnapshot();
    expect(snap["wb_agent_pre_restore_backup"]).toBeUndefined();
  });

  it("5: 快照不包含同步元数据（sync_meta）", () => {
    const win = loadApp();
    win.localStorage.setItem("wb_agent_sync_meta", JSON.stringify({ lastPushAt: 1 }));
    const snap = win.__test._buildCloudSnapshot();
    expect(snap["wb_agent_sync_meta"]).toBeUndefined();
  });
});
