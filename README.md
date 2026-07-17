# obsidian_public

Obsidian 形式のノートを普通の Web ページとして公開するためのリポジトリです。

## できること

- Markdown ノートの一覧表示
- ノート本文の表示
- Obsidian の `[[wikilink]]` を普通のリンクとして表示
- GitHub Pages での公開

## 使い方

1. `notes/` に Markdown ファイルを追加する
2. `notes/index.json` に公開したいノートを追記する
3. GitHub Pages を有効にして公開する

## 動作環境

- GitHub Pages
- 近年のブラウザ

## ノートの書き方

- 通常の Markdown を使う
- 見出し、箇条書き、引用、コードブロックに対応
- ノート間リンクは `[[ノート名]]` 形式で記述する

## 公開のポイント

- 公開したいノートだけを `notes/index.json` に載せる
- 非公開の下書きは `notes/index.json` に入れない
- 画像を置く場合は、同じリポジトリ内の静的ファイルとして管理する
