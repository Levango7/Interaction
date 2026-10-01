import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * notion-push.test.js —— Notion「任务单向推送」消费点（v3.7.70）
 *
 * 为什么单独一个文件：这一段是集成簇里**第一个真正的数据外发消费点**
 * （v3.7.60 起那批函数一直零调用，靠 @deprecated 冻着）。所以它要证的，
 * 不只是"函数能跑"，而是三件容易被糊过去的事：
 *   ① 真有调用点 —— 面板上按得着按钮（函数正确 ≠ 被接线）；
 *   ② 逐条记账 —— 部分失败必须报"几条没成功 + 为什么"，不许因为多数成功就整体报成功；
 *   ③ 幂等 —— 同一任务第二次推送是 PATCH 而不是再建一页（靠同步状态表）。
 * 全部用 integrationSetHttpClient 替身，测试期间零外网请求。
 */
function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

/** 记录请求；默认成功，可按 url 定制失败 */
function stubHttp(win, failWhen) {
  const calls = [];
  win.integrationSetHttpClient(async (url, opts) => {
    const u = String(url);
    const rec = {
      url: u, method: (opts && opts.method) || "GET",
      body: opts && opts.body ? JSON.parse(opts.body) : null,
      headers: (opts && opts.headers) || {}
    };
    calls.push(rec);
    const bad = typeof failWhen === "function" ? failWhen(rec) : false;
    /* 页面 id 由标题派生：断言"PATCH 到刚建的那一页"时不用去猜调用次序 */
    const title = rec.body && rec.body.properties && rec.body.properties.Title
      && rec.body.properties.Title.title[0].text.content;
    const body = bad
      ? { object: "error", code: "validation_error", message: "Title is not a property that exists" }
      : { id: title ? "page-of-" + title : "page-me" };
    return { ok: !bad, status: bad ? 400 : 200, body: body, json: async () => body };
  });
  return calls;
}

const T = (id, title) => ({ id: id, sc: "office", title: title, status: "todo", due: "", priority: "", doneAt: null, note: "", tags: [], created: Date.now() });

async function connected(win, failWhen) {
  const calls = stubHttp(win, failWhen);
  const prov = await win.notionConnect({ token: "secret_test_token", databaseId: "db-1" });
  expect(prov, "前提：Notion 已连接").toBeTruthy();
  calls.length = 0;                      /* 只看推送阶段 */
  return calls;
}

describe("Notion 单向推送：逐条记账", () => {
  it("未同步过的任务 → POST /v1/pages，按 created 计数，带对头与属性", async () => {
    const win = freshWin();
    const calls = await connected(win);
    const r = await win.notionPushTasks([T("t1", "写周报"), T("t2", "修复报错")]);
    expect(r.ok).toBe(true);
    expect(r.created).toBe(2);
    expect(r.updated).toBe(0);
    expect(r.failed).toEqual([]);
    expect(calls.length).toBe(2);
    expect(calls[0].url).toBe("https://api.notion.com/v1/pages");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers.Authorization).toBe("Bearer secret_test_token");
    expect(calls[0].headers["Notion-Version"]).toBeTruthy();
    expect(calls[0].body.parent.database_id).toBe("db-1");
    const title = calls[0].body.properties.Title.title[0].text.content;
    expect(title, "推的必须是这条任务自己的标题").toBe("写周报");
  });

  it("已推送过的任务再推 → PATCH 同一页面，按 updated 计数（靠同步状态表，不重复建页）", async () => {
    const win = freshWin();
    const calls = await connected(win);
    const first = await win.notionPushTasks([T("t1", "写周报")]);
    expect(first.created).toBe(1);
    calls.length = 0;
    const second = await win.notionPushTasks([T("t1", "写周报")]);
    expect(second.created, "第二次不该再建一条").toBe(0);
    expect(second.updated).toBe(1);
    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url, "必须打回第一次创建的那个页面，而不是再建一页")
      .toBe("https://api.notion.com/v1/pages/page-of-写周报");
  });

  it("部分失败如实报：条数 + 平台给的真实原因，不许整体报成功", async () => {
    const win = freshWin();
    /* 第 2 条推送失败 */
    const calls = await connected(win, (rec) => rec.body && rec.body.properties.Title.title[0].text.content === "修复报错");
    const r = await win.notionPushTasks([T("t1", "写周报"), T("t2", "修复报错"), T("t3", "缴水电费")]);
    expect(r.ok, "有一条没推上去就不能报成功").toBe(false);
    expect(r.created).toBe(2);
    expect(r.failed.length).toBe(1);
    expect(r.failed[0].title, "要说清是哪一条").toBe("修复报错");
    expect(r.failed[0].error, "要带出平台给的原因，不能只回 sync_failed：" + r.failed[0].error)
      .toMatch(/Title is not a property|validation_error|HTTP 400/);
    expect(calls.length).toBe(3);
  });

  it("未连接：如实报 provider_not_available，且一个请求都不发", async () => {
    const win = freshWin();
    const calls = stubHttp(win);
    calls.length = 0;
    const r = await win.notionPushTasks([T("t1", "写周报")]);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("provider_not_available");
    expect(calls.length, "没连接就不该有外发").toBe(0);
  });

  it("没填 Database ID：每条如实失败，不许当成推送成功", async () => {
    const win = freshWin();
    const calls = stubHttp(win);
    await win.notionConnect({ token: "secret_test_token" });   /* 故意不给 databaseId */
    calls.length = 0;
    const r = await win.notionPushTasks([T("t1", "写周报")]);
    expect(r.ok).toBe(false);
    expect(r.failed[0].error).toBe("missing_database_id");
    expect(calls.length).toBe(0);
  });

  it("空列表：no_tasks，不发请求", async () => {
    const win = freshWin();
    const calls = await connected(win);
    const r = await win.notionPushTasks([]);
    expect(r.error).toBe("no_tasks");
    expect(calls.length).toBe(0);
  });

  it("非数组入参不抛错（按钮拿到的永远是数组，但边界也要兜住）", async () => {
    const win = freshWin();
    await connected(win);
    for (const bad of [null, undefined, "x", 42]) {
      const r = await win.notionPushTasks(bad);
      expect(r.ok).toBe(false);
      expect(r.error).toBe("no_tasks");
    }
  });
});

describe("Notion 单向推送：面板真的有入口（函数正确 ≠ 被接线）", () => {
  it("未连接时没有推送按钮；连接后才出现 [data-int-push=notion]", async () => {
    const win = freshWin();
    stubHttp(win);
    win.renderIntegrationPanel();
    expect(win.document.querySelector('[data-int-push="notion"]'), "未连接不该有推送入口").toBeNull();

    await win.notionConnect({ token: "secret_test_token", databaseId: "db-1" });
    win.renderIntegrationPanel();
    const btn = win.document.querySelector('[data-int-push="notion"]');
    expect(btn, "连接后必须出现推送入口").toBeTruthy();
    expect(btn.textContent).toContain("推送");
    expect(btn.disabled, "推送按钮应当是可点的").toBe(false);
  });

  it("推送范围是「未完成任务」，已完成的不会被算进去", async () => {
    const win = freshWin();
    const calls = await connected(win);
    win.setTasks([
      T("t1", "未完成 A"),
      Object.assign(T("t2", "已完成 B"), { status: "done", doneAt: Date.now() })
    ]);
    win.renderIntegrationPanel();
    const btn = win.document.querySelector('[data-int-push="notion"]');
    expect(btn, "前提：入口在").toBeTruthy();
    /* 直接驱动按钮：它自己会取 getTasks() 里的未完成项 */
    win.confirm = () => true;
    btn.onclick();
    await new Promise((r) => setTimeout(r, 120));
    expect(calls.length, "只该推那一条未完成的").toBe(1);
    expect(calls[0].body.properties.Title.title[0].text.content).toBe("未完成 A");
  });
});
