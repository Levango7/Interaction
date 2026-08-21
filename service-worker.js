/* eslint-env serviceworker */
/**
 * Service Worker for Agent 工作台
 * 分层缓存策略：
 *   - 同源静态资源（.html/.json/.svg/.js/.css）：cache-first
 *   - 跨域 API 请求（http/https 且非同源）：stale-while-revalidate
 *   - 其他请求：network-first（失败回退缓存）
 * 缓存版本号变更后，activate 会清理所有非当前版本的旧缓存。
 *
 * v1.4-F PWA 增强：
 *   - Background Sync API：'sync' 事件处理离线排队操作（sync-tasks）
 *   - Web Push：'push' 事件显示通知，'pushsubscriptionchange' 处理订阅失效
 *   - 离线操作队列存储在 IndexedDB（wb_sync_queue）+ localStorage 兜底
 */
// 缓存版本号必须随每次 agent-workbench.html 变更 bump，否则 PWA/安装版会一直吃旧缓存（用户看不到新 UI）。
// 命名约定：v{应用版本}-{日期}{当日序号}。版本历史见 CHANGELOG.md（v1.11.1 起不再在代码注释内嵌版本日志，避免双份维护漂移）。
var CACHE_VERSION = "v2.0.0-20260821";
var CACHE_NAME = "wb-cache-" + CACHE_VERSION;

// v1.4-F：后台同步队列存储库名（IndexedDB 优先；SW 上下文无法访问 localStorage）
var SYNC_DB = "wb-sync-db";
var SYNC_STORE = "syncQueue";
// v1.4-F：通知默认图标（相对路径，SW 作用域内）
var NOTIFY_ICON = "./icon.svg";

// R15: 单个缓存条目容量上限，超过则按 FIFO 删除最旧的
var MAX_CACHE_ENTRIES = 50;

// 预缓存核心资源（相对路径 ./ 适配 gh-pages 子路径部署）
var PRECACHE_URLS = [
  "./",
  "./agent-workbench.html",
  "./manifest.json",
  "./icon.svg"
];

// 同源静态资源扩展名（cache-first 命中范围）
// S7: .json 不在此列——manifest.json 等配置数据需及时更新，走 network-first 策略
var STATIC_EXT = [".html", ".svg", ".js", ".css"];

/**
 * 判断给定 URL 是否为同源静态资源（按扩展名匹配）。
 * @param {URL} url 解析后的 URL 对象
 * @param {string} origin 当前 SW 作用域 origin
 * @returns {boolean}
 */
function isStaticAsset(url, origin) {
  if (url.origin !== origin) return false;
  var p = url.pathname.toLowerCase();
  for (var i = 0; i < STATIC_EXT.length; i++) {
    if (p.endsWith(STATIC_EXT[i])) return true;
  }
  return false;
}

/**
 * 判断给定 URL 是否为跨域 HTTP(S) 请求（用于 stale-while-revalidate）。
 * @param {URL} url 解析后的 URL 对象
 * @param {string} origin 当前 SW 作用域 origin
 * @returns {boolean}
 */
function isCrossOriginHttp(url, origin) {
  return (url.protocol === "https:" || url.protocol === "http:") && url.origin !== origin;
}

// S5: 时间戳元数据键的虚拟路径前缀（同源，相对于 SW 作用域）
var TS_BASE = "./__wb_cache_ts__/";

/**
 * S5: 生成时间戳元数据的 Request（同源虚拟路径，避免与真实资源冲突）。
 * @param {Request} req 原始请求
 * @returns {Request}
 */
function _tsRequest(req) {
  return new Request(TS_BASE + encodeURIComponent(req.url), { method: "GET" });
}

/**
 * S5: 判断 Request 是否为时间戳元数据键。
 * @param {Request} req
 * @returns {boolean}
 */
function _isTsRequest(req) {
  try {
    var u = new URL(req.url, self.location.href);
    return u.pathname.indexOf("__wb_cache_ts__/") !== -1;
  } catch (e) { return false; }
}

/**
 * S5: 带时间戳的 cache.put——同时存储原始条目和时间戳元数据，用于 LRU 排序。
 * @param {Cache} cache 已打开的 Cache 实例
 * @param {Request} req 原始请求
 * @param {Response} resp 原始响应
 * @returns {Promise<void>}
 */
function _putWithTimestamp(cache, req, resp) {
  var tsReq = _tsRequest(req);
  var tsResp = new Response(String(Date.now()));
  return Promise.all([
    cache.put(req, resp),
    cache.put(tsReq, tsResp)
  ]).then(function () { return undefined; });
}

/**
 * v1.11.1 [L9]: SWR 专用——带 TTL 的缓存命中判断，过期条目视为未命中（走网络），
 * 避免跨域 GET 响应体（可能含鉴权数据）被无限期复用。时间戳元数据缺失或读取失败
 * 时回退旧行为（视为命中），与既有 LRU 时间戳机制（S5）共用同一份元数据。
 * @param {Cache} cache
 * @param {Request} req
 * @param {number} ttlMs
 * @returns {Promise<Response|null>}
 */
var SWR_TTL_MS = 24 * 60 * 60 * 1000; // 24 小时
function _cachedWithinTtl(cache, req, ttlMs) {
  return cache.match(req).then(function (cached) {
    if (!cached) return null;
    return cache.match(_tsRequest(req)).then(function (r) {
      if (!r) return cached;
      return r.text().then(function (t) {
        var ts = parseInt(t, 10) || 0;
        return (Date.now() - ts) <= ttlMs ? cached : null;
      }).catch(function () { return cached; });
    });
  });
}

/**
 * R15/S5: 缓存容量清理——若原始条目数超过 MAX_CACHE_ENTRIES，按时间戳删除最旧的。
 * 时间戳元数据存储在 __wb_cache_ts__/ 前缀的辅助键中，避免依赖 keys() 顺序（规范不保证）。
 * @param {Cache} cache 已打开的 Cache 实例
 * @returns {Promise<void>}
 */
function trimCacheEntries(cache) {
  return cache.keys().then(function (keys) {
    // 分离原始条目和时间戳元数据条目
    var realKeys = [];
    for (var i = 0; i < keys.length; i++) {
      if (!_isTsRequest(keys[i])) realKeys.push(keys[i]);
    }
    if (realKeys.length <= MAX_CACHE_ENTRIES) return undefined;
    // 读取所有原始条目的时间戳
    return Promise.all(realKeys.map(function (k) {
      return cache.match(_tsRequest(k)).then(function (r) {
        if (!r) return { key: k, ts: 0 };
        return r.text().then(function (t) {
          return { key: k, ts: parseInt(t, 10) || 0 };
        }).catch(function () { return { key: k, ts: 0 }; });
      });
    })).then(function (entries) {
      // 按时间戳升序排序（最旧的在前）
      entries.sort(function (a, b) { return a.ts - b.ts; });
      var toRemove = entries.slice(0, entries.length - MAX_CACHE_ENTRIES);
      return Promise.all(toRemove.map(function (e) {
        // 删除原始条目和对应的时间戳元数据
        return Promise.all([
          cache.delete(e.key),
          cache.delete(_tsRequest(e.key))
        ]);
      }));
    });
  });
}

// ===== install：预缓存核心资源 =====
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        // v1.11.1 [M8/S9]：预缓存由原子 addAll 改为逐 URL 容错——非关键资源（icon/manifest）
        // 失败仅告警跳过；关键离线壳资源（入口页与真相源 HTML）失败则抛错阻塞 install，
        // 避免"空离线壳"静默上线（旧实现 addAll 失败仅 console.warn 后仍 skipWaiting 安装）。
        var CRITICAL_PRECACHE = { "./": true, "./agent-workbench.html": true };
        return Promise.all(PRECACHE_URLS.map(function (u) {
          return cache.add(u).catch(function (e) {
            if (CRITICAL_PRECACHE[u]) throw e;
            console.warn("[SW] precache 非关键资源失败（跳过）:", u, e);
          });
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

// ===== activate：清旧版本缓存 + 容量限制 + 接管客户端 =====
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        // S2: 仅删除 wb-cache- 前缀的旧版本缓存，避免误删其他应用缓存
        return Promise.all(keys.map(function (k) {
          if (k.startsWith("wb-cache-") && k !== CACHE_NAME) return caches.delete(k);
          return undefined;
        }));
      })
      .then(function () {
        // R15: 容量限制——当前缓存条目超过 MAX_CACHE_ENTRIES 时删除最旧的
        return caches.open(CACHE_NAME).then(function (cache) {
          return trimCacheEntries(cache);
        });
      })
      .then(function () { return self.clients.claim(); })
  );
});

// ===== message：支持 postMessage({type:'skipWaiting'}) 触发即时激活 =====
self.addEventListener("message", function (event) {
  var data = event && event.data;
  if (data && data.type === "skipWaiting") {
    self.skipWaiting();
  }
});

// ===== fetch：分层缓存策略 =====
self.addEventListener("fetch", function (event) {
  var req = event.request;
  // 仅拦截 GET 请求；POST/其他方法直接走网络
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); }
  catch (e) { return; } // 非 URL 直接放行

  var origin = self.location.origin;

  // S4: 导航请求专门处理——离线时回退到预缓存的首页，避免白屏
  if (req.mode === "navigate") {
    event.respondWith(
      caches.match(req).then(function (cached) {
        if (cached) return cached;
        return fetch(req).catch(function () {
          // 离线时回退到预缓存的首页
          return caches.match("./").then(function (fallback) {
            if (fallback) return fallback;
            return caches.match("./agent-workbench.html").then(function (fb2) {
              return fb2 || new Response("", { status: 504, statusText: "Offline" });
            });
          });
        });
      })
    );
    return;
  }

  // (1) 同源静态资源：cache-first
  if (isStaticAsset(url, origin)) {
    event.respondWith(
      caches.match(req).then(function (cached) {
        if (cached) return cached;
        return fetch(req).then(function (resp) {
          if (resp && resp.status === 200 && resp.type === "basic") {
            var copy = resp.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              _putWithTimestamp(cache, req, copy).then(function () {
                // S3: put 成功后异步清理容量，不阻塞响应
                trimCacheEntries(cache).catch(function () {});
              }).catch(function () {});
            }).catch(function () {});
          }
          return resp;
        }).catch(function () {
          return new Response("", { status: 504, statusText: "Offline" });
        });
      })
    );
    return;
  }

  // (2) 跨域 API 请求：stale-while-revalidate（v1.11.1 [L9]：带 24h TTL——过期条目视为未命中，
  //     避免跨域 GET 响应体（可能含鉴权数据）被无限期复用；cache.put 失败不再双层静默）
  if (isCrossOriginHttp(url, origin)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(function (cache) {
        return _cachedWithinTtl(cache, req, SWR_TTL_MS).then(function (cached) {
        // 后台拉取并更新缓存（不阻塞响应）
        var fetchPromise = fetch(req).then(function (resp) {
          // R15: 不缓存 opaque 响应（跨域 no-cors 产物，缓存可能产生意外行为）
          if (resp && resp.type === "opaque") return resp;
          if (resp && resp.status === 200) {
            var copy = resp.clone();
            caches.open(CACHE_NAME).then(function (cache2) {
              _putWithTimestamp(cache2, req, copy).then(function () {
                // S3: put 成功后异步清理容量，不阻塞响应
                trimCacheEntries(cache2).catch(function (e) { console.warn("[SW] trimCacheEntries failed:", e); });
              }).catch(function (e) { console.warn("[SW] SWR cache put failed:", e); });
            }).catch(function (e) { console.warn("[SW] SWR caches.open failed:", e); });
          }
          return resp;
        }).catch(function () {
          // S1: 离线兜底——避免返回 undefined 导致 respondWith(undefined) 报错；
          // [L9] TTL 过期且离线时按约定返回 504（跨域 API 的新鲜度优先于可用性）
          return cached || new Response("Gateway Timeout", { status: 504, statusText: "Gateway Timeout" });
        });
        // 有缓存先返回，否则等网络（fetchPromise 已保证不返回 undefined）
        return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // (3) 其他请求：network-first（失败回退缓存）
  event.respondWith(
    fetch(req).then(function (resp) {
      if (resp && resp.status === 200 && (resp.type === "basic" || resp.type === "cors")) {
        var copy = resp.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          _putWithTimestamp(cache, req, copy).then(function () {
            // S3: put 成功后异步清理容量，不阻塞响应（v1.11.1 [L9/S13]：失败可观测，不再静默）
            trimCacheEntries(cache).catch(function (e) { console.warn("[SW] trimCacheEntries failed:", e); });
          }).catch(function (e) { console.warn("[SW] cache put failed:", e); });
        }).catch(function (e) { console.warn("[SW] caches.open failed:", e); });
      }
      return resp;
    }).catch(function () {
      return caches.match(req).then(function (cached) {
        return cached || new Response("", { status: 504, statusText: "Offline" });
      });
    })
  );
});

// ===== v1.4-F Background Sync API：离线操作排队，恢复网络后自动同步 =====
/**
 * 打开同步队列 IndexedDB（SW 上下文无法访问 localStorage）。
 * @returns {Promise<IDBObjectStore|null>}
 */
function _openSyncStore() {
  return new Promise(function (resolve) {
    if (typeof indexedDB === "undefined") { resolve(null); return; }
    try {
      var req = indexedDB.open(SYNC_DB, 1);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(SYNC_STORE)) {
          db.createObjectStore(SYNC_STORE, { keyPath: "id", autoIncrement: true });
        }
      };
      req.onsuccess = function (e) {
        var db = e.target.result;
        try {
          var tx = db.transaction(SYNC_STORE, "readwrite");
          resolve(tx.objectStore(SYNC_STORE));
        } catch (err) { resolve(null); }
      };
      req.onerror = function () { resolve(null); };
    } catch (e) { resolve(null); }
  });
}

/**
 * 读取同步队列中所有待同步操作。
 * @returns {Promise<Array<{id:number,op:string,payload:*,ts:number}>>}
 */
function _readSyncQueue() {
  return _openSyncStore().then(function (store) {
    if (!store) return [];
    return new Promise(function (resolve) {
      var r = store.getAll();
      r.onsuccess = function () { resolve(r.result || []); };
      r.onerror = function () { resolve([]); };
    });
  });
}

/**
 * 从队列中删除已成功同步的条目。
 * @param {number} id - 队列条目 id
 * @returns {Promise<void>}
 */
function _deleteSyncItem(id) {
  return _openSyncStore().then(function (store) {
    if (!store) return undefined;
    return new Promise(function (resolve) {
      var r = store.delete(id);
      r.onsuccess = function () { resolve(); };
      r.onerror = function () { resolve(); };
    });
  });
}

/**
 * 处理单个同步操作：发送到服务器（框架，不实际发送；只标记成功）。
 * 真实部署时此处应改为 fetch(serverEndpoint, {method:'POST', body:JSON.stringify(_item.payload)})。
 * v1.11.1 [M6]：与页面端 flushSyncQueue 同口径——当前为框架桩，仅保底返回成功，
 * 不得谎报"已同步到服务器"；文案与真实端点接线见页面端 SYNC_ENDPOINT 注释。
 * @returns {Promise<boolean>} 是否成功
 */
function _processSyncItem() {
  return Promise.resolve(true);
}

/**
 * 同步事件处理：遍历队列，逐条处理，成功的删除，失败的保留待下次同步。
 * @param {Event} event - sync 事件
 */
function handleSyncEvent(event) {
  if (!event || !event.tag) return;
  // 仅处理我们注册的 sync-tasks 标签
  if (event.tag !== "sync-tasks") return;
  event.waitUntil(
    _readSyncQueue().then(function (queue) {
      if (!queue.length) return undefined;
      return Promise.all(queue.map(function (item) {
        return _processSyncItem(item).then(function (ok) {
          if (ok) return _deleteSyncItem(item.id);
          return undefined;
        });
      }));
    }).catch(function () { /* 同步失败保留队列，下次再试 */ })
  );
}

// 注册 sync 事件监听（浏览器不支持 Background Sync 时此行不会触发）
if (typeof self !== "undefined" && "sync" in self) {
  self.addEventListener("sync", handleSyncEvent);
}

// ===== v1.4-F Web Push：'push' 事件显示通知 =====
/**
 * 显示 Push 通知（需 Notification 权限；无权限时静默失败）。
 * @param {string} title - 通知标题
 * @param {Object} opts - Notification options（body/tag/icon 等）
 * @returns {Promise<void>}
 */
function _showNotification(title, opts) {
  if (typeof self === "undefined" || !self.registration || typeof Notification === "undefined") {
    return Promise.resolve();
  }
  // 权限不足时静默跳过（用户在页面端可看到 toast，SW 端不强制打扰）
  if (Notification.permission !== "granted") return Promise.resolve();
  var finalOpts = Object.assign({
    icon: NOTIFY_ICON,
    badge: NOTIFY_ICON,
    tag: "wb-push",
    renotify: false,
    data: {}
  }, opts || {});
  try {
    return Promise.resolve(self.registration.showNotification(title, finalOpts));
  } catch (e) { return Promise.resolve(); }
}

/**
 * 解析 push 事件 payload（支持任意 JSON / 纯文本 / 空）。
 * @param {PushEvent} event - push 事件
 * @returns {{title:string, body:string, tag?:string}}
 */
function _parsePushPayload(event) {
  var title = "Agent 工作台";
  var body = "你有一条新通知";
  var tag = "wb-push";
  try {
    if (event && event.data) {
      // 优先按 JSON 解析
      try {
        var j = event.data.json();
        if (j && typeof j === "object") {
          if (typeof j.title === "string") title = j.title;
          if (typeof j.body === "string") body = j.body;
          if (typeof j.tag === "string") tag = j.tag;
        }
      } catch (e1) {
        // JSON 解析失败，按纯文本处理
        var txt = "";
        try { txt = event.data.text(); } catch (e2) {}
        if (txt) body = txt;
      }
    }
  } catch (e) { /* 解析失败用默认值 */ }
  return { title: title, body: body, tag: tag };
}

// 注册 push 事件监听
if (typeof self !== "undefined" && "push" in self) {
  self.addEventListener("push", function (event) {
    var p = _parsePushPayload(event);
    event.waitUntil(_showNotification(p.title, { body: p.body, tag: p.tag }));
  });
}

/**
 * pushsubscriptionchange 事件：订阅失效时通知所有客户端重新订阅。
 * 真实部署应在此处把新订阅 POST 到服务器 push-subscription endpoint。
 */
if (typeof self !== "undefined" && "pushsubscriptionchange" in self) {
  self.addEventListener("pushsubscriptionchange", function (event) {
    event.waitUntil(
      Promise.resolve().then(function () {
        // 通知所有客户端订阅已失效（页面端会重新 subscribePush）
        if (self.clients && typeof self.clients.matchAll === "function") {
          return self.clients.matchAll({ type: "window" }).then(function (cls) {
            cls.forEach(function (c) {
              try { c.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGE" }); } catch (e) { /* noop */ }
            });
          });
        }
        return undefined;
      }).catch(function () { /* 静默 */ })
    );
  });
}

// ===== v1.4-F 通知点击：聚焦/打开应用窗口 =====
if (typeof self !== "undefined" && "notificationclick" in self) {
  self.addEventListener("notificationclick", function (event) {
    event.waitUntil(
      Promise.resolve().then(function () {
        if (!self.clients || typeof self.clients.matchAll !== "function") return undefined;
        return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (cls) {
          // 已有窗口则聚焦，否则打开新窗口
          for (var i = 0; i < cls.length; i++) {
            try { cls[i].focus(); return undefined; } catch (e) { /* 继续尝试下一个 */ }
          }
          return self.clients.openWindow("./");
        });
      }).catch(function () { /* 静默 */ })
    );
  });
}
