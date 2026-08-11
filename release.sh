#!/usr/bin/env bash
# びあけんドリル リリーススクリプト
# 使い方: ./release.sh "コミットメッセージ"
#
# なぜ必要か: PWAのservice workerが古いキャッシュを配信するため、questions.js等を
# 更新しても CACHE_VERSION を上げないとスマホに反映されない。手動だと上げ忘れる。
# このスクリプトが CACHE_VERSION と APP_VERSION を自動で+1してから commit/push する。

set -euo pipefail
cd "$(dirname "$0")"  # リポジトリ直下で実行

MSG="${1:-}"
if [ -z "$MSG" ]; then
  echo "使い方: ./release.sh \"コミットメッセージ\""
  echo "例:     ./release.sh \"第4章の問題を10問追加\""
  exit 1
fi

# CACHE_VERSION(biaken-vN) と APP_VERSION(x.y.z) を自動インクリメント
NEW_VERS=$(python3 - <<'PY'
import re, pathlib

sw = pathlib.Path("service-worker.js")
t = sw.read_text(encoding="utf-8")
m = re.search(r'(CACHE_VERSION\s*=\s*"biaken-v)(\d+)(")', t)
if not m:
    raise SystemExit("service-worker.js の CACHE_VERSION が見つかりません")
cache_n = int(m.group(2)) + 1
t = t[:m.start()] + f'{m.group(1)}{cache_n}{m.group(3)}' + t[m.end():]
sw.write_text(t, encoding="utf-8")

app = pathlib.Path("app.js")
a = app.read_text(encoding="utf-8")
am = re.search(r'(APP_VERSION\s*=\s*")(\d+)\.(\d+)\.(\d+)(")', a)
if not am:
    raise SystemExit("app.js の APP_VERSION が見つかりません")
major, minor, patch = int(am.group(2)), int(am.group(3)), int(am.group(4)) + 1
a = a[:am.start()] + f'{am.group(1)}{major}.{minor}.{patch}{am.group(5)}' + a[am.end():]
app.write_text(a, encoding="utf-8")

print(f"biaken-v{cache_n} {major}.{minor}.{patch}")
PY
)
CACHE_V=$(echo "$NEW_VERS" | cut -d' ' -f1)
APP_V=$(echo "$NEW_VERS" | cut -d' ' -f2)
echo "バージョン更新: CACHE_VERSION=$CACHE_V / APP_VERSION=$APP_V"

git add -A
git commit -m "$MSG（$CACHE_V / v$APP_V）"
git push

echo ""
echo "✅ push完了。GitHub Pages反映まで数十秒〜数分。"
echo "📱 スマホ: アプリを完全に閉じて開き直す(念のため2回)。最下部が v$APP_V になれば反映済み。"
