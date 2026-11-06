#!/usr/bin/env bash
# deploy/auto-update.sh の動作テスト（本番環境なしで実行できる）
#
# 一時ディレクトリにローカルの git リポジトリとリリース構成を作り、
# curl / systemctl / npm をスタブに差し替えて各ケースを確認する。
#   bash deploy/test-auto-update.sh

set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/auto-update.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

BASE="$WORK/opt"
SRC="$WORK/src"
STUB="$WORK/stub"
CTRL="$WORK/ctrl" # スタブの挙動を切り替えるファイル置き場
mkdir -p "$BASE" "$SRC" "$STUB" "$CTRL"

# --- スタブ ---------------------------------------------------------------
cat >"$STUB/curl" <<'EOF'
#!/usr/bin/env bash
url="${*: -1}"
case "$url" in
  *check-runs*)
    [ -f "$CTRL/api_down" ] && exit 7
    cat "$CTRL/check_runs.json"
    ;;
  *health*)
    [ -f "$CTRL/health_fail" ] && [ "$(basename "$(readlink "$SSA_BASE/current")")" = "$(cat "$CTRL/health_fail")" ] && exit 22
    echo '{"status":"ok","schemaVersion":1}'
    ;;
  *) exit 6 ;;
esac
EOF
cat >"$STUB/systemctl" <<'EOF'
#!/usr/bin/env bash
echo "$*" >>"$CTRL/systemctl.log"
EOF
cat >"$STUB/npm" <<'EOF'
#!/usr/bin/env bash
[ -f "$CTRL/npm_fail_$1" ] && exit 1
if [ "$1" = run ] && [ "$2" = build ]; then mkdir -p .next; fi
exit 0
EOF
chmod +x "$STUB"/*

export PATH="$STUB:$PATH" CTRL
SSA_APP_USER="$(id -un)"
export SSA_BASE="$BASE" SSA_REPO_URL="$SRC" SSA_APP_USER
export SSA_LOCK="$WORK/lock" SSA_HEALTH_TRIES=2 SSA_HEALTH_INTERVAL=0
export SSA_API_BASE="http://api.invalid" SSA_HEALTH_URL="http://127.0.0.1/api/health"

# --- 補助 -----------------------------------------------------------------
pass=0
fail=0
ok() {
  echo "ok   - $1"
  pass=$((pass + 1))
}
ng() {
  echo "FAIL - $1"
  fail=$((fail + 1))
}
check() { # check <説明> <コマンド...>
  local desc="$1"
  shift
  if "$@"; then ok "$desc"; else ng "$desc"; fi
}
cur() { basename "$(readlink "$BASE/current")"; }
ci() { # ci <status> [conclusion]
  local c=null
  [ -n "${2:-}" ] && c="\"$2\""
  printf '{"total_count":1,"check_runs":[{"name":"ci","status":"%s","conclusion":%s,"started_at":"2026-01-01T00:00:00Z"}]}' \
    "$1" "$c" >"$CTRL/check_runs.json"
}
commit() {
  echo "$1" >"$SRC/file.txt"
  git -C "$SRC" add -A
  git -C "$SRC" -c user.name=t -c user.email=t@example.com commit -qm "$1"
  git -C "$SRC" rev-parse HEAD
}
update() { "$SCRIPT" "$@" >"$WORK/out.log" 2>&1; }

# --- 初期状態（README の移行手順後と同じ構成） -----------------------------
git -C "$SRC" init -q -b main
first="$(commit first)"
git clone -q --bare "$SRC" "$BASE/repo.git"
mkdir -p "$BASE/releases/$first"
ln -s "releases/$first" "$BASE/current"

# 構文チェック
check "bash -n" bash -n "$SCRIPT"

# 1. 変更なし → 何もしない
ci completed success
update
check "変更なしなら current はそのまま" [ "$(cur)" = "$first" ]
check "変更なしなら再起動しない" [ ! -f "$CTRL/systemctl.log" ]

# 2. CI 未完了 → 持ち越し
second="$(commit second)"
ci in_progress
update
check "CI 未完了ならデプロイしない" [ "$(cur)" = "$first" ]
check "CI 未完了のログ" grep -q "まだ完了していない" "$WORK/out.log"

# 3. CI 失敗 → デプロイしない
ci completed failure
update
check "CI 失敗ならデプロイしない" [ "$(cur)" = "$first" ]

# 4. API 不通 → スキップ
ci completed success
touch "$CTRL/api_down"
update
check "API 不通ならスキップ" [ "$(cur)" = "$first" ]
check "API 不通のログ" grep -q "GitHub API に届かない" "$WORK/out.log"
rm "$CTRL/api_down"

# 5. dry-run → 表示のみ
update --dry-run
check "dry-run では切り替えない" [ "$(cur)" = "$first" ]
check "dry-run ではビルドしない" [ ! -d "$BASE/releases/$second" ]
check "dry-run の表示" grep -q "(dry-run) current を" "$WORK/out.log"

# 6. 成功 → 切り替え・再起動
update
check "CI 成功ならデプロイ" [ "$(cur)" = "$second" ]
check "ビルド成果物がある" [ -d "$BASE/releases/$second/.next" ]
check "ソースが展開されている" grep -q second "$BASE/releases/$second/file.txt"
check "再起動した" grep -q "restart synclie-seat-assign" "$CTRL/systemctl.log"
check "一時ディレクトリが残らない" [ -z "$(find "$BASE/releases" -maxdepth 1 -name '.*.tmp')" ]

# 7. ビルド失敗 → current はそのまま、失敗を記録して再試行しない
third="$(commit third)"
touch "$CTRL/npm_fail_run"
: >"$CTRL/systemctl.log"
if update; then ng "ビルド失敗で終了コード 1"; else ok "ビルド失敗で終了コード 1"; fi
check "ビルド失敗なら current はそのまま" [ "$(cur)" = "$second" ]
check "ビルド失敗なら再起動しない" [ ! -s "$CTRL/systemctl.log" ]
check "失敗したリリースは残らない" [ ! -e "$BASE/releases/$third" ]
check "失敗を記録" [ -e "$BASE/state/failed-$third" ]
rm "$CTRL/npm_fail_run"
update
check "失敗済みコミットは再試行しない" grep -q "以前失敗した" "$WORK/out.log"

# 8. npm ci 失敗も同様
commit fourth >/dev/null
touch "$CTRL/npm_fail_ci"
update || true
check "npm ci 失敗なら current はそのまま" [ "$(cur)" = "$second" ]
rm "$CTRL/npm_fail_ci"

# 9. ヘルスチェック失敗 → ロールバック
fifth="$(commit fifth)"
echo "$fifth" >"$CTRL/health_fail"
: >"$CTRL/systemctl.log"
update || true
check "ヘルスチェック失敗なら元に戻す" [ "$(cur)" = "$second" ]
check "ロールバックで 2 回再起動" [ "$(grep -c restart "$CTRL/systemctl.log")" = 2 ]
check "ロールバックのログ" grep -q "ロールバック完了" "$WORK/out.log"
check "失敗を記録（ヘルスチェック）" [ -e "$BASE/state/failed-$fifth" ]
rm "$CTRL/health_fail"

# 10. 古いリリースは 3 つだけ残す
for n in 6 7 8 9; do
  commit "r$n" >/dev/null
  sleep 1 # mtime の順序を確定させる
  update
done
last="$(git -C "$SRC" rev-parse HEAD)"
check "最新がデプロイされている" [ "$(cur)" = "$last" ]
count="$(find "$BASE/releases" -mindepth 1 -maxdepth 1 -type d ! -name '.*' | wc -l)"
check "リリースは 3 つ（実際: $count）" [ "$count" = 3 ]
check "最初のリリースは削除済み" [ ! -e "$BASE/releases/$first" ]

# 11. 多重起動防止
exec 8>"$SSA_LOCK"
flock -n 8
update
check "ロック中は何もしない" grep -q "別の更新処理が実行中" "$WORK/out.log"
exec 8>&-

echo
echo "結果: $pass 件成功 / $fail 件失敗"
[ "$fail" = 0 ]
