# Service Worker 缓存策略分析报告

## 概览

| 项目 | 值 |
|------|-----|
| 文件路径 | `F:\nexus\Interaction\service-worker.js` |
| 文件大小 | 14,211 字节 |
| 总行数 | 396 行 |
| 缓存版本 | `v1.8.9-20260812a`（构建注入） |
| 缓存名 | `wb-cache-v1.8.9-20260812a` |
| 缓存策略 | 分层：同源静态资源 cache-first / 跨域 HTTP(S) stale-while-revalidate / 其他 network-first |
| 预缓存条目数 | 5（`./`、`./agent-workbench.html`、`./manifest.json`、`./icon.svg`、`./service-worker.js`） |
| 容量上限 | `MAX_CACHE_ENTRIES = 50`（仅 activate 时清理） |
| 附加能力 | Background Sync API、Web Push、notificationclick |

---

## 修复状态总览（2026-08-13 更新）

| 编号 | 严重程度 | 状态 | 修复版本 |
|------|----------|------|----------|
| S1 | Critical | ✅ 已修复 | v1.8.7 |
| S2 | Critical | ✅ 已修复 | v1.8.7 |
| S3 | High | ✅ 已修复 | v1.8.7 |
| S4 | High | ✅ 已修复 | v1.8.7 |
| S5 | High | ✅ 已修复 | v1.8.7 |
| S6 | Medium | ✅ 已修复 | v1.8.8 |
| S7 | Medium | ✅ 已修复 | v1.8.8 |
| S8 | Medium | ✅ 已修复 | v1.8.8 |
| S9 | Medium | ✅ 已修复 | v1.8.8 |
| S10 | Medium | ✅ 已修复 | v1.8.8（build:prod 自动 bump） |
| S11 | Low | ⏸ 可接受 | opaque 响应不缓存是安全设计 |
| S12 | Low | ⏸ 待修复 | SWR 无 TTL |
| S13 | Low | ⏸ 待修复 | cache.put 错误静默 |

---

## 问题列表

### [S1] 跨域 SWR 离线且无缓存时返回 undefined，导致 respondWith 抛错

- **严重程度**：Critical
- **位置**：第 159-172 行（尤其第 169、171 行）
- **描述**：

  跨域 SWR 分支中，`fetchPromise` 的 `.catch` 返回 `undefined`（第 169 行），而第 171 行 `return cached || fetchPromise;` 在 `cached` 为 `undefined`（首次访问未命中缓存）且网络失败时，最终 resolve 为 `undefined`。`event.respondWith(undefined)` 会抛出 `TypeError`，浏览器将收到一个被拒绝的响应，用户看到的是浏览器默认错误页而非可控的 504 兜底。

  ```javascript
  // 第 159-172 行
  var fetchPromise = fetch(req).then(function (resp) {
    // ...
  }).catch(function () { /* 离线时静默，返回 cached 或兜底 */ });
  // ↑ catch 返回 undefined，注释声称"返回 cached 或兜底"但实际只返回 undefined
  return cached || fetchPromise;
  // ↑ cached 为 undefined 且 fetchPromise resolve 为 undefined → respondWith(undefined)
  ```

- **影响**：
  - 跨域 API 首次访问即离线时，页面收到异常响应，无法显示友好错误
  - 控制台抛出未捕获 TypeError，影响诊断
  - 与同源 cache-first（第 147 行返回 504）和 network-first（第 189 行返回 504）的兜底策略不一致
- **修复建议**：

  ```javascript
  var fetchPromise = fetch(req).then(function (resp) {
    if (resp && resp.type === "opaque") return resp;
    if (resp && resp.status === 200) {
      var copy = resp.clone();
      caches.open(CACHE_NAME).then(function (cache) {
        cache.put(req, copy).catch(function () {});
      }).catch(function () {});
    }
    return resp;
  }).catch(function () {
    // 离线且无缓存时返回 504 兜底，避免 respondWith(undefined)
    return new Response("", { status: 504, statusText: "Offline" });
  });
  return cached || fetchPromise;
  ```

---

### [S2] activate 删除所有非当前版本缓存，可能误删同源其他 SW 的缓存

- **严重程度**：Critical
- **位置**：第 96-101 行
- **描述**：

  ```javascript
  return Promise.all(keys.map(function (k) {
    if (k !== CACHE_NAME) return caches.delete(k);  // ← 仅排除当前版本
    return undefined;
  }));
  ```

  判断条件仅 `k !== CACHE_NAME`，会删除该 origin 下**所有**不等于当前缓存名的 Cache 实例，包括非 `wb-cache-` 前缀的缓存。若同一 origin 下存在其他应用或第三方库创建的 Cache（如 `workbox-precache-v2`、`runtime-cache` 等），将被一并清空。

- **影响**：
  - 同 origin 多 SW 场景下，其他应用的缓存被误删，导致其他应用离线失效、性能退化
  - 第三方库（Workbox、idb-keyval 等）的 Cache 被清空，可能引发运行时错误
  - 难以排查的"缓存莫名消失"问题
- **修复建议**：

  ```javascript
  var CACHE_PREFIX = "wb-cache-";
  // ...
  return Promise.all(keys.map(function (k) {
    // 仅清理本应用前缀的旧版本缓存
    if (k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME) {
      return caches.delete(k);
    }
    return undefined;
  }));
  ```

---

### [S3] 缓存容量限制仅在 activate 时执行，fetch 阶段缓存可无限增长

- **严重程度**：High
- **位置**：第 70-78 行（`trimCacheEntries`）、第 104-108 行（仅 activate 调用）、第 122-193 行（fetch 中 put 后未 trim）
- **描述**：

  `trimCacheEntries` 仅在 `activate` 事件中调用一次。SW 激活后长期运行，fetch 事件每次 `cache.put` 新条目都不会触发清理。在两次 SW 版本更新（即两次 activate）之间，缓存条目可远超 `MAX_CACHE_ENTRIES = 50`，违背容量限制初衷。

  ```javascript
  // fetch 中 put 后无 trim 调用（第 141-143、164-166、182-184 行均如此）
  caches.open(CACHE_NAME).then(function (cache) {
    cache.put(req, copy).catch(function () {});
  }).catch(function () {});
  // ← 缺少 trimCacheEntries(cache)
  ```

- **影响**：
  - 长期运行后 Cache Storage 占用持续增长，可能触发浏览器配额限制（`QuotaExceededError`）
  - 移动端存储压力增大，影响用户体验
  - 容量上限形同虚设
- **修复建议**：

  在每次 `cache.put` 成功后调用 `trimCacheEntries`：

  ```javascript
  caches.open(CACHE_NAME).then(function (cache) {
    return cache.put(req, copy).then(function () {
      return trimCacheEntries(cache);  // 每次 put 后清理
    });
  }).catch(function () {});
  ```

  或采用定时清理（如每 50 次 put 触发一次）以减少开销。

---

### [S4] 导航请求无专门处理，离线 fallback 不可靠

- **严重程度**：High
- **位置**：第 122-193 行（fetch 事件整体）
- **描述**：

  fetch 事件未检测 `request.mode === "navigate"`，导航请求按 URL 扩展名分流：

  - 导航到 `./` 或 `/`：`pathname` 为 `/`，不以任何 `STATIC_EXT` 结尾，落入 network-first 分支。离线时 `caches.match(req)` 尝试匹配导航请求 URL，但预缓存的是 `"./"`（第 29 行），URL 规范化后可能匹配，也可能因 query/hash 不匹配而失败。
  - 导航到 `./agent-workbench.html`：以 `.html` 结尾，走 cache-first，命中预缓存，离线可用。
  - 导航到 `./#overview`（manifest shortcuts 的 URL）：hash 不影响 pathname，走 network-first，离线时回退 `caches.match`，匹配预缓存的 `"./"`，**可能**可用但不可靠。

  缺少业界标准的导航 fallback 模式：

  ```javascript
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(function () {
        return caches.match("./agent-workbench.html");  // 离线 fallback
      })
    );
    return;
  }
  ```

- **影响**：
  - 离线时导航到根路径可能失败（取决于浏览器 URL 规范化与 Cache match 行为）
  - PWA 启动体验不一致：从 manifest shortcuts 启动可能黑屏
  - 未利用预缓存的 `agent-workbench.html` 作为统一离线 shell
- **修复建议**：

  在 fetch 事件最前面增加导航处理分支：

  ```javascript
  // (0) 导航请求：network-first + 离线 fallback 到预缓存 shell
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(function () {
        return caches.match("./agent-workbench.html")
          .then(function (cached) {
            return cached || caches.match("./")
              .then(function (c) { return c || new Response("", { status: 504 }); });
          });
      })
    );
    return;
  }
  ```

---

### [S5] trimCacheEntries 依赖 keys() 顺序做 FIFO，规范不保证

- **严重程度**：High
- **位置**：第 64-78 行
- **描述**：

  ```javascript
  /**
   * Service Worker Cache API 不暴露 LRU 元数据，
   * keys() 返回顺序近似插入顺序，故删前者。
   */
  function trimCacheEntries(cache) {
    return cache.keys().then(function (keys) {
      if (keys.length <= MAX_CACHE_ENTRIES) return undefined;
      var toRemove = keys.slice(0, keys.length - MAX_CACHE_ENTRIES);
      // ...
    });
  }
  ```

  注释承认"近似插入顺序"，但 [Cache Storage 规范](https://w3c.github.io/ServiceWorker/#cache-storage) 并未规定 `keys()` 返回顺序。不同浏览器实现可能按 URL 字典序、哈希序或其他顺序返回，导致删除的并非最旧条目，而是随机条目。Chrome 当前实现近似插入序，但 Firefox/Safari 行为可能不同，且未来可能变更。

- **影响**：
  - 可能删除高频使用的缓存条目，保留冷门条目，缓存命中率下降
  - 跨浏览器行为不一致，难以调试
  - 依赖未文档化的实现细节，未来浏览器更新可能破坏假设
- **修复建议**：

  方案 A（推荐）：维护独立的访问时间元数据（在 IndexedDB 中记录 `url → lastAccess`），按 LRU 删除。

  方案 B（轻量）：在 put 时附带时间戳到缓存 key 的 metadata（不可行，Cache key 即 URL）。

  方案 C（务实）：接受 FIFO 近似语义，但增加注释明确风险，并降低 `MAX_CACHE_ENTRIES` 的依赖程度（如配合 TTL）。

  ```javascript
  // 方案 A 简化示例：用 IndexedDB 记录访问时间
  function trimCacheEntriesLRU(cache) {
    return cache.keys().then(function (keys) {
      if (keys.length <= MAX_CACHE_ENTRIES) return undefined;
      return idbGetAccessTimes(keys).then(function (times) {
        // 按访问时间升序排序，删除最旧的
        var sorted = keys.slice().sort(function (a, b) {
          return (times[a.url] || 0) - (times[b.url] || 0);
        });
        var toRemove = sorted.slice(0, keys.length - MAX_CACHE_ENTRIES);
        return Promise.all(toRemove.map(function (req) {
          return cache.delete(req);
        }));
      });
    });
  }
  ```

---

### [S6] 预缓存 service-worker.js 自身无意义

- **严重程度**：Medium
- **位置**：第 33 行
- **描述**：

  ```javascript
  var PRECACHE_URLS = [
    "./",
    "./agent-workbench.html",
    "./manifest.json",
    "./icon.svg",
    "./service-worker.js"  // ← SW 文件由浏览器自动管理
  ];
  ```

  Service Worker 脚本由浏览器独立获取、缓存和更新（每次 install 前会对比字节级差异），不需要也不应该通过 Cache Storage API 缓存。缓存 SW 自身会占用一个缓存条目，且该条目永远不会被 fetch 事件命中（浏览器直接从 SW 缓存加载，不经过 `event.respondWith`）。

- **影响**：
  - 浪费一个缓存条目和一次预缓存网络请求
  - SW 更新后，缓存的旧版本 SW 仍留在 Cache 中，直到下次 activate 清理
  - 误导维护者以为 SW 文件需要手动缓存
- **修复建议**：

  从 `PRECACHE_URLS` 中移除 `"./service-worker.js"`。

---

### [S7] .json 文件走 cache-first，配置数据可能无法及时更新

- **严重程度**：Medium
- **位置**：第 37 行（`STATIC_EXT` 含 `.json`）、第 134-152 行（cache-first 分支）
- **描述**：

  ```javascript
  var STATIC_EXT = [".html", ".json", ".svg", ".js", ".css"];
  ```

  `.json` 被归入静态资源走 cache-first。这意味着 `manifest.json`、应用配置文件、i18n 资源等 JSON 数据一旦缓存，将永久返回旧值，直到缓存版本号变更。对于 `manifest.json` 这类相对静态的资源尚可，但对于动态配置（如 `config.json`、`env.json`、版本清单 `version.json`）会导致更新无法生效。

  特别地，`manifest.json` 本身被预缓存（第 31 行），cache-first 会始终返回预缓存版本，若 manifest 更新但 SW 版本未变，新 manifest 不生效。

- **影响**：
  - 动态 JSON 配置更新延迟，需等缓存版本号变更
  - manifest.json 更新与 SW 版本强耦合
  - 可能引发"明明改了配置却不生效"的困惑
- **修复建议**：

  将 `.json` 从 `STATIC_EXT` 移除，让 JSON 走 network-first（实时性优先）；或进一步细分：

  ```javascript
  var STATIC_EXT = [".html", ".svg", ".js", ".css"];  // 移除 .json
  // JSON 走 network-first，失败回退缓存（可接受短暂过期）
  ```

  若确有静态 JSON 需 cache-first，可白名单显式列出（如 `manifest.json`）。

---

### [S8] network-first 只缓存 type==="basic"，跨域 cors 响应被忽略

- **严重程度**：Medium
- **位置**：第 180 行
- **描述**：

  ```javascript
  // (3) 其他请求：network-first
  fetch(req).then(function (resp) {
    if (resp && resp.status === 200 && resp.type === "basic") {  // ← 仅 basic
      var copy = resp.clone();
      caches.open(CACHE_NAME).then(function (cache) {
        cache.put(req, copy).catch(function () {});
      }).catch(function () {});
    }
    return resp;
  })
  ```

  `resp.type === "basic"` 仅匹配同源响应。跨域 CORS 响应的 `type` 为 `"cors"`，不会被缓存。这意味着同源 API（如 `/api/data`）可被 network-first 缓存，但跨域 API（如 `https://api.example.com/data`，CORS 模式）若未命中 `isCrossOriginHttp` 的 SWR 分支（实际上会命中，因为 `isCrossOriginHttp` 判断 `url.origin !== origin`），则落入此分支时不被缓存。

  实际上跨域请求会被 `isCrossOriginHttp`（第 155 行）拦截走 SWR，不会到达 network-first 分支。因此该问题主要影响：未来若调整分流逻辑，跨域 cors 响应在 network-first 中不被缓存，行为不一致。

  更直接的问题：同源非静态资源（如同源 API `/api/users`）走 network-first，缓存条件 `type === "basic"` 对同源响应成立，可被缓存——但 API 响应通常不应长期缓存，network-first 缓存 200 响应可能导致离线时返回过期 API 数据。

- **影响**：
  - 分流逻辑变更时跨域 cors 响应缓存行为不一致
  - 同源 API 响应被缓存，离线时返回过期数据，可能引发业务逻辑错误（如基于旧数据的写操作）
- **修复建议**：

  明确 API 请求不应缓存或应短 TTL：

  ```javascript
  // network-first 中排除 API 路径
  if (resp && resp.status === 200 && resp.type === "basic" && !url.pathname.startsWith("/api/")) {
    // 缓存非 API 的同源响应
  }
  ```

  或对 `type === "cors"` 也允许缓存（`basic` 或 `cors`）：

  ```javascript
  if (resp && resp.status === 200 && (resp.type === "basic" || resp.type === "cors")) {
  ```

---

### [S9] addAll 整体失败时静默 catch，预缓存可能完全为空但 SW 仍安装

- **严重程度**：Medium
- **位置**：第 86 行
- **描述**：

  ```javascript
  return cache.addAll(PRECACHE_URLS).catch(function () {
    /* 静默：部分资源缓存失败仍允许 SW 安装 */
  });
  ```

  `addAll` 是原子操作：任一 URL 失败则整体 reject，所有 URL 都不会进入缓存。catch 后 SW 仍 `skipWaiting` 安装成功，但预缓存为空。离线时所有预缓存资源（包括离线 shell `agent-workbench.html`）都不可用，离线体验完全失效，且无任何告警。

  注释"部分资源缓存失败"表述不准确——`addAll` 不支持"部分成功"。

- **影响**：
  - 预缓存全部失败时离线体验完全失效，用户无感知
  - 无错误日志，运维难以发现
  - 与"install 失败应阻塞"的 PWA 最佳实践相悖
- **修复建议**：

  改用逐个缓存 + 容错：

  ```javascript
  return Promise.all(PRECACHE_URLS.map(function (url) {
    return cache.add(url).catch(function (err) {
      console.warn("[SW] precache failed:", url, err);
    });
  }));
  ```

  或对关键资源（离线 shell）失败时让 install 失败：

  ```javascript
  var CRITICAL = ["./", "./agent-workbench.html"];
  return Promise.all(PRECACHE_URLS.map(function (url) {
    return cache.add(url).catch(function (err) {
      if (CRITICAL.indexOf(url) !== -1) throw err;  // 关键资源失败则阻塞
      console.warn("[SW] precache skipped:", url);
    });
  }));
  ```

---

### [S10] 缓存版本号硬编码，未与构建集成，易忘记更新

- **严重程度**：Medium
- **位置**：第 15 行
- **描述**：

  ```javascript
  var CACHE_VERSION = "v15-20260810c";
  ```

  版本号手动维护，依赖开发者记得在发布前修改。若忘记更新，新代码部署后浏览器仍使用旧 SW（字节级对比才会触发更新），旧缓存持续生效，用户无法获得新功能或修复。当前版本 `v15-20260810c` 含日期 `20260810`，但无自动化校验。

- **影响**：
  - 忘记更新版本号 → 用户停留在旧缓存，新部署不生效
  - 无 CI 校验，易人为失误
  - 版本号与 `package.json` version、CHANGELOG 无关联，难以追溯
- **修复建议**：

  方案 A：构建时注入版本号（如 webpack `DefinePlugin`、Vite `define`）：

  ```javascript
  // 构建配置
  define: { __CACHE_VERSION__: JSON.stringify(`v${pkg.version}-${Date.now()}`) }
  // service-worker.js
  var CACHE_VERSION = __CACHE_VERSION__;
  ```

  方案 B：CI 中校验版本号已变更（git diff 检查）。

  方案 C：用内容哈希自动生成（如对预缓存资源计算 hash 作为版本后缀）。

---

### [S11] opaque 响应不缓存，跨域 no-cors 资源离线不可用

- **严重程度**：Low
- **位置**：第 161 行
- **描述**：

  ```javascript
  if (resp && resp.type === "opaque") return resp;
  ```

  opaque 响应（跨域 `no-cors` 请求产物）被显式跳过不缓存。这是安全正确的选择（opaque 响应 body 不可读，缓存意义有限且可能引发安全问题），但意味着跨域 no-cors 资源（如第三方字体、图片）每次都走网络，离线时不可用。

- **影响**：
  - 跨域 no-cors 资源（如 CDN 字体、图片）离线不可用
  - 页面离线时字体回退、图片裂图
- **修复建议**：

  若需缓存跨域静态资源，应与服务端配合启用 CORS（使响应 `type` 为 `"cors"` 可读），或使用 `<link rel="preconnect">` + 同源代理。当前实现安全优先，可接受，但应在文档中明确限制。

---

### [S12] SWR 无 TTL 机制，可能返回长期过期的缓存

- **严重程度**：Low
- **位置**：第 155-175 行
- **描述**：

  SWR 策略中，只要 `cached` 存在就立即返回，后台 `fetchPromise` 更新缓存。但若后台 fetch 持续失败（长时间断网后又短暂连上但 API 5xx），缓存可能返回数天前的数据，无过期上限。标准 SWR 通常配合 TTL（如 `max-age` 或自定义 `swr-max-age`），超过 TTL 后即使有缓存也走网络。

- **影响**：
  - 用户可能看到严重过期的跨域 API 数据
  - 对时效性敏感的应用（如行情、通知）可能误导用户
- **修复建议**：

  在缓存时记录时间戳（如用 Response headers 或独立 IndexedDB），SWR 返回前检查 TTL：

  ```javascript
  // 简化示例：用 cache 的 Date header 判断
  if (cached) {
    var cachedTime = new Date(cached.headers.get("date") || 0).getTime();
    var age = Date.now() - cachedTime;
    if (age > SWR_MAX_AGE) {
      // 超过 TTL，等网络（网络失败仍回退 cached）
      return fetchPromise.then(function (r) { return r; }).catch(function () { return cached; });
    }
    return cached;
  }
  return fetchPromise;
  ```

---

### [S13] cache.put 未 await 且错误静默，难以诊断缓存失败

- **严重程度**：Low
- **位置**：第 141-143、164-166、182-184 行
- **描述**：

  ```javascript
  caches.open(CACHE_NAME).then(function (cache) {
    cache.put(req, copy).catch(function () {});  // ← 内层 catch 吞掉错误
  }).catch(function () {});  // ← 外层 catch 吞掉错误
  ```

  `cache.put` 可能因配额不足、Response 不合规等失败，但所有错误被双层 `.catch(function () {})` 吞掉。生产环境中缓存静默失效，无任何日志，运维无法发现。

- **影响**：
  - 缓存配额耗尽时无告警，缓存命中率悄然下降
  - Response 不合规（如不可流式化）问题无迹可寻
  - 调试困难
- **修复建议**：

  至少在开发环境记录错误：

  ```javascript
  caches.open(CACHE_NAME).then(function (cache) {
    return cache.put(req, copy);
  }).catch(function (err) {
    if (self.registration && self.registration.scope.includes("localhost")) {
      console.warn("[SW] cache.put failed:", req.url, err);
    }
  });
  ```

---

## 改进建议

### 1. 引入 Workbox 简化策略管理

当前手写分层策略存在多处边界 case 处理不当（S1/S4/S5/S12）。Google Workbox 已封装成熟的 `CacheFirst`、`StaleWhileRevalidate`、`NetworkFirst` 策略，内置 LRU、TTL、配额管理、opaque 处理，可显著降低 bug 风险：

```javascript
// workbox-config.js 示例
import { registerRoute } from "workbox-routing";
import { CacheFirst, StaleWhileRevalidate, NetworkFirst } from "workbox-strategies";
import { NavigationRoute } from "workbox-routing";

registerRoute(new NavigationRoute(async () => {
  const cache = await caches.open("wb-shell");
  return (await cache.match("./agent-workbench.html")) || fetch("./agent-workbench.html");
}));

registerRoute(({ url }) => isStaticAsset(url), new CacheFirst({ cacheName: CACHE_NAME, maxEntries: 50 }));
registerRoute(({ url }) => isCrossOriginHttp(url), new StaleWhileRevalidate({ cacheName: CACHE_NAME }));
```

### 2. 增加导航 fallback 与离线诊断

- 在 fetch 事件最前面处理 `request.mode === "navigate"`，离线时统一返回预缓存的 `agent-workbench.html`
- 在离线 fallback 页面中展示诊断信息（缓存版本、最后更新时间、队列状态）

### 3. 缓存版本与构建集成

- 构建时注入 `CACHE_VERSION`（基于 `package.json` version + git commit hash）
- CI 中校验每次发版 `CACHE_VERSION` 已变更
- 在 `CHANGELOG.md` 中记录版本号变更

### 4. 完善预缓存策略

- 移除 `service-worker.js`（S6）
- 将 `agent-workbench.html`（1.4 MB）单独处理，考虑分块或按需缓存
- addAll 改为逐个容错（S9），关键资源失败时阻塞 install
- 考虑预缓存构建产物（JS/CSS bundle），当前未包含

### 5. 增加缓存健康监控

- 在 `activate` 中上报缓存条目数、总大小到诊断端点
- `cache.put` 失败时记录指标（S13）
- 提供 `message` 接口供页面查询缓存状态

### 6. 明确 API 与静态资源分流

- 将 `.json` 从 cache-first 移除（S7）
- API 路径（`/api/`）显式走 network-first 且不缓存或短 TTL（S8）
- 跨域 API 走 SWR 并增加 TTL（S12）

---

## 总结

### 问题统计

| 严重程度 | 数量 | 编号 |
|----------|------|------|
| Critical | 2 | S1, S2 |
| High | 3 | S3, S4, S5 |
| Medium | 5 | S6, S7, S8, S9, S10 |
| Low | 3 | S11, S12, S13 |
| **合计** | **13** | — |

### 整体评价

该 Service Worker 实现覆盖了 PWA 的核心能力（分层缓存、Background Sync、Web Push、通知点击），代码结构清晰、注释详尽，体现了对 SW 生命周期的理解。但在**缓存策略的边界 case 处理**上存在两个 Critical 问题：

1. **S1（跨域 SWR 离线兜底缺失）**：跨域 API 首次离线访问会抛错，与同源分支的 504 兜底不一致，是最优先修复的运行时缺陷。
2. **S2（activate 误删其他应用缓存）**：清理逻辑过于激进，可能破坏同 origin 下其他 SW 的缓存，在多应用共享 origin 的部署中是隐患。

三个 High 问题（S3 容量限制失效、S4 导航 fallback 缺失、S5 FIFO 顺序不可靠）影响长期运行的稳定性和离线体验一致性，建议尽快修复。

Medium/Low 问题多为优化项和健壮性增强，可结合 Workbox 迁移一并解决。

### 修复优先级建议

1. **立即修复**（Critical）：S1 → S2
2. **本迭代修复**（High）：S4 → S3 → S5
3. **下迭代修复**（Medium）：S9 → S7 → S6 → S8 → S10
4. **持续优化**（Low）：S13 → S12 → S11
5. **长期演进**：评估 Workbox 迁移可行性，用成熟框架替代手写策略，系统性解决 TTL/LRU/配额管理