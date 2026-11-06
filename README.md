# Synclie 座席抽選（Synclie_seat-assign）

講義ごとの QR コードを学生が読み取り「抽選」を押すと、
「あなたの座席は＊番（グループ名）です。」と座席図が表示される、Synclie シリーズの座席・グループ抽選 Web アプリです。

- 1 講義あたり最大 150 人を想定
- 学生の個人情報は収集しません。ブラウザに保存した匿名の端末 ID のみで識別し、同じ端末での再抽選はできません
- アカウントを持つのは講師のみ（ログイン ID + パスワード、メールアドレスなし、復元コードでパスワード再設定）
- 本番 URL（予定）: https://synclie-seat-assign.kobae-lab.com

> 現在は骨組みと講師ログイン（アカウント作成・ログイン・パスワード再設定）まで実装済みです。抽選ロジックや教室エディタは今後実装します。

## 使い方（講師）

1. 「講師ログイン」→「アカウントを作成」。表示される復元コードは必ず控える
2. **教室を作る**：部屋の幅・奥行き（cm）を決め、机と備品を置く
   - 机：学生机／テーブル付き椅子（袖付き椅子）／長机（2人）／台形（3人、2 つで六角形）／丸テーブル（4人）／カスタム（幅・奥行き・席数を指定）
   - 備品：黒板・教卓・スクリーン・ドア・窓・柱・その他（表示名を変えられる）
   - ドラッグで移動、5° 刻みで回転、「黒板の方を向く」（黒板に正対）・「黒板の中心に向ける」（扇形）、複製・削除、元に戻す
   - 複数選択：何もないところからドラッグで囲む／Shift・Ctrl/⌘＋クリック／「複数選択」をオン（タブレット向け）／「すべて選択」（Ctrl/⌘+A）。選んだものはまとめて移動・回転・黒板に向ける・複製・削除できる
   - 「まとめて並べる」で机を縦×横に一括配置。「席番号を前から振り直す」で前列の左から番号を振る
   - 机どうしのすき間が 25 cm 以下なら同じ「島」（グループ分けに使う）
   - 以前のマス目方式で作った教室・講義は、学生机の配置に自動で変換される（席番号はそのまま）
3. **講義を作る**：教室・受講者数・グループの分け方（島ごと／席番号順に N グループ／なし）を選ぶ。受講者数ぶんの席が島ごとに均等に「使用席」になり、残りは予備席（使用席が埋まると予備席から割り当て）
4. 講義画面で「QR をスクリーンに表示」→ プロジェクターに映す
5. 「受付を開始」すると、学生の画面に「抽選」ボタンが出る（受付前に開いていた学生の画面も自動で切り替わる）
6. 講義画面には抽選結果と座席図が 5 秒ごとに更新される。取消・代理抽選・全リセット・受付終了ができる
   - 抽選結果の「移動」で席を移せる（移動先が抽選済みなら 2 人の席を入れ替え）
   - 「使用席／予備席を切り替える」をオンにして座席図の席を押すと、使用席 ⇔ 予備席を切り替えられる
   - スクリーン表示では、埋まった席がグレーアウトされ、空席が一目で分かる

7. 「講義の設定・メッセージ」で講義名・日付・学生へのメッセージを編集できる
   - ふりがなは保存時にサーバー側（kuromoji）で自動で付く。「漢字(よみ)」の形で手直しもできる
   - 英訳はサーバーに `OPENAI_API_KEY` があれば講義作成時に自動で作り、「英訳を自動で作る」で作り直せる（キーがなければ手で入力）

8. 「TT・参観コード」を発行して渡すと、TT の講師や参観者が `/tt` でコードを入力し、抽選状況・座席図・グループごとの席を閲覧できる（操作不可、12 時間有効）。再発行・無効化もできる

9. 講義画面の「出力」から：CSV（Excel で開ける）、QR 画像（PNG）、印刷・PDF（座席図と抽選結果／机に置く座席ラベル／掲示用 QR）。印刷画面で「PDF に保存」を選ぶと PDF になる

10. 講義の設定で、メモ（学生には見えない）・フォルダ・タグを付けられる。講義一覧で検索・フォルダ・タグで絞り込み。使い終わった講義は「アーカイブする」で一覧から外せる（受付終了・学生の QR も無効。あとで戻せる）
11. 教室の編集画面で「共有コード」を発行すると、ほかの講師が講義一覧の「共有コードから教室をコピー」で配置をコピーできる

学生は QR を読み取って「抽選」を押すだけです。画面右上で「日本語／ふりがな／English」を切り替えられます（選んだ言語は端末に保存）。ブラウザに保存した匿名の端末 ID で識別し、同じ端末では再抽選できません（再読み込みしても同じ席が表示されます）。

## デザイン

画面は「Synclie コンセプトデザイン・ノート」（`KOBAE-LAB/synclie-concept-design`）に合わせています。

- 色：ブランド `#800b16`（ホバー `#590909`）、文字 `#232323`／`#676767`、背景 `#f4f4f4`、線 `#dedede`。トークンは `src/app/globals.css` の `:root`
- 書体：Arial, Hiragino Kaku Gothic ProN, Noto Sans JP
- ヘッダー：`#161616` に KOBAE LAB ロゴ ｜「Synclie - 座席・グループ抽選」｜右に講師Studio。フッターは「KOBAE LAB · Synclie」
- カード：白・角丸 12px。主要なカードは上辺にえんじ色の太線（`.card--accent`）、英字の小見出し（`.eyebrow`）
- ボタン：角丸 8px。主ボタンはえんじ、副ボタンは白地に灰色の枠
- ガイドキャラクター「Techるくん」（`.guide`）：トップ・講義一覧・学生画面などに表示
- 画像：`public/brand/`（`logo-dark.png` は公式ロゴ `logo.png` の黒背景を透過して切り出したもの、キャラクターは公式画像を縮小したもの）。ファビコンは `src/app/icon.png`

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
| `SESSION_SECRET` | 講師セッション Cookie の署名用シークレット（32 文字以上のランダム文字列。本番では未設定だとログインできません） |
| `OPENAI_API_KEY` | 講師メッセージ英訳用の OpenAI API キー（サーバー側でのみ使用。未設定なら自動英訳なし） |
| `OPENAI_MODEL` | 英訳に使うモデル（省略時 `gpt-4o-mini`） |
| `PUBLIC_BASE_URL` | 学生用 URL（QR コード）の基点。未設定ならアクセスされたホスト名から組み立てる（本番では `https://synclie-seat-assign.kobae-lab.com` を推奨） |

`.env.example` 以外の `.env*` はコミットしないでください（`.gitignore` 済み）。

## npm スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | 本番ビルド |
| `npm start` | 本番起動（`127.0.0.1:3008` で待ち受け） |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript 型チェック |
| `npm test` | テスト（Node.js 標準のテストランナー。スキーマ・講師認証） |
| `npm run db:migrate` | マイグレーションを手動適用 |
| `npm run purge:inactive` | 2 年間使われていないアカウントを今すぐ削除 |

## ディレクトリ構成

```
src/app/                   画面と API（App Router）
  page.tsx                 トップページ（仮）
  teacher/actions.ts       講師認証の Server Actions（ログイン・作成・再設定・ログアウト）
  teacher/(public)/        ログイン不要の講師ページ（login / signup / reset）
  teacher/(protected)/     ログイン必須の講師ページ（/teacher 講義一覧ほか）
  tt/ terms/ privacy/      TT・参観、利用規約、プライバシーポリシー（仮）
  api/health/              死活監視（DB スキーマのバージョンを返す）
src/components/auth/       ログイン・作成・再設定フォーム、復元コード表示
src/lib/auth/              ハッシュ、復元コード、ロック、セッション、レート制限
src/lib/db/                SQLite 接続とマイグレーション
tests/                   テスト
deploy/                  systemd ユニット・nginx 設定・自動更新スクリプト
.github/workflows/ci.yml  CI（lint / 型チェック / テスト / ビルド）
```

## データベース

| テーブル | 内容 |
| --- | --- |
| `teachers` | 講師（ログイン ID、パスワードハッシュ、復元コードハッシュ、最終ログイン、失敗回数・ロック期限）。ログイン ID は大文字・小文字を区別せず一意 |
| `teacher_sessions` | 講師のログインセッション（トークンの SHA-256、有効期限）。講師を削除すると消える |
| `classrooms` | 教室（所有者、名前、机・備品・座席番号のレイアウト JSON、共有コード） |
| `lectures` | 講義（教室、名前、日付、受講者数、メッセージ（日本語 / ふりがな「漢字(よみ)」表記 / 英語）、メモ、フォルダ、タグ、アーカイブ、受付状態 before/open/closed、公開 QR トークン、TT コード） |
| `lecture_groups` | 講義ごとのグループ（名前、色、並び順） |
| `lecture_seats` | 講義ごとの座席（座席番号、グループ、使用 / 予備） |
| `draws` | 抽選結果（講義、匿名端末 ID、座席、取消フラグ） |

`draws` には取消済みを除く部分 UNIQUE インデックスがあり、
**同じ座席が二重に割り当てられること** と **1 端末が 1 講義で複数座席を得ること** を DB レベルで防ぎます。
取消した座席は再び抽選対象にできます。

## 講師アカウントと認証

| 画面 | URL |
| --- | --- |
| 講師ログイン | `/teacher/login` |
| 講師アカウントを作成 | `/teacher/signup` |
| パスワードを再設定 | `/teacher/reset` |
| 講義一覧（ログイン必須・仮） | `/teacher` |

- ログイン ID は 3〜40 文字の半角英数字・`_`・`-`。大文字・小文字は区別しません（`Kobae` と `kobae` は同じ ID）。パスワードは 10 文字以上
- メールアドレスは登録しません。アカウント作成時に **復元コード**（`XXXX-XXXX-XXXX-XXXX`、0/O/1/I/L を含まない）を 1 回だけ表示します。あとから再表示する方法はありません
- パスワードを忘れたときは、ログイン ID + 復元コードで再設定します。復元コードは 1 回限りで、再設定すると新しい復元コードを表示し、それまでのログインセッションはすべて無効になります
- パスワードと復元コードは `node:crypto` の scrypt（N=2^15, r=8, p=1）でソルト付きハッシュにして保存し、照合は定数時間で行います
- ログイン・再設定を続けて 5 回間違えると、そのアカウントは 15 分間ロックされます。存在しない ID にも同じ形のメッセージを返し、ID の有無はわからないようにしています
- IP アドレスごとのレート制限（ログイン・再設定 10 分に 20 回、アカウント作成 1 時間に 10 件、ID の空き確認 1 分に 60 回）。プロセス内メモリで数えるため、再起動でリセットされます
- セッションは SQLite の `teacher_sessions` に保存し、Cookie（本番は `__Host-seat_assign_session`、httpOnly・Secure・SameSite=Lax、`SESSION_SECRET` で HMAC 署名）にはトークンだけを入れます。有効期限は 30 日
- フォームはすべて Server Actions で送信し、Next.js 標準の Origin / Host 照合に加えて、アプリ側でも Origin を確認しています（CSRF 対策）
- 最後のログインから 2 年（730 日）たったアカウントは、教室・講義・抽選結果ごと自動で削除します（アプリが起動 30 秒後と 6 時間ごとに実行。`SEAT_ASSIGN_DISABLE_PURGE=1` で止められる。手動で実行するときは `npm run purge:inactive`）
- 「アカウント設定」（`/teacher/account`）で、パスワードの変更（ほかの端末はログアウト）、復元コードの再発行、アカウントの削除ができます

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

### 2. 配置（リリース方式）

サーバー上は次の構成で、`current` が今動いているリリースを指します
（詳しくは「[自動デプロイ](#自動デプロイ-ci--サーバー側の自動更新)」）。

```
/opt/synclie-seat-assign/
  repo.git/          GitHub の bare クローン（fetch 専用）
  releases/<sha>/    コミットごとのビルド済みディレクトリ（最新 3 つ）
  current            → releases/<sha> へのシンボリックリンク
  state/             失敗したコミットの記録
```

```bash
cd /tmp
D=/opt/synclie-seat-assign
sudo install -d -o synclie -g synclie $D $D/releases $D/state
U=https://github.com/KOBAE-LAB/Synclie-seat_assign_system.git
sudo -u synclie git clone --bare $U $D/repo.git
```

ビルドは手順 4 の自動更新が行います。

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
D=/opt/synclie-seat-assign
mkdir -p ~/ssa && cd ~/ssa
sudo -u synclie git -C $D/repo.git archive main deploy | tar -x
cd deploy
sudo install -m 755 auto-update.sh /usr/local/sbin/synclie-seat-assign-update
sudo install -m 644 -t /etc/systemd/system synclie-seat-assign.service
sudo install -m 644 -t /etc/systemd/system synclie-seat-assign-update.service
sudo install -m 644 -t /etc/systemd/system synclie-seat-assign-update.timer
sudo systemctl daemon-reload
sudo systemctl enable synclie-seat-assign
sudo systemctl start synclie-seat-assign-update
curl http://127.0.0.1:3008/api/health   # {"status":"ok",...}
sudo systemctl enable --now synclie-seat-assign-update.timer
```

`synclie-seat-assign-update` の初回実行で main の最新コミット（CI 成功済み）をビルドし、アプリを起動します。
ビルドに数分かかり、その間コマンドは戻りません。

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

手動の更新は不要です。PR が main にマージされると、サーバーが 5 分以内に自分で取り込みます
（次章「自動デプロイ」）。

### バックアップ

SQLite は WAL モードのため、コピーには `sqlite3` の `.backup` を使ってください。

```bash
sudo sqlite3 /var/lib/synclie-seat-assign/seat-assign.db ".backup '/var/backups/seat-assign-$(date +%F).db'"
```

## 自動デプロイ（CI + サーバー側の自動更新）

全体の流れ:

1. PR を作ると GitHub Actions の CI（ジョブ名 `ci`）が
   `npm ci` → `npm run lint` → `npm run typecheck` → `npm test` → `npm run build` と
   deploy スクリプトのテストを実行します（`.github/workflows/ci.yml`）。
2. PR は自動マージ（squash）を有効にしておき、CI が通ると自動で main にマージされます。
3. main へのマージ後のコミットでも CI が走ります。
4. サーバーの `synclie-seat-assign-update.timer` が 5 分ごとに
   `/usr/local/sbin/synclie-seat-assign-update`（= `deploy/auto-update.sh`）を実行します。
   - GitHub から main を fetch し、新しいコミットがあれば
   - そのコミットの CI が success か GitHub API
     （`https://api.github.com/repos/KOBAE-LAB/Synclie-seat_assign_system/commits/<sha>/check-runs`）で確認
     （公開リポジトリなのでトークン不要。API に届かない・CI 未完了ならその回は何もしない）
   - `releases/<sha>` にソースを展開し、ユーザー `synclie` で `npm ci` と `npm run build`
   - 両方成功したときだけ `current` を新リリースへ原子的に切り替え、`systemctl restart synclie-seat-assign`
   - `http://127.0.0.1:3008/api/health` が ok を返さなければ直前のリリースへ戻して再起動
   - リリースは最新 3 つを残して削除

**ビルドが失敗しても `current` は切り替わらないので、動いているサイトは止まりません。**
失敗したコミットは `state/failed-<sha>` に記録され、以後は再試行しません
（次の修正コミットが main に入れば、そちらがデプロイされます）。
処理は `flock` で排他しているので、ビルドが 5 分を超えても二重に走りません。
ビルドは `Nice=10` で動かし、同じ VPS の他アプリ（3005 / 3006 / 3007 / 3095）への影響を抑えています。

スクリプトの動作は `bash deploy/test-auto-update.sh` で（本番環境なしに）確認できます。CI でも毎回実行しています。

### GitHub の初回設定（一度だけ・ブラウザで操作）

1. **Settings → General → Pull Requests → 「Allow auto-merge」にチェック**
   PR ごとに「CI が通ったら自動でマージする」を予約できるようになります
   （`gh pr merge --auto --squash` や PR 画面の「Enable auto-merge」）。
   同じ欄の「Allow squash merging」も有効にしておきます。
   「Automatically delete head branches」も有効にすると、マージ後のブランチが自動で消えて便利です。
2. **Settings → Rules → Rulesets → New ruleset → New branch ruleset**
   （旧画面の Settings → Branches → Add branch protection rule でも同じことができます）
   - Ruleset Name: `main`、Enforcement status: **Active**
   - Target branches: **Add target → Include default branch**（= `main`）
   - **Require a pull request before merging** にチェック（Required approvals は **0**）
     main へ直接 push できなくなり、必ず PR 経由になります。
     承認数を 1 以上にすると、自分で承認するまで自動マージが止まります。
   - **Require status checks to pass** にチェックし、**Add checks** で `ci` を追加
     CI が成功しない限りマージできなくなります。自動マージはこの条件が満たされた瞬間に実行されます。
     （`ci` は一度でも CI が走ると候補に出ます。この PR で一度走っています）
   - **Require branches to be up to date before merging**（任意）
     main が先に進んでいたら、PR を最新の main に追従させてから再度 CI を通すことを求めます。
     より安全ですが、PR が複数あると追従待ちで自動マージが止まりやすくなります。一人で運用するならオフで構いません。
   - **Block force pushes** にチェック（main の履歴の書き換えを防ぎます）
   - **Create** で保存

### 既存サーバーの移行（一度だけ・シリアルコンソールで実行）

現在のサーバーは `/opt/synclie-seat-assign` が通常の git クローンで、その場で `.next` をビルドして動いています。
これをリリース方式に変換します。**DB（`/var/lib/synclie-seat-assign/`）と環境変数（`/etc/synclie-seat-assign.env`）には触れません。**
アプリが止まるのは手順 4〜6 の 1 分程度です。この PR が main にマージされてから実行してください。

**0. 作業場所と変数**（以降の手順は同じシェルで続けて実行します）

```bash
cd /tmp
D=/opt/synclie-seat-assign
U=https://github.com/KOBAE-LAB/Synclie-seat_assign_system.git
```

**1. 現状確認**（`{"status":"ok",...}` が返ること）

```bash
systemctl status synclie-seat-assign --no-pager
curl -s http://127.0.0.1:3008/api/health; echo
```

**2. 念のためバックアップ**（DB と環境変数。移行では変更しませんが保険として）

```bash
sudo mkdir -p /var/backups
DB=/var/lib/synclie-seat-assign/seat-assign.db
sudo sqlite3 $DB ".backup '/var/backups/seat-assign-pre-release.db'"
sudo cp -p /etc/synclie-seat-assign.env /root/synclie-seat-assign.env.bak
```

（`sqlite3` が無い場合は `sudo apt-get install -y sqlite3`）

**3. 今動いているコミットを控える**（これが最初のリリース名になります）

```bash
SHA=$(sudo -u synclie git -C $D rev-parse HEAD)
echo $SHA
```

**4. アプリを止めて、今のクローンを `releases/<SHA>` に移す**
ビルド済みの `.next` と `node_modules` ごと移すので、再ビルドは不要です。

```bash
sudo systemctl stop synclie-seat-assign
sudo mv $D /opt/ssa-old
sudo install -d -o synclie -g synclie $D $D/releases $D/state
sudo mv /opt/ssa-old $D/releases/$SHA
sudo ln -sfn releases/$SHA $D/current
ls -l $D
```

**5. fetch 用の bare クローンを作る**

```bash
sudo -u synclie git clone --bare $U $D/repo.git
```

**6. systemd ユニットと更新スクリプトを入れて、アプリを再開**
ファイルは main から取り出します（`synclie-seat-assign.service` は `WorkingDirectory` が `current` に変わっています）。

```bash
mkdir -p ~/ssa && cd ~/ssa
sudo -u synclie git -C $D/repo.git archive main deploy | tar -x
cd deploy
sudo install -m 755 auto-update.sh /usr/local/sbin/synclie-seat-assign-update
sudo install -m 644 -t /etc/systemd/system synclie-seat-assign.service
sudo install -m 644 -t /etc/systemd/system synclie-seat-assign-update.service
sudo install -m 644 -t /etc/systemd/system synclie-seat-assign-update.timer
sudo systemctl daemon-reload
sudo systemctl start synclie-seat-assign
curl -s http://127.0.0.1:3008/api/health; echo
```

ここで ok が返れば移行は完了です（中身は移行前と同じコミット）。

**7. 自動更新を試す**
`--dry-run` は fetch と CI 確認だけ行い、何をするかを表示します。

```bash
cd /tmp
sudo /usr/local/sbin/synclie-seat-assign-update --dry-run
```

問題なければ 1 回実際に実行します（新しいコミットがあればビルドして切り替えます。数分かかります）。

```bash
sudo systemctl start --no-block synclie-seat-assign-update
journalctl -fu synclie-seat-assign-update
```

`ヘルスチェック OK` か、何も出ずに終われば成功です（Ctrl+C で表示を抜けます）。

**8. タイマーを有効にする**（起動 2 分後から 5 分ごと）

```bash
sudo systemctl enable --now synclie-seat-assign-update.timer
systemctl list-timers 'synclie*' --no-pager
```

**9. 後片付け**

```bash
rm -rf ~/ssa
```

### ログの見方

```bash
journalctl -u synclie-seat-assign-update -n 50 --no-pager
journalctl -fu synclie-seat-assign-update
journalctl -u synclie-seat-assign -n 50 --no-pager
```

上 2 つが自動更新（直近 50 行 / 流しっぱなし）、3 つ目がアプリ本体のログです。
変更がない回はログを出しません。

今どのコミットが動いているか:

```bash
readlink /opt/synclie-seat-assign/current
```

### 手動ロールバック

自動のロールバックはヘルスチェック失敗時だけです。画面の不具合などで戻したいときは手動で切り替えます。

**1. 残っているリリースと現在のリリースを確認**（新しい順。最大 3 つ）

```bash
D=/opt/synclie-seat-assign
ls -lt $D/releases
readlink $D/current
```

**2. 今のコミットを「失敗」扱いにする**（しないと次の自動更新で再びデプロイされます）

```bash
BAD=$(basename $(readlink $D/current))
sudo -u synclie touch $D/state/failed-$BAD
```

**3. 戻したいリリースへ切り替えて再起動**（`<sha>` は手順 1 の一覧から選ぶ）

```bash
sudo ln -sfn releases/<sha> $D/.current.new
sudo mv -T $D/.current.new $D/current
sudo systemctl restart synclie-seat-assign
curl -s http://127.0.0.1:3008/api/health; echo
```

その後、GitHub で問題の PR を revert（PR 画面の「Revert」ボタン）すれば、
revert のコミットが通常どおり自動デプロイされます。

自動更新を一時的に止めたいとき / 再開するとき:

```bash
sudo systemctl stop synclie-seat-assign-update.timer
sudo systemctl start synclie-seat-assign-update.timer
```

失敗扱いにしたコミットを再試行させたいときは `sudo rm $D/state/failed-<sha>`。

### 自動更新スクリプト自体を更新するとき

`/usr/local/sbin/synclie-seat-assign-update` と systemd ユニットは、壊れたコミットで更新の仕組みごと止まらないよう
**自動では置き換えません**。`deploy/` 配下を変更した PR がデプロイされたら、次を実行します。

```bash
C=/opt/synclie-seat-assign/current/deploy
sudo install -m 755 $C/auto-update.sh /usr/local/sbin/synclie-seat-assign-update
sudo install -m 644 -t /etc/systemd/system $C/synclie-seat-assign-update.service
sudo install -m 644 -t /etc/systemd/system $C/synclie-seat-assign-update.timer
sudo systemctl daemon-reload
```

（`synclie-seat-assign.service` を変えたときは同様に入れて `sudo systemctl restart synclie-seat-assign`）
