/**
 * schema-version.test.js —— 数据模式版本（ARCHITECTURE 契约里的 schemaVersion，v3.7.148 落地）
 * ------------------------------------------------------------------------------------------
 * 钉的是三条**安全语义**，不是"函数存在"：
 *   ① 迁移成功才推进版本；② 已是最新就跳过（省掉每次启动的全量重跑）；
 *   ③ **读到更高版本 ⇒ 不跑迁移、不覆盖数据**（旧版本打开新数据时唯一正确的做法）。
 *   另有 ④ 迁移失败时不推进版本（否则下次启动会误以为"已迁移过"而跳过）。
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const SCHEMA = PREFIX + "schema";

function boot(extra) {
  return loadApp({ storage: Object.assign({ [PREFIX + "onboarded"]: "true" }, extra || {}) });
}

describe("schemaVersion / migrateWithSchema", () => {
  it("首次（无版本记录）⇒ 跑迁移并把版本写成当前值", () => {
    const win = boot();
    win.localStorage.removeItem(SCHEMA);
    let calls = 0;
    win.migrate = function () { calls++; return true; };
    const r = win.migrateWithSchema();
    expect(calls, "没有版本记录时必须迁移").toBe(1);
    expect(r.ok).toBe(true);
    expect(r.from).toBe(0);
    expect(r.to).toBe(1);
    expect(JSON.parse(win.localStorage.getItem(SCHEMA)).v).toBe(1);
  });

  it("已是最新版本 ⇒ 仍然跑一次 migrate（里面有每次启动都要做的损坏守卫），但不重写版本记录", () => {
    const win = boot();
    let calls = 0;
    win.migrate = function () { calls++; return true; };
    win.localStorage.setItem(SCHEMA, JSON.stringify({ v: 1, at: 111 }));
    const r = win.migrateWithSchema();
    /* 不能跳过：migrate() 里的 _guardGenericJsonKeys 是每次启动都要跑的损坏守卫。
       跳过它 = 后续被写坏的数据再也没人兜。 */
    expect(calls, "守卫必须照跑").toBe(1);
    expect(r.ok).toBe(true);
    expect(JSON.parse(win.localStorage.getItem(SCHEMA)).at, "版本没变就不该重写（少一次写盘）").toBe(111);
  });

  it("读到更高版本 ⇒ 只读告警、不跑迁移、不动数据（旧版本不许覆盖新数据）", () => {
    const win = boot();
    const tasks = [{ id: "t1", sc: "office", title: "新版本写的", status: "todo", tags: [], created: 1 }];
    win.localStorage.setItem(PREFIX + "tasks", JSON.stringify(tasks));
    win.localStorage.setItem(SCHEMA, JSON.stringify({ v: 99 }));
    let calls = 0;
    win.migrate = function () { calls++; return true; };
    const r = win.migrateWithSchema();
    expect(calls, "更高版本的数据绝不能被本版本的迁移改写").toBe(0);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("newer");
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "tasks")), "数据必须原样").toEqual(tasks);
    expect(JSON.parse(win.localStorage.getItem(SCHEMA)).v, "版本号也不许被写低").toBe(99);
  });

  it("迁移失败 ⇒ 不推进版本（下次启动会重试，而不是误以为已迁移）", () => {
    const win = boot();
    win.localStorage.removeItem(SCHEMA);
    win.migrate = function () { return false; };
    const r = win.migrateWithSchema();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("failed");
    expect(win.localStorage.getItem(SCHEMA), "失败时不许留下版本记录").toBeNull();
  });
});
