#!/usr/bin/env python3
"""12ケースのJSONを検証し、テンプレートHTMLへ差し込んで完成版を書き出す。"""
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
CASES_DIR = os.path.join(BASE, "cases")
TEMPLATE = os.path.join(BASE, "template.html")
OUT = os.path.join(BASE, "infra-judgment-drill.html")

# id: (field, title, frame_name, principle, [answer positions], aim)
EXPECT = {
    1: ("障害対応", "月曜9時の応答遅延",
        "事実確認→影響範囲→暫定対処→恒久対処",
        "初動は「直す」より「広げない・知らせる」",
        [1, 3, 0], "初動5分の優先順位と、切り戻しが使えないと分かった後の判断"),
    2: ("障害対応", "勝手に直ったRDS",
        "自動復旧≠障害対応完了（復旧と原因究明の分離）",
        "復旧した障害こそ、記録と原因究明を残す",
        [2, 0, 3], "自動で直った障害を、どこまで追うか"),
    3: ("障害対応", "ディスク90%はまだ障害ではない",
        "リスク＝影響度×発生確率×猶予／暫定と恒久の分離",
        "「まだ障害じゃない」は猶予を計算してから言う",
        [0, 2, 1], "まだ壊れていないものへの優先度の付け方と、手を出す範囲"),
    4: ("障害対応", "自分の作業ミスかもしれない",
        "第一報に自責他責は関係ない／隠すコストは時間で複利",
        "ミスの報告は、早いほど安い",
        [3, 1, 2], "自分のミス疑いを、いつ・誰に・どう出すか"),
    5: ("基本設計", "99.9%と予算の板挟み",
        "SPOF特定→選択肢化（松竹梅）→決めるのは顧客、材料はSE",
        "トレードオフは選択肢と数字にして、選択の記録を残す",
        [2, 1, 3], "予算と可用性のトレードオフを、誰にどう決めさせるか"),
    6: ("基本設計", "「バックアップはちゃんと」",
        "RTO/RPOからの逆算（未定義なら定義させる材料を作る）",
        "バックアップは取り方でなく、戻し方から設計する",
        [0, 3, 2], "方式を選ぶ前に決めるべきことと、省いてはいけない検証"),
    7: ("基本設計", "全部Administratorでいいでしょ",
        "最小権限×運用実効性／例外は期限と記録付き",
        "権限の例外は、期限と記録を付けて貸す",
        [3, 0, 1], "権限を絞る／貸すの線引きと、例外の出し方"),
    8: ("詳細設計", "現行踏襲のおかしな値",
        "踏襲は思考停止の免罪符ではない：指摘は義務、変更は合意",
        "おかしいと思ったら、直すのではなく記録に残る形で指摘する",
        [1, 2, 0], "現行踏襲の不審な値を、納期の中でどう扱うか"),
    9: ("詳細設計", "とりあえず80%でいい？",
        "設計値には根拠（実測・推奨値・逆算）のどれかを付ける",
        "とりあえずの値は、根拠と見直し時期をセットで残す",
        [0, 1, 3], "根拠のない設計値の置き方と、誤報が出た後の直し方"),
    10: ("テスト", "性能試験が目標未達",
         "試験は合格させるためでなく事実を測るため：事実と判断の分離",
         "試験結果は曲げない。判断は材料を揃えて委ねる",
         [3, 2, 0], "都合の悪い試験結果の報告の仕方と、条件変更の是非"),
    11: ("テスト", "SIT期間を半分にしてくれ",
         "リスクベースドテスト（業務影響度×変更度）",
         "削る時は、何を削って何のリスクが残るかを合意してから削る",
         [1, 0, 2], "試験を削る時の削り方と、合意の残し方"),
    12: ("導入設計", "切り戻すなら何時まで？",
         "切り戻しは当日決めない：基準・期限・判断者を事前定義",
         "戻る条件は、進む前に決めておく",
         [2, 3, 1], "切り戻し判断の基準・期限・判断者をどう扱うか"),
}

PLACEHOLDER = re.compile(r"(TODO|TBD|ここに書く|プレースホルダ|xxx|XXX|Lorem|\.\.\.)")


def fail(msg):
    print("NG: " + msg)
    return 1


def check(case_id, c):
    errs = 0
    field, title, frame, principle, answers, aim = EXPECT[case_id]

    if c.get("id") != case_id:
        errs += fail(f"case{case_id:02d}: id が {c.get('id')} になっている")
    if c.get("field") != field:
        errs += fail(f"case{case_id:02d}: field 不一致 -> {c.get('field')!r}")
    if c.get("title") != title:
        errs += fail(f"case{case_id:02d}: title 不一致 -> {c.get('title')!r}")
    if (c.get("frame") or {}).get("name") != frame:
        errs += fail(f"case{case_id:02d}: frame.name 不一致 -> {(c.get('frame') or {}).get('name')!r}")
    if c.get("principle") != principle:
        errs += fail(f"case{case_id:02d}: principle 不一致 -> {c.get('principle')!r}")

    scen = c.get("scenario", "")
    if not (200 <= len(scen) <= 480):
        errs += fail(f"case{case_id:02d}: scenario の長さ {len(scen)}字（200〜480想定）")

    howto = (c.get("frame") or {}).get("howto", "")
    if not (90 <= len(howto) <= 300):
        errs += fail(f"case{case_id:02d}: frame.howto の長さ {len(howto)}字（90〜300想定）")

    iv = c.get("interview")
    if not isinstance(iv, list) or len(iv) != 3:
        errs += fail(f"case{case_id:02d}: interview が3行でない")
    else:
        for k, line in enumerate(iv):
            if not (30 <= len(line) <= 110):
                errs += fail(f"case{case_id:02d}: interview[{k}] の長さ {len(line)}字（30〜110想定）")

    qs = c.get("questions")
    if not isinstance(qs, list) or len(qs) != 3:
        return errs + fail(f"case{case_id:02d}: questions が3問でない")

    for qi, q in enumerate(qs):
        tag = f"case{case_id:02d} 設問{qi + 1}"
        ch = q.get("choices")
        if not isinstance(ch, list) or len(ch) != 4:
            errs += fail(f"{tag}: choices が4つでない")
            continue
        for ci, t in enumerate(ch):
            if not (40 <= len(t) <= 150):
                errs += fail(f"{tag}: 選択肢{ci} の長さ {len(t)}字（40〜150想定）")
            if not t.rstrip().endswith("。"):
                errs += fail(f"{tag}: 選択肢{ci} が句点で終わっていない")
        if len(set(ch)) != 4:
            errs += fail(f"{tag}: 選択肢に重複がある")

        if q.get("answer") != answers[qi]:
            errs += fail(f"{tag}: answer が {q.get('answer')}（指定は {answers[qi]}）")

        ex = q.get("explain", "")
        if not (150 <= len(ex) <= 420):
            errs += fail(f"{tag}: explain の長さ {len(ex)}字（150〜420想定）")

        others = q.get("others") or []
        idxs = [o.get("i") for o in others]
        want = sorted(i for i in range(4) if i != answers[qi])
        if idxs != want:
            errs += fail(f"{tag}: others の index が {idxs}（期待 {want}）")
        for o in others:
            if not (60 <= len(o.get("text", "")) <= 220):
                errs += fail(f"{tag}: others[{o.get('i')}] の長さ {len(o.get('text', ''))}字（60〜220想定）")

        if qi > 0 and not (q.get("lead") or "").strip():
            errs += fail(f"{tag}: lead（前提の変化）が空")
        if not (q.get("prompt") or "").strip():
            errs += fail(f"{tag}: prompt が空")

    blob = json.dumps(c, ensure_ascii=False)
    m = PLACEHOLDER.search(blob)
    if m:
        errs += fail(f"case{case_id:02d}: プレースホルダらしき文字列 {m.group(0)!r}")

    return errs


def main():
    cases = []
    errs = 0
    missing = []
    for cid in sorted(EXPECT):
        path = os.path.join(CASES_DIR, f"case{cid:02d}.json")
        if not os.path.exists(path):
            missing.append(cid)
            continue
        with open(path, encoding="utf-8") as f:
            raw = f.read().strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-z]*\n|\n```$", "", raw)
        try:
            c = json.loads(raw)
        except json.JSONDecodeError as e:
            errs += fail(f"case{cid:02d}: JSONが壊れている ({e})")
            continue
        errs += check(cid, c)
        c["aim"] = EXPECT[cid][5]
        cases.append(c)

    # --- 形だけで正解が割れないかの検査 ---
    KW = ["合意", "記録", "共有", "承認", "期限", "報告", "周知"]
    n_longest = n_tell = n_spread = n_neg = 0
    total_q = 0
    for c in cases:
        for qi, q in enumerate(c["questions"]):
            total_q += 1
            L = [len(t) for t in q["choices"]]
            a = q["answer"]
            tag = f"case{c['id']:02d} 設問{qi + 1}"
            if L[a] == max(L) and L.count(max(L)) == 1:
                n_longest += 1
                print(f"形状: {tag} 正解が単独最長（{L[a]}字 / 他 {sorted(x for i, x in enumerate(L) if i != a)}）")
            if max(L) - min(L) > 12:
                n_spread += 1
                print(f"形状: {tag} 4択の文字数差が {max(L) - min(L)}字（12字以内が目安）")
            tells = [k for k in KW if k in q["choices"][a] and sum(1 for t in q["choices"] if k in t) == 1]
            if tells:
                n_tell += 1
                print(f"形状: {tag} 正解だけが持つ手続き語 {tells}")
            neg = [i for i, t in enumerate(q["choices"]) if re.search(r"(ない|ず)。$", t)]
            if neg:
                n_neg += 1
                print(f"形状: {tag} 否定形で終わる選択肢 {[ 'アイウエ'[i] for i in neg ]}")
    print(f"形状チェック（全{total_q}問）: 正解が単独最長 {n_longest}問 / 手続き語の独占 {n_tell}問 / "
          f"文字数差12字超 {n_spread}問 / 否定形終止 {n_neg}問")

    if missing:
        print("未生成: " + ", ".join(f"case{c:02d}" for c in missing))
    letters = "アイウエ"
    dist = {ch: 0 for ch in letters}
    for c in cases:
        for q in c["questions"]:
            dist[letters[q["answer"]]] += 1
    print("正解記号の分布: " + " ".join(f"{k}={v}" for k, v in dist.items()))
    print(f"検証エラー: {errs} 件 / 読み込み {len(cases)} ケース")

    if errs or missing:
        print("→ HTMLは出力しない")
        return 1

    payload = json.dumps(cases, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("<", "\\u003c").replace(">", "\\u003e").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")

    with open(TEMPLATE, encoding="utf-8") as f:
        html = f.read()
    if "__CASES_JSON__" not in html:
        return fail("テンプレートに __CASES_JSON__ がない")
    html = html.replace("__CASES_JSON__", payload)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"出力: {OUT}  ({len(html):,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
