/* eslint-env serviceworker */
/**
 * Service Worker for Agent 工作台
 * 分层缓存策略：
 *   - 同源静态资源（.html/.json/.svg/.js/.css）：cache-first
 *   - 跨域 API 请求（http/https 且非同源）：stale-while-revalidate
 *   - 其他请求：network-first（失败回退缓存）
 * 缓存版本号变更后，activate 会清理所有非当前版本的旧缓存。
 */
var CACHE_VERSION = "v5-20260808";
var CACHE_NAME = "wb-cache-" + CACHE_VERSION;

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
