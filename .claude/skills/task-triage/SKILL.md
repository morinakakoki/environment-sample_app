---
name: task-triage
description: Google カレンダー・Google Drive の進捗ログ・Notion・Gmail から「やるべきこと」を全部集め、期限×重要度×放置コスト×着手しやすさでスコアリングして 今日/今週/来週/バックログ に振り分け、今日の時間枠に割り当てる。任意で LINE に push、Notion に保存。「今日やること整理して」「タスク整理」「優先順位つけて」「何からやる？」「/task-triage」で使う。
argument-hint: "[--days N] [--line] [--notion] [--no-artifact] [LINEで来た依頼などの自由文]"
---

# task-triage — 課題の全件収集と優先順位付け

## 前提（3 点）
1. 今日 = JST。`TZ=Asia/Tokyo date +%F` で取る。週番号 W = floor((今日 − 2026-08-24) ÷ 7) + 1（転職計画.md §1-2 の W1 = 8/24〜8/30）。
2. ソースと ID は `references/sources.md` に固定してある。毎回検索し直さない。ID が変わったらそのファイルだけ直す。
3. LINE は出力専用（Messaging API push）。LINE からの取り込みは Webhook サーバが要るので不可。LINE で来た依頼は引数の自由文に貼れば取り込む。

## 引数
| 引数 | 既定 | 意味 |
|---|---|---|
| `--days N` | 14 | カレンダーの収集範囲（日） |
| `--line` | off | 上位タスクを LINE に push する。指定＝送信の同意とみなす |
| `--notion` | off | 結果を Notion の下書きページに保存する |
| `--no-artifact` | off | Artifact を出さず、Markdown をチャットに出す |
| 自由文 | — | 手入力タスク。1 行 1 件。`M/D`・`M/D まで`・`今日`・`明日` を期限として読む |

## 手順

### 1. 収集（全部並列・読み取りのみ・確認不要）
先に ToolSearch で読み込む: `select:mcp__Google_Calendar__list_events,mcp__Google_Drive__read_file_content,mcp__Notion__notion-query-data-sources,mcp__Notion__notion-search,mcp__Notion__notion-fetch,mcp__Gmail__search_threads,mcp__Gmail__get_thread`

呼び方・ID・抽出箇所は全部 `references/sources.md`。ここでは何を取るかだけ。

| # | ソース | 取るもの |
|---|---|---|
| A | Google カレンダー（primary + iPhone） | 今日〜+days の全イベント。加えて +days〜+90 日の期限イベント（summary が【で始まる／提出・レビュー・締切・期限・コンペを含む） |
| B | Google Drive（転職フォルダの 4 ファイル） | ポートフォリオ進捗ログ: 現在地・未着手・未消化の疑問・🟡 で 14 日以上更新なし ／ SQL 進捗ログ: 今週のユニット・読んだ章・🟡 2 週停滞 ／ 面接対策進捗ログ: 直近セッション日・週次チェック未実施 ／ 転職計画.md: 今週 W の行と §5 の日付付き作業 |
| C | Notion | 理解度ログで 復習予定日 ≤ 今日+7 の行 ／ 「TODO・やること・期限」検索で未チェック `- [ ]` を持つページ ／ マイタスク（データソースが空なら skip） |
| D | Gmail | sources.md のクエリで直近 7 日。対応が要るもの（決済失敗・請求期限超過・停止予告・本人確認・依頼受付）だけ。snippet で判断できない時だけ get_thread PLAIN_TEXT |
| E | 手入力 | 引数の自由文 |

### 2. 正規化
1 行 = 1 タスク。列: `id`（ソース接頭辞＋安定キー。例 `gm-1a05bbdd`, `cal-ejbjaill`, `drv-pf-S-2-2`）, `title`, `project`（転職 / LINE構築 / 生活 / その他）, `source`（名前＋リンク）, `due`（YYYY-MM-DD か —）, `effort_min`, `kind`（deadline / weekly / backlog / admin / habit / waiting）, `consequence`（放置したら何が起きるか 1 行）。

- 繰り返しの学習ブロック・SQL 用語 3 問・週次チェックは **タスクではなく枠**。枠の中身は B の「現在地」「今週のユニット」で決める。
- 同じ内容が複数ソースにある → 1 件に統合し出典を併記。
- 期限のない「未着手」は `backlog`。
- 「講師 FB 待ち」「返信待ち」「受付完了」は `waiting`。スコアを付けず別表。次に確認する日を入れる。
- メルマガ・案件紹介・PR・レポート通知は表に載せない（「除外」に件数と理由だけ）。

### 3. スコアと振り分け
`references/scoring.md` の式（U 緊急度 + I 重要度 + C 放置コスト + Q 着手しやすさ）で 0〜100。行ごとに内訳を残す。
tier: 🔴 70 以上 = 今日中 ／ 🟠 50〜69 = 今週 ／ 🟡 30〜49 = 視野に入れる ／ ⚪ 29 以下 = バックログ。期限が 15 日以上先は 49 点で頭打ち。
同点: 期限が早い → 本人の圧縮順 → 所要が短い。本人ルールによる上書き（12h 未消化 2 週、🟡 停滞、GCP 11/16、コンペ週）は scoring.md 末尾。

今日の割り当て: A の今日の枠（学習ブロック等＋予定の無い夜など空き時間）を上から埋める。枠ごとに「割り当てた effort の合計 ≤ 枠の分数」。溢れた 🔴 は「枠なし」と明記して落とさない。

### 4. セルフチェック（出す前に 1 回。結果は書かない。✗ は直してから出す）
- A の期限イベントが全部表にある
- D で「対応が要る」と判定した全部が表にある
- 出典リンクの無い行が無い
- 今日の割り当ての合計分 ≤ 今日の空き枠の合計分
- U/I/C/Q の内訳が無い行が無い
- `waiting` がスコア表に混ざっていない
- 日付は全部 YYYY-MM-DD、今日より前の期限は「超過」扱い

### 5. 出力
1. **Artifact（既定）**: `references/report-template.html` をコピーし、`<!-- __DATA__ -->` の行を `<script>window.__TRIAGE_DATA__ = {JSON};</script>` に置き換える（JSON の形は `references/output-template.md`）。保存先はスクラッチパッドの `task-triage/triage.html`（**毎日同じパス**＝同じ URL に再公開）。Artifact tool で公開。初回だけ favicon 🗂️。artifact-design skill を先に読む。
2. **`--notion`**: `notion-create-pages` を `creation_mode: "draft"` で。title `タスク整理 YYYY-MM-DD`、本文は `references/output-template.md` §Notion の表。
3. **`--line`**: `references/output-template.md` §LINE の文面を作り、`python3 scripts/line_push.py` に stdin で渡す。環境変数 `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_USER_ID` が無ければ送らず、文面だけ出して「未送信」と書く。
4. **チャット本文は 3 行以内**: 結論 1 文（🔴 の件数と最初にやること）＋判断が要る点（あれば）＋Artifact の URL。表や手順の再掲はしない。

## 定期実行（任意）
- claude.ai/code（クラウド）: Routine を 1 つ作る。`create_trigger` で `cron_expression: "0 21 * * *"`（= JST 06:00）、`create_new_session_on_fire: true`、prompt `/task-triage --line`。LINE を使うなら環境設定に上の 2 つの環境変数を入れる。
- ローカル: `/loop 24h /task-triage`、または CronCreate。

## 使えないこと（事実）
- LINE のトーク内容を読む: 不可（Webhook サーバが要る）。
- Lステップ・LINE 公式アカウントマネージャーのデータ取得: API 非公開。手入力で対応。
- Notion「マイタスク」: Notion 標準の My Tasks ビューで、タスク DB を作るまで空。
