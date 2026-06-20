/* =====================================================================
 *  Service Worker  — オフライン動作用のキャッシュ
 *  アプリのファイルを更新したら CACHE_VERSION の数字を上げてください。
 * ===================================================================== */
var CACHE_VERSION = "biaken-v5";
var ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./questions.js",
  "./manifest.webmanifest",
  "./icon-180.png"
];

// インストール時：必要ファイルを先読みキャッシュ
self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      // 1ファイルでも失敗するとインストール全体が失敗するため個別に追加
      return Promise.all(ASSETS.map(function (url) {
        return cache.add(url).catch(function () { /* 任意ファイルの欠落は許容 */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

// 有効化時：古いキャッシュを削除
self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_VERSION) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

// 取得時：キャッシュ優先、なければネットワーク（取得できたらキャッシュへ）
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(function (cached) {
      if (cached) return cached;
      return fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function (cache) { cache.put(e.request, copy); }).catch(function () {});
        return res;
      }).catch(function () { return cached; });
    })
  );
});
