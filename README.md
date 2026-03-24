# 爆サイ通知

爆サイの特定スレシリーズを監視し、新着レスがあったときだけ Discord に通知する小さい監視ツールです。読むのは爆サイ本体で行う前提なので、独自ビューアや履歴画面はありません。

ローカル単発実行に加えて、GitHub Actions で 5 分おきの自動監視にも対応しています。

## できること

- 現在監視中スレを Playwright で取得
- タイトルと最新レス番号を抽出
- 前回保存したレス番号との差分から新着投稿を通知
- 1000 到達を通知
- 次スレ候補を検知して通知
- 次スレへ監視対象を自動切替して通知
- 状態を `data/state.json` に保存
- エラー時にログ出力しつつ Discord Webhook へ通知
- GitHub Actions 実行後に `data/state.json` を自動コミットして継続利用
- 手動実行時だけ Discord テスト通知を送信可能

## ファイル構成

```text
爆サイ通知/
  .github/workflows/
    bakusai-watch.yml
  src/
    fetchThread.js
    parseThread.js
    detectNextThread.js
    notifyDiscord.js
    storage.js
    main.js
  data/
    state.json
  package.json
  README.md
  .env.example
```

## ローカル実行

1. 依存関係をインストールします。

```powershell
npm.cmd install
npx.cmd playwright install chromium
```

2. `.env.example` を参考に `.env` を作成します。

```env
THREAD_URL=https://bakusai.com/thr_res/acode=3/ctgid=103/bid=412/tid=13105511/
WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy
STATE_FILE=./data/state.json
HEADLESS=true
INITIAL_BOOT_NOTIFY=false
INCLUDE_POST_SNIPPETS=false
BAKUSAI_SEARCH_URL_TEMPLATE=https://bakusai.com/sch_thr_thread/acode=0/word={query}/
```

3. 実行します。

```powershell
node src/main.js
```

初回は `data/state.json` がまだ無いので、現在の最新レス番号を保存して終了します。`INITIAL_BOOT_NOTIFY=true` のときだけ初回通知します。

## GitHub Actions で常時監視する方法

このリポジトリには `.github/workflows/bakusai-watch.yml` を追加してあります。ワークフロー名は `爆サイ通知` です。GitHub に push すると、GitHub Actions から 5 分おきに監視できます。

### 1. 必要な Secrets を設定する

リポジトリの `Settings` → `Secrets and variables` → `Actions` → `New repository secret` から設定します。

必須:

- `DISCORD_WEBHOOK_URL`: Discord Incoming Webhook URL
- `THREAD_URL`: 監視開始スレ URL

任意:

- `SERIES_NAME`: タイトル解析が不安定なときにシリーズ名を固定したい場合
- `BAKUSAI_SEARCH_URL_TEMPLATE`: 板や地域ごとに検索 URL を調整したい場合

### 2. ワークフローを有効にする

ワークフローは次の 2 パターンで動きます。

- `schedule`: 5 分おき自動実行
- `workflow_dispatch`: GitHub 画面から手動実行

### 3. 初回実行の挙動

初回は `data/state.json` に基準値を保存して終了します。2 回目以降の実行から差分通知が始まります。

### 4. state.json の永続化

GitHub Actions は毎回クリーンな環境で動くため、実行後に `data/state.json` が更新されていれば自動コミットしてリポジトリへ push します。変更が無いときはコミットしません。

### 5. Discord テスト通知

GitHub の `Actions` タブから `爆サイ通知` を `Run workflow` するときに `test_notify` をオンにすると、監視処理の前に 1 回だけテスト通知を送ります。

## GitHub Actions の注意点

- GitHub Actions の `schedule` は厳密に 5 分ちょうどではなく、少し遅れることがあります。
- 初回実行時は通知せず基準値だけ保存する想定です。
- `data/state.json` は監視状態を保持するため、リポジトリ管理対象です。
- ワークフローは `concurrency` を設定しているので、前回実行中に次回が重なっても暴走しにくくしています。
- Playwright のブラウザセットアップを毎回行います。
- エラー時は `DISCORD_WEBHOOK_URL` が設定されていれば Discord へ通知します。

## 手動実行方法

GitHub 上で手動実行したい場合は `Actions` タブから `爆サイ通知` を開き、`Run workflow` を押してください。Webhook 疎通だけ確認したいときは `test_notify` をオンにします。

ローカルで手動実行したい場合は従来どおり次です。

```powershell
node src/main.js
```

## 環境変数

- `THREAD_URL`: 監視開始スレ URL
- `BAKUSAI_THREAD_URL`: GitHub Actions などで `THREAD_URL` の代わりに使える別名
- `WEBHOOK_URL`: Discord Incoming Webhook URL
- `DISCORD_WEBHOOK_URL`: GitHub Actions などで `WEBHOOK_URL` の代わりに使える別名
- `SERIES_NAME`: 任意。タイトル解析が不安定な場合はシリーズ名を固定
- `STATE_FILE`: 状態 JSON の保存先
- `HEADLESS`: `false` にするとブラウザを表示
- `INITIAL_BOOT_NOTIFY`: 初回保存時にも通知するか
- `INCLUDE_POST_SNIPPETS`: 新着通知に本文らしき抜粋を少し入れるか
- `FORCE_TEST_NOTIFY`: `true` なら監視前に Discord テスト通知を送る
- `RUN_SOURCE`: 実行元をテスト通知に含めるための補助値
- `PLAYWRIGHT_TIMEOUT_MS`: ページ取得タイムアウト
- `BAKUSAI_SEARCH_URL_TEMPLATE`: 次スレ探索用 URL テンプレート。`{query}` にシリーズ名を入れる

## 通知例

```text
🧪 Discordテスト通知
実行元: workflow_dispatch
THREAD_URL: https://...
```

```text
📨 新着投稿: 3件
スレ: 五反田 ピンサロ MarineSurprise マリンサプライズ 39
最新レス: #842
URL: https://...
```

```text
⚠️ 1000到達: 五反田 ピンサロ MarineSurprise マリンサプライズ 39
URL: https://...
```

```text
🧵 次スレ候補を検知: 五反田 ピンサロ MarineSurprise マリンサプライズ 40
URL: https://...
```

```text
✅ 監視対象を切替: 39 → 40
URL: https://...
```

```text
❗ エラー: スレ取得に失敗しました
```

## 実装メモ

- DOM 全体差分ではなく、タイトル、レス番号、次スレ候補リンクのような意味単位で比較しています。
- 次スレ検知は、まず現在スレのリンクから探し、見つからないときだけ検索 URL を使った候補探索へ進みます。
- 爆サイの DOM が変わった場合は、`src/parseThread.js` の抽出ルールを微調整してください。

