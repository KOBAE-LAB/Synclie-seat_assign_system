# Synclie 座席抽選（Synclie_seat-assign）

講義ごとの QR コードを学生が読み取り「抽選」を押すと、
「あなたの座席は＊番（グループ名）です。」と座席図が表示される、Synclie シリーズの座席・グループ抽選 Web アプリです。

- 1 講義あたり最大 150 人を想定
- 学生の個人情報は収集しません。ブラウザに保存した匿名の端末 ID のみで識別し、同じ端末での再抽選はできません
- アカウントを持つのは教員のみ（ログイン ID + パスワード、メールアドレスなし、復旧コードでパスワード再設定）
- 本番 URL（予定）: https://synclie-seat-assign.kobae-lab.com

> 現在は最初の骨組み（スキーマ・デザイントークン・仮ページ）のみです。抽選ロジックや教室エディタは今後実装します。

## 技術構成

- Next.js（App Router）+ TypeScript
- SQLite（[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)）
- Node.js 22 以上

## セットアップ（開発）

```bash
npm install
cp .env.example .env.local   # 値を編集
npm run dev                  # http://localhost:3000
```

DB ファイルは `SEAT_ASSIGN_DB_PATH`（既定 `./data/seat-assign.db`）に作成され、
初回接続時にマイグレーションが自動適用されます。手動で適用する場合は `npm run db:migrate`。

## 環境変数

| 変数名 | 内容 |
| --- | --- |
| `SEAT_ASSIGN_DB_PATH` | SQLite DB ファイルのパス |
| `SESSION_SECRET` | 教員セッション Cookie の署名用シークレット（32 文字以上のランダム文字列） |
| `OPENAI_API_KEY` | 教員メッセージ英訳用の OpenAI API キー（サーバー側でのみ使用） |

`.env.example` 以外の `.env*` はコミットしないでください（`.gitignore` 済み）。

## npm スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | 本番ビルド |
| `npm start` | 本番起動（`127.0.0.1:3008` で待ち受け） |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript 型チェック |
| `npm test` | テスト（Node.js 標準のテストランナー。スキーマのスモークテスト） |
| `npm run db:migrate` | マイグレーションを手動適用 |

## ディレクトリ構成

```
src/app/                 画面と API（App Router）
  page.tsx               トップページ（仮）
  teacher/login/         教員ログイン（仮・未実装）
  api/health/            死活監視（DB スキーマのバージョンを返す）
src/lib/db/              SQLite 接続とマイグレーション
tests/                   テスト
deploy/                  systemd ユニット・nginx 設定のサンプル
```

## データベース

| テーブル | 内容 |
| --- | --- |
| `teachers` | 教員（ログイン ID、パスワードハッシュ、復旧コードハッシュ、最終ログイン、失敗回数・ロック期限） |
| `classrooms` | 教室（所有者、名前、机・備品・座席番号のレイアウト JSON、共有コード） |
| `lectures` | 講義（教室、名前、日付、受講者数、メッセージ（日本語 / ふりがな「漢字(よみ)」表記 / 英語）、メモ、フォルダ、タグ、アーカイブ、受付状態 before/open/closed、公開 QR トークン、TT コード） |
| `lecture_groups` | 講義ごとのグループ（名前、色、並び順） |
| `lecture_seats` | 講義ごとの座席（座席番号、グループ、使用 / 予備） |
| `draws` | 抽選結果（講義、匿名端末 ID、座席、取消フラグ） |

`draws` には取消済みを除く部分 UNIQUE インデックスがあり、
**同じ座席が二重に割り当てられること** と **1 端末が 1 講義で複数座席を得ること** を DB レベルで防ぎます。
取消した座席は再び抽選対象にできます。

## デプロイ（さくら VPS / Ubuntu）

既存の Synclie アプリ（app.kobae-lab.com）と同じ VPS 上に、別アプリとして配置します。

| 項目 | 値 |
| --- | --- |
| ドメイン | `synclie-seat-assign.kobae-lab.com` |
| DNS | さくらのドメインコントロールパネルで A レコード → `49.212.150.72` |
| 待ち受け | `127.0.0.1:3008`（外部には nginx 経由でのみ公開） |
| systemd | `synclie-seat-assign.service` |
| nginx | `/etc/nginx/sites-available/synclie-seat-assign.kobae-lab.com` |
| TLS | Let's Encrypt（Certbot） |

### 1. Node.js 22 とユーザー

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential python3
sudo useradd --system --create-home --shell /usr/sbin/nologin synclie   # 既存なら不要
```

（`build-essential` / `python3` は better-sqlite3 のビルド済みバイナリが使えない場合の保険です）

### 2. 配置とビルド

```bash
sudo mkdir -p /opt/synclie-seat-assign
sudo chown synclie:synclie /opt/synclie-seat-assign
sudo -u synclie git clone https://github.com/KOBAE-LAB/Synclie-seat_assign_system.git /opt/synclie-seat-assign
cd /opt/synclie-seat-assign
sudo -u synclie npm ci
sudo -u synclie npm run build
```

### 3. 環境変数ファイル

```bash
sudo cp .env.example /etc/synclie-seat-assign.env
sudo chmod 600 /etc/synclie-seat-assign.env
sudo nano /etc/synclie-seat-assign.env
```

本番では DB を `/var/lib/synclie-seat-assign/seat-assign.db` に置きます
（systemd の `StateDirectory` で自動作成されます）。

```
SEAT_ASSIGN_DB_PATH=/var/lib/synclie-seat-assign/seat-assign.db
SESSION_SECRET=（openssl rand -base64 48 の出力）
OPENAI_API_KEY=（実際のキー）
```

### 4. systemd

```bash
sudo cp deploy/synclie-seat-assign.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now synclie-seat-assign
systemctl status synclie-seat-assign
curl http://127.0.0.1:3008/api/health   # {"status":"ok",...}
```

### 5. nginx

```bash
sudo cp deploy/synclie-seat-assign.kobae-lab.com /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/synclie-seat-assign.kobae-lab.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6. Let's Encrypt（Certbot）

DNS の A レコードが反映されてから実行します。

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d synclie-seat-assign.kobae-lab.com
```

Certbot が 443 番の設定と HTTP→HTTPS リダイレクトを追記します。更新は certbot の systemd タイマーで自動実行されます。

### 更新手順

```bash
cd /opt/synclie-seat-assign
sudo -u synclie git pull
sudo -u synclie npm ci
sudo -u synclie npm run build
sudo systemctl restart synclie-seat-assign
```

### バックアップ

SQLite は WAL モードのため、コピーには `sqlite3` の `.backup` を使ってください。

```bash
sudo sqlite3 /var/lib/synclie-seat-assign/seat-assign.db ".backup '/var/backups/seat-assign-$(date +%F).db'"
```
