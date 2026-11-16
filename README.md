# Obsidian R2 Viewer

private GitHubリポジトリの最新コミットをR2へ同期し、Obsidian記法を読みやすいWeb画面で表示するCloudflare Workerです。閲覧時はGitHub APIへアクセスせず、R2からMarkdownと添付資料を配信します。

## 構成

- GitHub `push` WebhookをWorkerが署名検証して受信する。
- WorkerがGitツリーとR2マニフェストのSHAを比較し、変更されたファイルだけをR2へ同期する。
- React画面がR2上のMarkdownを表示し、基本的なwikilink、画像・PDF・音声・動画の埋め込みに対応する。

## セットアップ

1. `npm install` を実行し、`npx wrangler r2 bucket create obsidian-vault-content` でバケットを作成する。
2. `wrangler.jsonc` の `GITHUB_OWNER`、`GITHUB_REPO`、`GITHUB_BRANCH` を対象に合わせる。公開対象を絞る場合は `PUBLIC_PREFIX` に例えば `notes/` を設定する。
3. `.dev.vars.example` を `.dev.vars` に複製し、開発用の値を設定する。本番では `npx wrangler secret put GITHUB_TOKEN`、`GITHUB_WEBHOOK_SECRET`、`SYNC_TOKEN` をそれぞれ登録する。
4. `npm run build && npx wrangler deploy` を実行する。
5. GitHubの対象リポジトリでWebhookを追加する。送信先は `https://<worker-domain>/api/webhook/github`、Content typeは `application/json`、イベントは `Just the push event`、Secretは `GITHUB_WEBHOOK_SECRET` と同一にする。
6. 初回のみ `POST /api/admin/sync` に `Authorization: Bearer <SYNC_TOKEN>` を付けて同期する。

## 必要な権限

GitHub tokenはfine-grained PATまたはGitHub Appを使い、対象リポジトリだけの `Contents: Read` に限定する。トークンをコミット、クライアント、R2マニフェストへ保存しない。

## 開発と検証

```sh
npm install
npm run check
npm run dev
```

`npm run dev` のR2はローカルエミュレーションであり、本番バケットを変更しない。
