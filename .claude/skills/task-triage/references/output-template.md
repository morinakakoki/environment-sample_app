# 出力フォーマット

## Artifact（既定）
`report-template.html` の `<!-- __DATA__ -->` 行を `<script>window.__TRIAGE_DATA__ = {JSON};</script>` に置き換える。JSON の形:
```json
{
  "date": "2026-09-02", "weekday": "水", "week": "W2", "week_range": "8/31–9/6", "generated_at": "07:50 JST",
  "blocks": [
    {"time": "06:30–07:30", "title": "【転職】学習ブロック", "minutes": 60, "assigned": ["drv-pf-S-2-2"], "note": ""}
  ],
  "tasks": [
    {"id": "gm-1a05bbdd", "title": "GCP 請求先アカウントの支払い情報を更新", "project": "転職",
     "source": {"name": "Gmail", "url": "https://mail.google.com/mail/u/0/#inbox/1a05bbdd3c079d5c"},
     "due": "2026-09-01", "effort_min": 15, "kind": "admin",
     "consequence": "放置するとプロジェクト停止 → Cloud Run Jobs が止まる",
     "score": {"U": 40, "I": 25, "C": 20, "Q": 10}, "total": 95, "tier": "red", "today": true,
     "why": "期限超過・ポートフォリオ基盤が止まる・15 分で終わる"}
  ],
  "waiting": [{"title": "青山メインランド 玄関鍵解錠", "source": {"name": "Gmail", "url": "..."}, "since": "2026-09-01", "next_check": "2026-09-04"}],
  "stalled": [{"title": "理解度 #11 監視", "last": "—", "days": 0, "action": "S-3 以降で触る"}],
  "excluded": [{"title": "メルマガ・案件紹介 14 件", "why": "対応不要"}],
  "line_text": "…（§LINE の文面）…"
}
```
`tier` は `red | orange | yellow | grey`。`today` は今日の枠に割り当てたか。`blocks[].assigned` は task の id。一部だけ入れる時は `{"id": "cal-sub5", "min": 60}`。`due` は `YYYY-MM-DD` か `null`。

## Notion（`--notion`）
title: `タスク整理 YYYY-MM-DD`。本文:
```
# YYYY-MM-DD (曜) Wn　🔴 a件 / 🟠 b件 / 🟡 c件 / ⚪ d件

## 今日の枠
| 枠 | 中身 | 所要 |
|---|---|---|

## 🔴 今日中
| # | タスク | 期限 | 所要 | 点 (U/I/C/Q) | 出典 |
|---|---|---|---|---|---|

## 🟠 今週
（同じ列）
## 🟡 視野に入れる
（同じ列）
## ⚪ バックログ
（同じ列）
## 待ち
| 件 | 誰から | 次に確認 |
## 停滞（🟡 が 14 日以上）
| 項目 | 最終更新 | 次の一手 |
```

## LINE（`--line`）
1 通に収める（1000 文字以内目安）。装飾なし。リンクは Artifact 1 本だけ。
```
📋 M/D(曜) Wn  🔴a 🟠b
■今日
06:30 S-2-2 Scheduler用SA（45分）
08:00 SQL用語3問 U1（10分）
夜  GCP支払い情報更新（15分）
■今週
9/4 習字レポート
9/6 提出⑤ 導線設計（4h・レビューゲート）
■待ち
青山メインランド 解錠（9/4に確認）
詳細 <Artifact URL>
```

## チャット（常に 3 行以内）
```
🔴 3 件。最初は GCP の支払い情報更新（15 分）。
判断: 提出⑤ を土曜 4h 枠に入れると本 Ch.3-4 が来週に押す。
<Artifact URL>
```
