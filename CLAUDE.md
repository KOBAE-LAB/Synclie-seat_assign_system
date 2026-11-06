# CLAUDE.md

このリポジトリで作業する Claude（Claude Code）向けの約束事です。

## プルリクエスト

- 変更は `main` から切ったブランチで行い、PR を作成する。`main` へ直接 push しない。
- CI（`.github/workflows/ci.yml` のジョブ `ci`）が設定済みなので、PR を作成したら
  自動マージ（squash）を有効にする:

  ```bash
  gh pr merge --auto --squash
  ```

  （`gh` が使えない環境では GitHub MCP の `enable_pr_auto_merge` を merge method `SQUASH` で使う）
- CI が通ると自動で `main` にマージされ、本番サーバーが 5 分以内に自分で取り込む
  （`deploy/auto-update.sh`）。つまり **PR を出す = 本番に出る** ので、
  `npm run lint` / `npm run typecheck` / `npm test` / `npm run build` を手元で通してから push する。
- ジョブ名 `ci` は必須チェックと自動更新の両方で参照しているので変更しない。

## ドキュメント

- README・コメント・コミットメッセージは日本語で書く。
