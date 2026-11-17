# Obsidian Local Viewer

private GitHubリポジトリをローカルへcloneし、閲覧リクエストごとに最新コミットを`git pull --ff-only`してObsidian記法を表示するNodeサーバーです。Cloudflare Tunnelで安全に公開できます。

## 構成

- 初回アクセス時に対象リポジトリをcloneし、以後はアクセスごとにfast-forwardのみ許可してpullする。
- React画面がローカル作業ツリーのMarkdownと添付資料を配信する。
- Cloudflare Tunnelは公開経路のみを担い、Cloudflare Accessで認証を追加できる。

## セットアップ

1. `.env.example` を`.env`へ複製し、privateリポジトリURLと、他の用途に使わないローカル作業ツリーを設定する。
2. `npm install && npm run serve` を実行する。Git認証はSSH鍵・ssh-agentまたはGit Credential Managerで事前に通しておく。
3. `cloudflared tunnel --url http://localhost:8787` で一時公開する。恒久公開時はNamed TunnelとCloudflare Accessを設定する。

## 必要な権限

Git認証情報をリポジトリや`.env`へコミットしない。HTTPSを使う場合もGit Credential Managerを用い、トークンは対象リポジトリだけの読み取り権限に限定する。

## 開発と検証

```sh
npm install
npm run check
npm run dev
```

`npm run dev` はローカル作業ツリーだけを読み書きする。公開先にはCloudflare Accessを設定し、閲覧者を制限する。

## Basic認証

`.env` の `BASIC_AUTH_USER` と `BASIC_AUTH_PASSWORD` は必須です。サーバーはHTML、API、添付資料を含む全リクエストにHTTP Basic認証を要求します。十分に長いランダムなパスワードを使い、`.env`をコミットしないでください。Cloudflare TunnelはHTTPSを提供するため、認証情報は暗号化された接続上で送信されます。
