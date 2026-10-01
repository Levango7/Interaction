import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * integration-deprecated.test.js —— 集成同步 / 通知层的「废弃」状态守护（v3.7.60）
 *
 * 用户 2026-09-28 的处置决定：**先标记废弃，等渠道定好再动**。所以这里既不测功能，
 * 也不许代码悄悄变化，只锁三件事：
 *   ① 24 个零调用函数都还带着 @deprecated 标记（没被人顺手摘掉）；
 *   ② 它们仍然**没有应用内调用方**（只有同为废弃集的函数互相调用才算合法）；
 *   ③ 真活着的 `*Connect` / `*Disconnect` 没被误标废弃（它们由
 *      `window[name + "Connect"]` 字符串拼接派发，静态普查看不见，最容易被误判）。
 * 一旦 ② 变红，说明有人把某条链路接上了 —— 那时应当摘掉对应标记并补真发请求的用例，
 * 而不是把这条守护改松。
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "src");
const MARK = "@deprecated v3.7.60 应用内零调用方";

/* v3.7.66：飞书 / 钉钉的 6 个旧函数（× SendMessage / NotifyEvent / CreateTaskFromMessage）
   已随「群机器人 webhook 通道」接通而删除 —— 那套 appKey/appSecret + chatId 个人配不通，
   留着只是死码。名单从 30 → 24。
   v3.7.69：Slack 改型「群机器人 Incoming Webhook」—— 3 个 Bot Token 模型旧函数
   （slackNotifyEvent / slackSendMessage / slackCreateTaskFromMessage）随之删除，名单 24 → 21。
   v3.7.70：Notion 接上**任务单向推送**消费点（面板「推送任务」→ notionPushTasks → notionSyncTask）
   —— notionSyncTask 摘掉标记并补了真发请求的用例（本文件 §「仍然零调用」正是被它触发变红才发现的）。
   同轮把 notionSyncTask 收窄成纯 push：pull 分支删除 ⇒ `_intNotionPullWriteback`（拉取回写辅助）
   与 `_intNotionParsePage`（页面→本地任务的解析器）一并删除 —— 留着前者是陷阱（再被调用时会推而不是拉），
   留后者是无人调用的尸体。名单 21 → 19，DELETED +2。
   v3.7.70 续：Linear 也接上**任务单向推送**（同款消费点），linearSyncIssue 摘标记并补用例；
   状态映射仍按"未接"处理（Linear 要 stateId 而非状态名，见该函数注释），linearMapStatus 继续冻结。名单 19 → 18。
   slack/jira/calendar 剩余的仍按废弃冻结。DELETED 名单守护它们不回流
   （有人重新实现必须走"摘废弃 + 补真发用例"的正门）。 */
const DEPRECATED = `integrationListProviders integrationEnableProvider integrationDisableProvider integrationConfigureProvider
integrationGetStatus notionSyncNote notionListSynced linearListIssues linearMapStatus
jiraSyncIssue jiraListIssues jiraMapStatus
calendarSyncEvent calendarCreateEvent calendarListEvents calendarUpdateEvent
calendarDeleteEvent _intFindLocalId`.split(/\s+/).filter(Boolean);

/* 已整体删除的旧模型函数 / 死路径：不许回流 */
const DELETED = `feishuSendMessage feishuNotifyEvent feishuCreateTaskFromMessage
dingtalkSendMessage dingtalkNotifyEvent dingtalkCreateTaskFromMessage
slackNotifyEvent slackSendMessage slackCreateTaskFromMessage
_intNotionPullWriteback _intNotionParsePage`.split(/\s+/).filter(Boolean);

/* 真活着的：由 openIntegrationConfig / 断开按钮 拼接派发，绝不能标废弃。
   v3.7.70 起 Notion 的推送链（notionPushTasks ← 面板按钮）也是活的，一并纳入 ——
   谁把它们标成废弃，这条会红。 */
const LIVE = ["notionConnect", "linearConnect", "jiraConnect", "slackConnect", "feishuConnect",
  "dingtalkConnect", "calendarConnect", "notionDisconnect", "linearDisconnect", "jiraDisconnect",
  "slackDisconnect", "feishuDisconnect", "dingtalkDisconnect", "calendarDisconnect",
  "renderIntegrationPanel", "openIntegrationConfig", "integrationRegisterProvider",
  "integrationGetProvider", "integrationRemoveProvider", "_intJiraBase",
  "notionSyncTask", "notionPushTasks", "linearSyncIssue", "linearPushTasks"];

const srcFiles = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith(".js"));
const texts = new Map(srcFiles.map((f) => [f, fs.readFileSync(path.join(SRC_DIR, f), "utf8")]));

/* v3.7.63：ui-global-events 按 section 拆成 8 块后，本文件关心的符号横跨其中两块 ——
   面板渲染 / 拼接派发在 ui-global-events.js，30 个废弃定义与 *Connect 在 ui-ge-integrations.js。
   故对「全局事件绑定家族」合并读取（ui-ge-* 前缀自动纳入，后续再拆块不会漏）。 */
const geText = () => srcFiles.filter((f) => f === "ui-global-events.js" || f.startsWith("ui-ge-"))
  .map((f) => texts.get(f)).join("\n");

/** 某符号在某个 src 文件里的"引用行"（排除定义行、注释行、__test 桥的裸标识符列表行） */
function refLines(file, name) {
  const lines = texts.get(file).split(/\r?\n/);
  const out = [];
  const re = new RegExp("(?<![\\w$])" + name + "(?![\\w$])");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!re.test(l)) continue;
    if (/^\s*(?:async\s+)?function\s+/.test(l) && new RegExp("function\\s+" + name + "\\b").test(l)) continue; // 定义
    if (/^\s*(?:\/\/|\*|\/\*)/.test(l)) continue;                                       // 注释行
    if (/^[A-Za-z_$][\w$]*\s*(?:,\s*[A-Za-z_$][\w$]*)*\s*,?\s*$/.test(l.trim())) continue; // __test 桥那种裸标识符行
    /* 找到"最近的、位于其上方的顶层函数定义"作为宿主 */
    let host = null;
    for (let j = i; j >= 0; j--) {
      const m = /^(?:async\s+)?function\s+([A-Za-z_]\w*)\s*\(/.exec(lines[j]);
      if (m) { host = m[1]; break; }
    }
    out.push({ line: i + 1, host, text: l.trim().slice(0, 80) });
  }
  return out;
}

describe("集成同步/通知层：废弃标记仍在（用户决定「先标记废弃，等渠道定好再动」）", () => {
  it("18 个零调用函数逐个带 @deprecated 标记", () => {
    const lines = geText().split(/\r?\n/);
    const missing = DEPRECATED.filter((n) => {
      const def = lines.findIndex((l) => /^(?:async\s+)?function\s+/.test(l) && new RegExp("function\\s+" + n + "\\b").test(l));
      if (def < 0) return true;
      /* 标记必须在定义行之前的 1~3 行内（JSDoc 末行或紧邻的单行注释） */
      for (let k = 1; k <= 3; k++) {
        const p = lines[def - k];
        if (p && p.includes(MARK)) return false;
      }
      return true;
    });
    expect(missing, "这些函数丢了废弃标记：\n  " + missing.join("\n  ")).toEqual([]);
  });

  it("标记数量恰好等于名单长度（防止无差别批量插标记）", () => {
    const n = (geText().match(new RegExp(MARK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
    expect(n, "带标记的函数数应与 DEPRECATED 名单一致").toBe(DEPRECATED.length);
  });

  it("活路径（*Connect / *Disconnect / 面板 / 域名校验）没有被误标废弃", () => {
    const lines = geText().split(/\r?\n/);
    const wrong = LIVE.filter((n) => {
      const def = lines.findIndex((l) => /^(?:async\s+)?function\s+/.test(l) && new RegExp("function\\s+" + n + "\\b").test(l));
      if (def < 0) return false;
      for (let k = 1; k <= 3; k++) if (lines[def - k] && lines[def - k].includes(MARK)) return true;
      return false;
    });
    expect(wrong, "这些是**真活着**的函数，不该带废弃标记：\n  " + wrong.join("\n  ")).toEqual([]);
  });

  it("拼接派发后缀确实存在（前提不成立时本文件的结论就全废了，所以先锁前提）", () => {
    const t = geText();
    expect(t).toMatch(/window\[\s*\w+\s*\+\s*"Connect"\s*\]/);
    expect(t).toMatch(/window\[\s*\w+\s*\+\s*"Disconnect"\s*\]/);
  });
});

describe("集成同步/通知层：仍然零调用（有人接上就该摘标记并补用例）", () => {
  const set = new Set(DEPRECATED);
  const violations = [];
  for (const name of DEPRECATED) {
    for (const f of srcFiles) {
      for (const r of refLines(f, name)) {
        if (r.host && set.has(r.host)) continue;   // 废弃集内部互调 = 传递性死，允许
        violations.push(`${f}:${r.line} ${name} ← 宿主 ${r.host || "(顶层)"}｜${r.text}`);
      }
    }
  }
  it("18 个函数没有任何「非废弃集内」的调用方", () => {
    expect(violations,
      "这些废弃函数出现了新的调用方 —— 说明渠道定了并接上了链路。\n" +
      "正确做法：摘掉对应 @deprecated、更新 docs/product-scope.md §三 与本文件的 DEPRECATED 名单、" +
      "并补真发请求的用例。\n  " + violations.join("\n  ")).toEqual([]);
  });

  it("废弃集内部互调仅限已知的 2 处（防止悄悄长出新的内部依赖）", () => {
    const internal = [];
    for (const name of DEPRECATED) {
      for (const f of srcFiles) {
        for (const r of refLines(f, name)) if (r.host && set.has(r.host)) internal.push(r.host + " → " + name);
      }
    }
    /* v3.7.70：原来仅有的两处内部边都挂在 _intNotionPullWriteback 上，它已随 pull 一并删除，
       所以现在应当是**零内部互调** —— 再长出新的内部依赖就说明有人在废弃集里互相接线。 */
    expect(internal.sort()).toEqual([]);
  });

  it("已删的 11 个函数不回流（飞书/钉钉 6 个 + Slack 3 个 + Notion pull 路径 2 个）", () => {
    const lines = geText().split(/\r?\n/);
    const back = DELETED.filter((n) => lines.some((l) => new RegExp("function\\s+" + n + "\\b").test(l)));
    expect(back, "这些旧凭据模型的函数被重新实现了 —— 渠道改型已定案，回流必须走「摘废弃 + 补真发用例」的正门").toEqual([]);
  });
});
