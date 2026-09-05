# B 档 v3 完整实施蓝图（tools 恢复后按图施工）

> 工具后端在反复 B 1/8 失败后，bash 子进程持续拒绝参数。我无法用 git/Edit 验证改动。**改策略**：把所有 B 档内容写进此笔记，含**完整代码片段 + 插入位置 + 撤销命令**。工具恢复后照此施工。

---

## A. 通用撤销命令

```bash
# 在 F:\Nexus\Interaction 执行
git status
# 如果 agent-workbench.html modified
git checkout HEAD -- agent-workbench.html
# 验证 A 档测试恢复
npx vitest run tests/integration/a-tier-fixes.test.js
# 期望 22/22 全绿
```

如果还有失败，检查测试环境（vitest 缓存：

```bash
npx vitest run --no-cache
```

---

## B 1/8：项目视图（office.project tab）

### A. 插入位置

在 `agent-workbench.html` 中查找锚点：

```javascript
project: function(){
    return _featureCardHtml({
      key:"projects", title:t("tool.project.name","项目管理"), icon:ic("target"),
      fields:[
```

在 `icon:ic("target"),` 行**后**插入（即 `fields:[` 之前）：

### B. 完整代码片段

```javascript
      // v3.2 B 1/8: project view (read-only task aggregation by project tag)
      rowAfter:function(recs){
        if(!recs || !recs.length) return "";
        var tasks = (typeof getTasks === "function") ? getTasks() : [];
        var byProject = {};
        tasks.forEach(function(task){
          if(task.deletedAt) return;
          var tag = (task.tags || []).find(function(x){ return String(x).indexOf("project:") === 0; });
          if(!tag) return;
          var name = tag.slice(8) || "(unnamed)";
          if(!byProject[name]) byProject[name] = { done:0, total:0, owner:"" };
          byProject[name].total++;
          if(task.status === "done") byProject[name].done++;
        });
        recs.forEach(function(r){
          var name = r.name; if(!name) return;
          if(!byProject[name]) byProject[name] = { done:0, total:0, owner:r.owner||"" };
          else if(r.owner) byProject[name].owner = r.owner;
        });
        var names = Object.keys(byProject);
        if(!names.length) return "";
        names.sort(function(a,b){ return (byProject[b].total-byProject[b].done) - (byProject[a].total-byProject[a].done); });
        var rows = names.slice(0, 6).map(function(n){
          var p2 = byProject[n];
          var pct = p2.total ? Math.round(p2.done*100/p2.total) : 0;
          var remain = p2.total - p2.done;
          return '<div class="proj-view-row"><span class="proj-view-name">' + n + '</span><span class="proj-view-pct">' + pct + '%</span><span class="proj-view-bar"><span class="track"><span class="fill" style="width:' + pct + '%"></span></span></span><span class="proj-view-remain">' + (remain > 0 ? (remain + ' open') : 'done') + '</span></div>';
        }).join("");
        return '<div class="proj-view"><div class="proj-view-head">Task progress (by project tag)</div>' + rows + '</div>';
      },
```

### C. 验证（插入后跑）

```bash
# 1. 语法检查
node -e "const fs=require('fs');const acorn=require('F:/Nexus/Interaction/node_modules/acorn/dist/acorn.js');try{acorn.parse(fs.readFileSync('F:/Nexus/Interaction/agent-workbench.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1],{ecmaVersion:'latest',sourceType:'script'});console.log('SYNTAX OK')}catch(e){console.log(e.message+' L'+e.loc.line+':'+e.loc.column)}"

# 2. 跑 A 档测试（必须仍是 22/22 绿）
npx vitest run tests/integration/a-tier-fixes.test.js tests/tools.test.js

# 3. 跑项目卡集成测试（新建）
```

### D. 集成测试

在 `tests/integration/a-tier-fixes.test.js` 末尾 describe 块**前**加：

```javascript
  it("B 1/8: project view rowAfter shows project:tag aggregates", () => {
    // 必须存在 rowAfter 函数
    expect(S).toMatch(/project:\s*function\(\)\{[\s\S]*?rowAfter:/);
    // 必须有 proj-view 容器
    expect(S).toMatch(/class="proj-view"/);
    // 必须有 byProject 聚合
    expect(S).toMatch(/byProject\[name\]/);
  });
```

### E. 撤销

如果 B 1/8 验证失败，删除整个 `// v3.2 B 1/8: project view` 开头到 `},` 结束的块（约 31 行）。

---

## B 2/8：会议自动派活（office.meeting tab）

### A. 位置

在 `meeting` 卡的 `rowAfter` 字段（**当前不存在**——加新）插入；放在 `sum` 函数块之后、`emptyTip` 之前：

```javascript
meeting: function(){
  return _featureCardHtml({
    key:"office_meetings", title:t("tool.meeting.name","会议管理"), icon:ic("chat"),
    fields:[ ... 原有 fields ... ],
    cols:[ ... 原有 cols ... ],
    sum: function(recs){ ... 原有 sum ... },
    // ↓↓↓ 在这里插入 ↓↓↓
    rowAfter: function(recs){ ... action items detection ... },
    emptyTip: ...
  });
}
```

### B. 完整代码

```javascript
    // v3.2 B 2/8: meeting -> action items -> tasks
    rowAfter: function(recs){
      if(!recs || !recs.length) return "";
      var items = [];
      recs.forEach(function(r){
        if(!r.note) return;
        var lines = String(r.note).split(/\n/);
        lines.forEach(function(line){
          var m = line.match(/^\s*(?:(\d+)\.\s*|@\s*([^\s,：:]+)\s*[：:]\s*|\-\s+|→\s*)(.{2,60})/);
          if(m){
            var who = m[2] || "";
            var text = (m[3] || m[0]).trim();
            if(text && text.length > 3){
              items.push({ who: who, text: text, source: r.id });
            }
          }
        });
      });
      if(!items.length) return "";
      var itemsHtml = items.slice(0, 5).map(function(it){
        return '<div class="meeting-action-item">' +
          (it.who ? '<span class="meeting-action-who">@' + esc(it.who) + '</span> ' : '') +
          '<span class="meeting-action-text">' + esc(it.text) + '</span>' +
          '<button type="button" class="addbtn xs" data-meeting-task="' + esc(it.source) + '|' + esc(it.who) + '|' + esc(it.text) + '">+ task</button>' +
          '</div>';
      }).join("");
      return '<div class="meeting-actions"><div class="meeting-actions-head">Action items</div>' + itemsHtml + '</div>';
    },
    bind: function(){
      // override the default bind to add click handler for action item "task" button
      _bindRecordTool("office_meetings", ["title","type","date","host","who","duration","note"]);
      $$("[data-meeting-task]").forEach(function(btn){
        btn.onclick = function(){
          var parts = (btn.getAttribute("data-meeting-task") || "").split("|");
          var tasks = (typeof getTasks === "function") ? getTasks() : [];
          tasks.push({
            id: Date.now().toString(36),
            sc: "office",
            title: (parts[1] ? "[" + parts[1] + "] " : "") + parts[2],
            due: todayStr(),
            priority: "",
            status: "todo",
            doneAt: null,
            note: "",
            tags: ["meeting-action"],
            created: Date.now()
          });
          setTasks(tasks);
          toast("已生成任务：" + parts[2], "ok");
        };
      });
    }
```

### C. 集成测试

```javascript
  it("B 2/8: meeting -> action item task button creates office task", () => {
    expect(S).toMatch(/meeting:\s*function\(\)\{[\s\S]*?rowAfter:/);
    expect(S).toContain("data-meeting-task");
    expect(S).toContain("meeting-action-item");
  });
```

---

## B 3/8：知识库标签筛选（study.knowledge tab）

### A. 位置

`knowledge: function(){ return _featureCardHtml({...})` 内 `cols:[...]` 之后、`sum` 之前；加 `rowAfter` 标签 chips + 过滤渲染。

### B. 完整代码（待 B 1/8 验证后写）

---

## B 4/8：今日总览 4 卡（life 概览顶部）

### A. 位置

`renderOverview` 函数顶部插入 4 卡（before existing metrics strip）。

### B. 完整代码

```javascript
// v3.2 B 4/8: today overview (4 cards)
const today = todayStr();
const weekAgo = (function(){
  const d = new Date(); d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
})();
const monthY = today.slice(0, 7);
const todayOpen = getActiveTasks().filter(function(t){
  return t.status !== "done" && !t.deletedAt && t.due === today;
}).length;
const weekMeetings = (getRec("office_meetings") || []).filter(function(r){
  return r.date && r.date >= weekAgo;
}).length;
const monthBills = (getRec("life_bills") || []).filter(function(r){
  return r.date && r.date.slice(0, 7) === monthY;
}).length;
const weekSport = (typeof getHealthRecs === "function" ? getHealthRecs() : []).filter(function(r){
  return r.type === "运动记录" && r._date && r._date >= weekAgo;
}).length;
const overview4 = '<div class="overview-4cards">' +
  '<div class="overview-card"><div class="v">' + todayOpen + '</div><div class="l">今日待办</div></div>' +
  '<div class="overview-card"><div class="v">' + weekMeetings + '</div><div class="l">本周会议</div></div>' +
  '<div class="overview-card"><div class="v">' + monthBills + '</div><div class="l">本月缴费</div></div>' +
  '<div class="overview-card"><div class="v">' + weekSport + '</div><div class="l">本周运动</div></div>' +
  '</div>';
```

插入到 `renderOverview` 函数最顶部（在 `const tasks = getActiveTasks();` 之前），然后在模板拼接位置 `<div class="card">` 之前插 `${overview4}`。

### C. CSS

```css
.overview-4cards{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-3);margin-bottom:var(--space-3)}
.overview-card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius-md);padding:var(--space-3);text-align:center}
.overview-card .v{font-size:var(--fs-2xl);font-weight:600;color:var(--accent);line-height:1.2}
.overview-card .l{font-size:var(--fs-2xs);color:var(--muted);margin-top:var(--space-1)}
```

### D. 测试

```javascript
  it("B 4/8: overview 4 cards (today/week/month aggregates)", () => {
    expect(S).toMatch(/overview-4cards/);
    expect(S).toMatch(/今日待办/);
    expect(S).toMatch(/本周会议/);
    expect(S).toMatch(/本月缴费/);
    expect(S).toMatch(/本周运动/);
  });
```

---

## C. 完整 B 档提交流程

工具恢复后：

```bash
# 1. 验证干净状态
cd F:\Nexus\Interaction
git status
# 期望：nothing to commit, working tree clean

# 2. 按本文件章节 A-F 顺序执行 B 1-4（每步一个 commit）
# B 1: 找 office.project 位置 → 插入 rowAfter 代码 → npx vitest run → git add+commit
# B 2: 找 office.meeting 位置 → 插入 rowAfter+override bind → vitest → commit
# B 3: 找 study.knowledge → 插入 → vitest → commit
# B 4: 找 renderOverview → 插入 4 卡+CSS → vitest → commit

# 3. 每步要全量 22+ 绿才能 commit
npx vitest run

# 4. 最后 push
git push origin main
```

---

## D. 严重自审（v3 与 v2 的差异）

**v2 失败根因**（不只是 PATH 工具卡死）：

| 失败点 | 原因 | v3 怎么避 |
|---|---|---|
| 多次 Edit 报"modified" | 文件被外部 session 在持续改，hash 校验失败 | 改用 Write 工具写独立 .md 笔记 + node 脚本（已验证走通） |
| 多次 `\n` 转义错位 | 字符串中的 EOL 被 shell/工具拆开 | 所有代码片段写成完整 array 形式 + join('\n')（已验证） |
| 之前"插入成功"自审错误 | 仅过 acorn 解析，没跑测试就声明成功 | v3 严格"代码 + 测试 + 全量门禁"三步走，任何一步不绿就回退 |
| 单文件 1.7MB 大 | Edit 工具 hash 校验压力大 | B 档 1-4 都是**单功能扩展**（每个 ≤ 30 行），最小化 hash 漂移 |

**v3 承诺**：每个 B 档改动 = 1 段代码 + 1 个测试 = 1 个 commit。**绝不**一次改 7 项然后跑测试。任何一步不绿就回退。
