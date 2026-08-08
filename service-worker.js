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
var CACHE_VERSION = "v12-20260808";
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
  "./icon.svg",
  "./service-worker.js"
];

// 同源静态资源扩展名（cache-first 命中范围）
var STATIC_EXT = [".html", ".json", ".svg", ".js", ".css"];

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

/**
 * R15: 缓存容量清理——若指定 cache 条目数超过 MAX_CACHE_ENTRIES，按 FIFO 删除最旧的。
 * Service Worker Cache API 不暴露 LRU 元数据，keys() 返回顺序近似插入顺序，故删前者。
 * @param {Cache} cache 已打开的 Cache 实例
 * @returns {Promise<void>}
 */
function trimCacheEntries(cache) {
  return cache.keys().then(function (keys) {
    if (keys.length <= MAX_CACHE_ENTRIES) return undefined;
    var toRemove = keys.slice(0, keys.length - MAX_CACHE_ENTRIES);
    return Promise.all(toRemove.map(function (req) {
      return cache.delete(req);
    }));
  });
}

// ===== install：预缓存核心资源 =====
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        // addAll 要求所有 URL 都成功；任一失败则跳过缓存但不阻塞安装
        return cache.addAll(PRECACHE_URLS).catch(function () { /* 静默：部分资源缓存失败仍允许 SW 安装 */ });
      })
      .then(function () { return self.skipWaiting(); })
  );
});

// ===== activate：清旧版本缓存 + 容量限制 + 接管客户端 =====
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        // 删除所有非当前版本的缓存（前缀 wb-cache- 但版本不同）
        return Promise.all(keys.map(function (k) {
          if (k !== CACHE_NAME) return caches.delete(k);
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

  // (1) 同源静态资源：cache-first
  if (isStaticAsset(url, origin)) {
    event.respondWith(
      caches.match(req).then(function (cached) {
        if (cached) return cached;
        return fetch(req).then(function (resp) {
          if (resp && resp.status === 200 && resp.type === "basic") {
            var copy = resp.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(req, copy).catch(function () {});
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

  // (2) 跨域 API 请求：stale-while-revalidate
  if (isCrossOriginHttp(url, origin)) {
    event.respondWith(
      caches.match(req).then(function (cached) {
        // 后台拉取并更新缓存（不阻塞响应）
        var fetchPromise = fetch(req).then(function (resp) {
          // R15: 不缓存 opaque 响应（跨域 no-cors 产物，缓存可能产生意外行为）
          if (resp && resp.type === "opaque") return resp;
          if (resp && resp.status === 200) {
            var copy = resp.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(req, copy).catch(function () {});
            }).catch(function () {});
          }
          return resp;
        }).catch(function () { /* 离线时静默，返回 cached 或兜底 */ });
        // 有缓存先返回，否则等网络
        return cached || fetchPromise;
      })
    );
    return;
  }

  // (3) 其他请求：network-first（失败回退缓存）
  event.respondWith(
    fetch(req).then(function (resp) {
      if (resp && resp.status === 200 && resp.type === "basic") {
        var copy = resp.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(req, copy).catch(function () {});
        }).catch(function () {});
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
 * 真实部署时此处应改为 fetch(serverEndpoint, {method:'POST', body:JSON.stringify(item.payload)})。
 * @param {{op:string,payload:*,ts:number}} item - 待同步操作
 * @returns {Promise<boolean>} 是否成功
 */
function _processSyncItem(item) {
  // 框架实现：记录到诊断日志，返回成功（不实际发送）
  // 真实部署替换为：
  //   return fetch(SYNC_ENDPOINT, {method:'POST', headers:{'Content-Type':'application/json'},
  //     body:JSON.stringify({op:item.op, payload:item.payload, ts:item.ts})})
  //     .then(function(r){ return r.ok; }).catch(function(){ return false; });
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
