#!/usr/bin/env bash
# Synclie 座席抽選: GitHub の main をサーバー側から取りに行く自動更新スクリプト
#
# synclie-seat-assign-update.timer から 5 分ごとに root で実行される。
#   1. origin/main を fetch し、新しいコミットがあるか確認
#   2. そのコミットの GitHub Actions（チェック名 "ci"）が success か確認
#      （公開リポジトリなのでトークン不要。API に届かなければ今回は何もしない）
#   3. releases/<sha> にソースを展開し、synclie ユーザーで npm ci / npm run build
#   4. 成功した場合のみ current シンボリックリンクを原子的に切り替えて再起動
#   5. /api/health が ok を返さなければ直前のリリースへ戻して再起動
#   6. リリースは新しい順に 3 つだけ残す
#
# ビルドが失敗しても current は変わらないので、動いているサイトは止まらない。
# ログは標準出力 → journal（journalctl -u synclie-seat-assign-update）。
#
# 使い方:
#   auto-update.sh            通常実行
#   auto-update.sh --dry-run  fetch と CI 確認だけ行い、以降の操作は表示のみ
#
# テスト用に以下の環境変数で既定値を上書きできる（本番では使わない）:
#   SSA_BASE SSA_REPO_URL SSA_BRANCH SSA_APP_USER SSA_SERVICE SSA_HEALTH_URL
#   SSA_API_BASE SSA_KEEP SSA_LOCK SSA_HEALTH_TRIES SSA_HEALTH_INTERVAL

set -euo pipefail

BASE="${SSA_BASE:-/opt/synclie-seat-assign}"
GH_REPO="KOBAE-LAB/Synclie-seat_assign_system"
REPO_URL="${SSA_REPO_URL:-https://github.com/${GH_REPO}.git}"
BRANCH="${SSA_BRANCH:-main}"
APP_USER="${SSA_APP_USER:-synclie}"
SERVICE="${SSA_SERVICE:-synclie-seat-assign}"
HEALTH_URL="${SSA_HEALTH_URL:-http://127.0.0.1:3008/api/health}"
API_BASE="${SSA_API_BASE:-https://api.github.com/repos/${GH_REPO}}"
CI_CHECK_NAME="ci"
KEEP="${SSA_KEEP:-3}"
LOCK="${SSA_LOCK:-/run/synclie-seat-assign-update.lock}"
HEALTH_TRIES="${SSA_HEALTH_TRIES:-30}"
HEALTH_INTERVAL="${SSA_HEALTH_INTERVAL:-2}"

REPO="$BASE/repo.git"
RELEASES="$BASE/releases"
CURRENT="$BASE/current"
STATE="$BASE/state"

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h | --help)
      sed -n '2,24p' "$0"
      exit 0
      ;;
    *)
      echo "不明な引数: $arg" >&2
      exit 2
      ;;
  esac
done

log() { echo "[auto-update] $*"; }
err() { echo "[auto-update] エラー: $*" >&2; }

# アプリ用ユーザーでコマンドを実行する（root 権限はビルドに使わない）
as_app() {
  if [ "$(id -un)" = "$APP_USER" ]; then
    env npm_config_cache="$BASE/.npm-cache" "$@"
  else
    runuser -u "$APP_USER" -- env \
      HOME="$BASE" \
      PATH="/usr/local/bin:/usr/bin:/bin" \
      npm_config_cache="$BASE/.npm-cache" \
      "$@"
  fi
}

# dry-run では実行せず表示だけ
run() {
  if [ "$DRY_RUN" = 1 ]; then
    log "(dry-run) $*"
  else
    "$@"
  fi
}

current_sha() {
  if [ -L "$CURRENT" ]; then
    basename "$(readlink "$CURRENT")"
  fi
}

# current を原子的に切り替える（一時リンクを作って rename）
switch_to() {
  local sha="$1"
  ln -sfn "releases/$sha" "$BASE/.current.new"
  mv -T "$BASE/.current.new" "$CURRENT"
  touch "$RELEASES/$sha"
  log "current → releases/$sha"
}

health_ok() {
  local i body
  for ((i = 1; i <= HEALTH_TRIES; i++)); do
    if body="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null)" &&
      [[ "$body" == *'"status":"ok"'* ]]; then
      return 0
    fi
    sleep "$HEALTH_INTERVAL"
  done
  return 1
}

# GitHub API の check-runs から CI 結果を判定し success/pending/failure を出力
ci_state() {
  local sha="$1" json
  if ! json="$(curl -fsS --max-time 20 \
    -H "Accept: application/vnd.github+json" \
    -H "User-Agent: synclie-seat-assign-auto-update" \
    "$API_BASE/commits/$sha/check-runs?check_name=$CI_CHECK_NAME")"; then
    echo "unreachable"
    return 0
  fi
  printf '%s' "$json" | as_app node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d));
    process.stdin.on("end", () => {
      let runs;
      try {
        runs = (JSON.parse(s).check_runs || []).filter((r) => r.name === process.argv[1]);
      } catch {
        console.log("unreachable");
        return;
      }
      if (runs.length === 0) return console.log("pending");
      runs.sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
      const r = runs[0];
      if (r.status !== "completed") return console.log("pending");
      console.log(r.conclusion === "success" ? "success" : "failure");
    });
  ' "$CI_CHECK_NAME"
}

prune_releases() {
  local keep_cur keep_prev dir name n=0
  keep_cur="$(current_sha)"
  keep_prev="${1:-}"
  # 新しい順（切り替え時に touch している）
  while IFS= read -r dir; do
    name="$(basename "$dir")"
    n=$((n + 1))
    if [ "$n" -le "$KEEP" ] || [ "$name" = "$keep_cur" ] || [ "$name" = "$keep_prev" ]; then
      continue
    fi
    log "古いリリースを削除: $name"
    run rm -rf -- "$dir"
  done < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d ! -name '.*' -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-)
}

main() {
  # 多重起動防止
  mkdir -p "$(dirname "$LOCK")"
  exec 9>"$LOCK"
  if ! flock -n 9; then
    log "別の更新処理が実行中のため終了"
    exit 0
  fi

  if [ ! -d "$REPO" ]; then
    err "$REPO がありません。README の移行手順を実施してください"
    exit 1
  fi
  as_app mkdir -p "$RELEASES" "$STATE"

  if ! as_app git -C "$REPO" fetch --quiet "$REPO_URL" "+refs/heads/$BRANCH:refs/heads/$BRANCH"; then
    log "fetch に失敗（ネットワーク不通？）。今回はスキップ"
    exit 0
  fi

  local new cur prev
  new="$(as_app git -C "$REPO" rev-parse "refs/heads/$BRANCH")"
  cur="$(current_sha)"

  if [ "$new" = "$cur" ]; then
    exit 0
  fi
  if [ -e "$STATE/failed-$new" ]; then
    log "$new は以前失敗したためスキップ（再試行するには $STATE/failed-$new を削除）"
    exit 0
  fi

  log "新しいコミット: $new（現在: ${cur:-なし}）"

  local ci
  ci="$(ci_state "$new")"
  case "$ci" in
    success) log "CI 成功を確認" ;;
    unreachable)
      log "GitHub API に届かないため今回はスキップ"
      exit 0
      ;;
    pending)
      log "CI がまだ完了していないため次回に持ち越し"
      exit 0
      ;;
    *)
      log "CI が成功していない（$ci）ためデプロイしない"
      exit 0
      ;;
  esac

  if [ "$DRY_RUN" = 1 ]; then
    log "(dry-run) releases/$new にソースを展開して npm ci / npm run build"
    log "(dry-run) current を releases/$new に切り替え、$SERVICE を再起動、$HEALTH_URL を確認"
    prune_releases "$cur"
    exit 0
  fi

  local rel="$RELEASES/$new" tmp="$RELEASES/.$new.tmp"
  if [ -d "$rel" ]; then
    log "releases/$new はビルド済みのため再利用"
  else
    as_app rm -rf -- "$tmp"
    as_app mkdir -p "$tmp"
    # shellcheck disable=SC2016 # 引数は内側の bash で展開する
    as_app bash -c 'git -C "$1" archive "$2" | tar -x -C "$3"' _ "$REPO" "$new" "$tmp"
    log "npm ci を実行"
    if ! (cd "$tmp" && as_app npm ci --no-audit --no-fund); then
      err "npm ci に失敗。current は変更しない"
      as_app rm -rf -- "$tmp"
      touch "$STATE/failed-$new"
      exit 1
    fi
    log "npm run build を実行"
    if ! (cd "$tmp" && as_app npm run build); then
      err "npm run build に失敗。current は変更しない"
      as_app rm -rf -- "$tmp"
      touch "$STATE/failed-$new"
      exit 1
    fi
    as_app mv -T "$tmp" "$rel"
  fi

  prev="$cur"
  switch_to "$new"
  systemctl restart "$SERVICE"

  if health_ok; then
    log "ヘルスチェック OK。$new をデプロイしました"
    prune_releases "$prev"
    exit 0
  fi

  err "ヘルスチェック失敗: $HEALTH_URL"
  touch "$STATE/failed-$new"
  if [ -n "$prev" ] && [ -d "$RELEASES/$prev" ]; then
    log "直前のリリース $prev に戻します"
    switch_to "$prev"
    systemctl restart "$SERVICE"
    if health_ok; then
      log "ロールバック完了"
    else
      err "ロールバック後もヘルスチェックに失敗。手動で確認してください"
    fi
    rm -rf -- "$rel"
  else
    err "戻せる直前のリリースがありません"
  fi
  exit 1
}

main
