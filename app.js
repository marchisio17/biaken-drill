/* =====================================================================
 *  びあけん対策ドリル  アプリ本体ロジック
 *  - 4択クイズ / 正誤・解説 / シャッフル / 復習モード / 進捗
 *  - 間違い記録と統計は localStorage に保存
 * ===================================================================== */
(function () {
  "use strict";

  // ---- アプリのバージョン（更新したらここを上げる） ----
  var APP_VERSION = "1.3.0";

  // ---- テキストの章タイトル（目次に対応） ----
  var CHAPTERS = {
    1: "ビールとは",
    2: "ビールの原料",
    3: "ビールの製造工程",
    4: "ビールの世界史",
    5: "ビールの日本史",
    6: "日本の酒税法とビール",
    7: "ビール文化と触れ合う場",
    8: "ビール文化を支える団体",
    9: "ビールの消費動向",
    10: "多様なビアスタイル",
    11: "ビールのおいしさ",
    12: "ビールをさらにおいしく",
    13: "アルコールと健康"
  };

  // ---- データ取得（questions.js の QUESTIONS） ----
  var ALL = (typeof QUESTIONS !== "undefined" && Array.isArray(QUESTIONS)) ? QUESTIONS.slice() : [];

  // ---- localStorage キー ----
  var LS_WRONG = "biaken_wrong_ids";   // 間違えた問題の id 配列
  var LS_STATS = "biaken_stats";       // { answered, correct }

  // ---- 状態 ----
  var session = {
    queue: [],        // 出題する問題の配列
    index: 0,         // 現在位置
    correct: 0,       // セッション内の正解数
    isReview: false,  // 復習モードか
    wrongThisRun: []  // このセッションで間違えた id
  };

  // ---- DOM ヘルパ ----
  function $(id) { return document.getElementById(id); }
  function show(screenId) {
    var screens = document.querySelectorAll(".screen");
    for (var i = 0; i < screens.length; i++) screens[i].classList.remove("active");
    $(screenId).classList.add("active");
    window.scrollTo(0, 0);
  }

  // ---- localStorage 安全ラッパ（プライベートブラウズ等で失敗してもアプリは動く） ----
  function lsGet(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 無視 */ }
  }

  function getWrongIds() { return lsGet(LS_WRONG, []); }
  function setWrongIds(ids) { lsSet(LS_WRONG, ids); }
  function getStats() { return lsGet(LS_STATS, { answered: 0, correct: 0 }); }
  function setStats(s) { lsSet(LS_STATS, s); }

  function addWrong(id) {
    var ids = getWrongIds();
    if (ids.indexOf(id) === -1) { ids.push(id); setWrongIds(ids); }
  }
  function removeWrong(id) {
    var ids = getWrongIds().filter(function (x) { return x !== id; });
    setWrongIds(ids);
  }

  // ---- ユーティリティ ----
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function byId(id) {
    for (var i = 0; i < ALL.length; i++) if (ALL[i].id === id) return ALL[i];
    return null;
  }
  function levelLabel(lv) { return lv ? lv + "級" : "—"; }

  // =====================================================================
  //  ホーム画面
  // =====================================================================
  function buildChapterOptions() {
    var sel = $("chapter-select");
    var chs = [];
    for (var i = 0; i < ALL.length; i++) {
      var c = ALL[i].chapter;
      if (c && chs.indexOf(c) === -1) chs.push(c);
    }
    chs.sort(function (a, b) { return a - b; }); // 章番号の小さい順
    var html = '<option value="__all__">すべての章</option>';
    for (var k = 0; k < chs.length; k++) {
      var n = chs[k];
      var title = CHAPTERS[n] ? "Ch" + n + " " + CHAPTERS[n] : "Ch" + n;
      html += '<option value="' + n + '">' + title + "</option>";
    }
    sel.innerHTML = html;
  }

  function buildLevelOptions() {
    var sel = $("level-select");
    var levels = [];
    for (var i = 0; i < ALL.length; i++) {
      var lv = ALL[i].level;
      if (lv && levels.indexOf(lv) === -1) levels.push(lv);
    }
    levels.sort(function (a, b) { return b - a; }); // 3級→2級→1級 の順
    var html = '<option value="__all__">すべての級</option>';
    for (var k = 0; k < levels.length; k++) {
      html += '<option value="' + levels[k] + '">' + levels[k] + "級</option>";
    }
    sel.innerHTML = html;
  }

  function refreshHome() {
    $("home-total-q").textContent = ALL.length;
    var stats = getStats();
    $("home-answered").textContent = stats.answered;
    $("home-rate").textContent = stats.answered ? Math.round(stats.correct / stats.answered * 100) + "%" : "—";
    var wrong = getWrongIds().filter(function (id) { return byId(id); });
    $("review-count").textContent = wrong.length;
    var rev = $("btn-review");
    if (wrong.length === 0) { rev.classList.add("btn-ghost"); }
    else { rev.classList.remove("btn-ghost"); }
  }

  // =====================================================================
  //  クイズ開始
  // =====================================================================
  function startQuiz() {
    var chVal = $("chapter-select").value;
    var lvVal = $("level-select").value;
    var pool = ALL.filter(function (q) {
      var okCh = chVal === "__all__" || String(q.chapter) === chVal;
      var okLv = lvVal === "__all__" || String(q.level) === lvVal;
      return okCh && okLv;
    });
    if (pool.length === 0) { alert("この条件に合う問題がありません。章や級を変えてみてください。"); return; }
    if ($("shuffle-toggle").checked) pool = shuffle(pool);

    session.queue = pool;
    session.index = 0;
    session.correct = 0;
    session.isReview = false;
    session.wrongThisRun = [];
    show("screen-quiz");
    renderQuestion();
  }

  function startReview() {
    var ids = getWrongIds();
    var pool = [];
    for (var i = 0; i < ids.length; i++) {
      var q = byId(ids[i]);
      if (q) pool.push(q);
    }
    if (pool.length === 0) { alert("復習する問題はありません。まずはクイズに挑戦しましょう！"); return; }
    pool = shuffle(pool);

    session.queue = pool;
    session.index = 0;
    session.correct = 0;
    session.isReview = true;
    session.wrongThisRun = [];
    show("screen-quiz");
    renderQuestion();
  }

  // =====================================================================
  //  問題表示
  // =====================================================================
  function renderQuestion() {
    var q = session.queue[session.index];
    var total = session.queue.length;

    // 進捗
    $("progress-text").textContent = (session.index + 1) + " / " + total;
    $("progress-fill").style.width = ((session.index) / total * 100) + "%";

    // メタ
    $("q-chapter").textContent = q.chapter ? "Ch" + q.chapter : "";
    $("q-chapter").hidden = !q.chapter;
    $("q-category").textContent = q.category || "その他";
    $("q-level").textContent = levelLabel(q.level);
    $("q-mode").hidden = !session.isReview;

    // 問題文
    $("q-text").textContent = q.question;

    // 選択肢（表示順を毎回シャッフルする。データ上の正解位置に依存しない）
    var box = $("choices");
    box.innerHTML = "";
    var letters = ["A", "B", "C", "D", "E", "F"];
    var order = shuffle(q.choices.map(function (_, i) { return i; })); // 元のindexを並べ替え
    session.correctDisplayIdx = order.indexOf(q.answer);               // シャッフル後の正解位置
    for (var d = 0; d < order.length; d++) {
      var origIdx = order[d];
      var btn = document.createElement("button");
      btn.className = "choice";
      btn.setAttribute("data-i", d);
      btn.innerHTML = '<span class="mark">' + letters[d] + "</span><span class=\"label\"></span>";
      btn.querySelector(".label").textContent = q.choices[origIdx];
      btn.addEventListener("click", onAnswer);
      box.appendChild(btn);
    }

    // フィードバック・次へを隠す
    $("feedback").hidden = true;
    $("btn-next").hidden = true;
  }

  // =====================================================================
  //  解答処理
  // =====================================================================
  function onAnswer(e) {
    var chosen = parseInt(e.currentTarget.getAttribute("data-i"), 10);
    var q = session.queue[session.index];
    var correctIdx = session.correctDisplayIdx; // シャッフル後の正解位置
    var isCorrect = chosen === correctIdx;

    // 全選択肢を確定表示
    var buttons = $("choices").querySelectorAll(".choice");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.add("disabled");
      var bi = parseInt(buttons[i].getAttribute("data-i"), 10);
      if (bi === correctIdx) buttons[i].classList.add("is-correct");
      else if (bi === chosen) buttons[i].classList.add("is-wrong");
      else buttons[i].classList.add("dim");
    }

    // 統計更新
    var stats = getStats();
    stats.answered += 1;
    if (isCorrect) stats.correct += 1;
    setStats(stats);

    // 間違い記録の更新
    if (isCorrect) {
      session.correct += 1;
      // 復習モードで正解したら復習リストから外す
      if (session.isReview) removeWrong(q.id);
    } else {
      addWrong(q.id);
      if (session.wrongThisRun.indexOf(q.id) === -1) session.wrongThisRun.push(q.id);
    }

    // フィードバック表示
    var fb = $("feedback");
    fb.hidden = false;
    fb.className = "feedback card " + (isCorrect ? "ok" : "ng");
    $("feedback-head").textContent = isCorrect ? "正解！ 🍻" : "残念… 正解は " + ["A", "B", "C", "D"][correctIdx] + " です";
    $("feedback-exp").textContent = q.explanation || "";

    // 進捗バーを進める
    $("progress-fill").style.width = ((session.index + 1) / session.queue.length * 100) + "%";

    // 次へボタン
    var next = $("btn-next");
    next.hidden = false;
    next.textContent = (session.index + 1 < session.queue.length) ? "次の問題へ" : "結果を見る";
  }

  function nextQuestion() {
    session.index += 1;
    if (session.index < session.queue.length) {
      renderQuestion();
    } else {
      showResult();
    }
  }

  // =====================================================================
  //  結果画面
  // =====================================================================
  function showResult() {
    var total = session.queue.length;
    var correct = session.correct;
    var rate = total ? Math.round(correct / total * 100) : 0;

    $("result-rate").textContent = rate + "%";
    $("result-correct").textContent = correct;
    $("result-count").textContent = total;
    $("result-emoji").textContent = rate === 100 ? "🏆" : (rate >= 70 ? "🎉" : (rate >= 40 ? "🍺" : "📖"));

    // 間違えた問題があれば復習ボタン
    var wrongCount = session.wrongThisRun.length;
    var revBtn = $("btn-result-review");
    var note = $("result-review-note");
    if (wrongCount > 0) {
      revBtn.hidden = false;
      note.hidden = false;
      note.textContent = "このセッションで " + wrongCount + " 問まちがえました。復習リストに追加済みです。";
    } else {
      revBtn.hidden = true;
      if (session.isReview) {
        note.hidden = false;
        note.textContent = "全問正解！ 復習リストから外れました 👏";
      } else {
        note.hidden = true;
      }
    }

    show("screen-result");
  }

  // =====================================================================
  //  リセット
  // =====================================================================
  function resetAll() {
    if (!confirm("解答数・正答率・間違い記録をすべて消します。よろしいですか？")) return;
    setWrongIds([]);
    setStats({ answered: 0, correct: 0 });
    refreshHome();
    alert("記録をリセットしました。");
  }

  // =====================================================================
  //  起動
  // =====================================================================
  function init() {
    if (ALL.length === 0) {
      document.getElementById("screen-home").innerHTML =
        '<div class="card" style="margin-top:40px">問題データを読み込めませんでした。<br>questions.js を確認してください。</div>';
      return;
    }

    buildChapterOptions();
    buildLevelOptions();
    refreshHome();

    // バージョン表示（v○○○ ・ 全△問）
    var ver = $("app-version");
    if (ver) ver.textContent = "v" + APP_VERSION + " ・ 全" + ALL.length + "問";

    $("btn-start").addEventListener("click", startQuiz);
    $("btn-review").addEventListener("click", startReview);
    $("btn-reset").addEventListener("click", resetAll);
    $("btn-next").addEventListener("click", nextQuestion);
    $("btn-quit").addEventListener("click", function () { refreshHome(); show("screen-home"); });
    $("btn-again").addEventListener("click", function () { show("screen-home"); refreshHome(); });
    $("btn-home").addEventListener("click", function () { refreshHome(); show("screen-home"); });
    $("btn-result-review").addEventListener("click", startReview);

    // Service Worker 登録（http/https のときのみ。file:// では何もしない）
    if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
      navigator.serviceWorker.register("service-worker.js").catch(function () { /* オフライン非対応でも動く */ });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
