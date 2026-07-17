---
title: Demo
---

# Demo

このページは、いま対応している機能をまとめて確認するためのデモです。

## 目次

- [[Welcome]]
- [[Publishing Notes]]
- [[Demo#数式]]
- [[Demo#図]]

## 埋め込み

この段落の下に、別ノートを埋め込んでいます。

![[Welcome]]

`[[Publishing Notes]]` は通常リンクとして動きます。

## ブロック参照

次の文はブロック参照用です。`^demo-block` を使って呼び出せます。

Obsidian 風の公開サイトを作る^demo-block

> この行はブロック参照の対象です。^demo-block

## 数式

インライン数式: `$E = mc^2$`

表示数式:

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

## 図

```mermaid
flowchart TD
  A[ノートを書く] --> B[公開対象を notes/ に置く]
  B --> C[GitHub Pages で公開]
  C --> D[ブラウザで閲覧]
```

## YouTube

`![[https://www.youtube.com/watch?v=dQw4w9WgXcQ]]` のような埋め込みも試せます。

![[https://www.youtube.com/watch?v=dQw4w9WgXcQ]]

## 見出し参照

このページ内の [[Demo#数式]] や [[Demo#図]] へのリンクも確認できます。

