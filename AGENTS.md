# AGENTS.md

このリポジトリで手を入れるのは **`quiz/` だけ**です。ルート直下は Rails チュートリアルの
サンプルアプリで、いまは触りません。

## 触る前に読む

**`quiz/README.md`。** 設計判断の理由（なぜこの並び順か、なぜこの見せ方か）が全部
書いてあります。このファイルに無い「なぜ」は README にあります。

## セットアップ・ビルド・テスト

```bash
cd quiz/tests && npm install       # 初回のみ（playwright）
npx playwright install chromium    # 初回のみ。CHROME_PATH で既存の Chrome を指してもよい

cd quiz && node build-pages.mjs    # GitHub Pages に配る一式 → quiz/_site/
cd quiz && node build-artifact.mjs # index.html + quiz-data.json → artifact.html
cd quiz/tests && sh runall.sh      # 21スイート・785項目（両方のビルドも自動で走る）
```

`runall.sh` は静的サーバ（8777 / 8790）を自分で上げます。**1項目でも落ちたまま出さない
でください。**

## 守る制約

- **LLM API は使わない**（ランニングコスト 0 円）
- **ES5 風**（`var` / `function`）。モダン化しない
- **`quiz-data.json` を差し替えるだけで問題が増える**＝問題を足すのにコード変更は不要
- スマホ **375px 優先**。ライト／ダーク両対応
- CSS は既存の**1つの `<style>`** に追記する。2つ目を足すと発行時に静かに落ちる
- Notion 連携は任意。繋がらなくても埋め込みの問題で普通に解けること
- **`quiz/artifact.html` と `quiz/_site/` は生成物。手で編集しない**（ビルドが上書きする）
- `index.html` の `var APP_BUILD = 'dev';` `var DOC_URL = 'design-doc.html';`
  `var NOTE_URL = 'note.html';` は**ビルドが差し替える目印**。消すと
  `build-artifact.mjs` が落ちる

## 章を増やすときは3か所

クイズの解説にある**章のチップ**（`第2章 BigQuery`）は `note.html#c2` を指します。
章を増やすときは次の3つを一緒に直してください。

| 何 | どこ |
| --- | --- |
| 章の番号と名前 | `quiz/index.html` の `DEFAULT_CHAPTER_TITLES` |
| リンクの行き先 | `quiz/note.html` の `<details id="c1">`〜`"c7"` |
| 問題の所属 | `quiz/quiz-data.json` の `chapter` |

`build-pages.mjs` が章の id を数えていて、**7個でなければビルドが落ちます**（増やしたら
その数も一緒に直す）。数が合っていてもリンク先がずれると 404 にはならず、黙って
ページの先頭に着くだけなので、押しても気づけません。

## 方式設計書の節番号を動かすときは3か所

クイズは「方式設計書 §4 データ方式」のように節を名指しし、そこからリンクします。
節番号を変えるときは次の3つを一緒に直してください。

| 何 | どこ |
| --- | --- |
| 方式 → 節番号の対応 | `quiz/index.html` の `METHOD_DOC` |
| 問題ごとの細かい指し先 | `quiz/quiz-data.json` の `section` |
| リンクの行き先 | `quiz/design-doc.html` の `<h2 id="s1">`〜`"s11"` |

**ずれてもリンクは 404 になりません。**黙って設計書の先頭に着くだけなので、押しても
気づけません。`quiz/tests/docref.mjs` の【11】がこの3つの整合を見ています。

## 配り先は2つ

| 配り先 | 何が正 | 反映のしかた |
| --- | --- | --- |
| **GitHub Pages（本番）** | リポジトリ | `master` に push → `.github/workflows/pages.yml` が自動で配る |
| アーティファクト（旧） | 公開版が先に進むことがある | Claude に再発行を頼む（下記） |

公開 URL: **https://morinakakoki.github.io/environment-sample_app/**

Pages 側は **Codex だけで更新まで完結します。**ふだんはこちらだけ考えれば足ります。
Notion 連携（問題の自動取り込み・学習記録の端末間同期）が要るときだけアーティファクト版
を使います。**学習記録は2つの版で別々**です（移すならアプリのバックアップ／復元）。

## できないこと：アーティファクトへの発行

`quiz/artifact.html`（復習クイズ）・`quiz/design-doc.html`（方式設計書）・
`quiz/note.html`（基礎知識ノート）は claude.ai のアーティファクトとしても公開されています。

**発行は Claude 側の機能です。Codex など他のエージェントからは実行できません。**
編集・ビルド・テスト・コミット・push までは他のエージェントで完結します。公開版に
反映するときだけ、push したうえで Claude に1行頼んでください。

```
quiz/artifact.html と quiz/design-doc.html と quiz/note.html を、それぞれ元の URL に再発行して
```

| アーティファクト | URL |
| --- | --- |
| データ基盤 復習クイズ | https://claude.ai/code/artifact/961a5f90-b530-4a93-8925-de6cdb85e282 |
| マーケットデータ基盤 方式設計書 | https://claude.ai/code/artifact/68d8ce3d-c753-4c35-9e96-73d1f6553fff |
| 基礎知識ノート | https://claude.ai/code/artifact/39af473a-7ab5-4f68-9d60-561aa254e638 |

> **発行の前に、公開中の版を読み出して差分を確かめてください。**
> クイズ側はアプリの「問題を追加」画面からその場で保存できるので、**リポジトリの
> `quiz-data.json` に無い問題が公開版にだけ入っていることがあります。**ビルドし直した
> `artifact.html` をそのまま被せると、その問題が消えます。
