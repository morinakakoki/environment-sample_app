#!/usr/bin/env python3
"""1ケースのJSONを検査する。使い方: python3 check_case.py cases/case07.json"""
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
from build import EXPECT, PLACEHOLDER  # noqa: E402

KW = ["合意", "記録", "共有", "承認", "期限", "報告", "周知"]
LET = "アイウエ"


def main(path):
    ng = []
    try:
        with open(path, encoding="utf-8") as f:
            raw = f.read().strip()
        if raw.startswith("```"):
            ng.append("ファイル先頭にコードフェンス(```)がある。JSONだけを書くこと。")
            raw = re.sub(r"^```[a-z]*\n|\n```$", "", raw)
        c = json.loads(raw)
    except Exception as e:
        print(f"NG: JSONとして読めない -> {e}")
        print("違反 1 件")
        return 1

    cid = c.get("id")
    if cid not in EXPECT:
        print(f"NG: id が不正 -> {cid}")
        print("違反 1 件")
        return 1
    field, title, frame, principle, answers, _aim = EXPECT[cid]

    if c.get("field") != field:
        ng.append(f"field は {field!r} でなければならない（現在 {c.get('field')!r}）")
    if c.get("title") != title:
        ng.append(f"title は {title!r} から一字も変えてはいけない")
    if (c.get("frame") or {}).get("name") != frame:
        ng.append(f"frame.name は {frame!r} から一字も変えてはいけない")
    if c.get("principle") != principle:
        ng.append(f"principle は {principle!r} から一字も変えてはいけない")

    n = len(c.get("scenario", ""))
    if not (200 <= n <= 480):
        ng.append(f"scenario が {n}字（200〜480字にする）")
    n = len((c.get("frame") or {}).get("howto", ""))
    if not (90 <= n <= 300):
        ng.append(f"frame.howto が {n}字（90〜300字にする）")

    iv = c.get("interview") or []
    if len(iv) != 3:
        ng.append(f"interview が {len(iv)}行（ちょうど3行にする）")
    for k, line in enumerate(iv):
        if not (30 <= len(line) <= 110):
            ng.append(f"interview[{k}] が {len(line)}字（30〜110字にする）")

    qs = c.get("questions") or []
    if len(qs) != 3:
        ng.append(f"questions が {len(qs)}問（3問にする）")

    ranks = []
    for qi, q in enumerate(qs):
        t = f"設問{qi + 1}"
        ch = q.get("choices") or []
        if len(ch) != 4:
            ng.append(f"{t}: choices が {len(ch)}個（4個にする）")
            continue
        a = q.get("answer")
        if a != answers[qi]:
            ng.append(f"{t}: answer が {a}（{answers[qi]}＝{LET[answers[qi]]}の位置に正解を置く）")
            continue

        L = [len(x) for x in ch]
        for ci, x in enumerate(ch):
            if not (40 <= len(x) <= 150):
                ng.append(f"{t}: 選択肢{LET[ci]} が {len(x)}字（40〜150字にする）")
            if not x.rstrip().endswith("。"):
                ng.append(f"{t}: 選択肢{LET[ci]} が句点で終わっていない")
            if re.search(r"(ない|ず)。$", x):
                ng.append(f"{t}: 選択肢{LET[ci]} が否定形で終わっている『…{x[-14:]}』→ 肯定形の行動として書き直す")
        if len(set(ch)) != 4:
            ng.append(f"{t}: 選択肢に重複がある")

        if L[a] == max(L) and L.count(max(L)) == 1:
            ng.append(f"{t}: 正解{LET[a]}が単独最長（{L[a]}字 / 他 {sorted(x for i, x in enumerate(L) if i != a)}）"
                      f" → 不正解に具体を足すか正解を削って、正解を最長でなくする")
        if max(L) - min(L) > 12:
            ng.append(f"{t}: 4択の文字数差が {max(L) - min(L)}字（{L} ／ 12字以内にする）")
        ranks.append(sorted(L, reverse=True).index(L[a]) + 1)

        tells = [k for k in KW if k in ch[a] and sum(1 for x in ch if k in x) == 1]
        if tells:
            ng.append(f"{t}: 手続き語 {tells} が正解{LET[a]}にしかない"
                      f" → 不正解のどれかにも同じ語を入れ、宛先違い・粒度不足・根拠なしの形で劣位にする")

        n = len(q.get("explain", ""))
        if not (150 <= n <= 420):
            ng.append(f"{t}: explain が {n}字（150〜420字にする）")
        idxs = [o.get("i") for o in (q.get("others") or [])]
        want = sorted(i for i in range(4) if i != answers[qi])
        if idxs != want:
            ng.append(f"{t}: others の index が {idxs}（{want} を昇順で全て入れる）")
        for o in (q.get("others") or []):
            n = len(o.get("text", ""))
            if not (60 <= n <= 220):
                ng.append(f"{t}: others[{o.get('i')}] が {n}字（60〜220字にする）")
        if qi > 0 and not (q.get("lead") or "").strip():
            ng.append(f"{t}: lead（前提の変化）が空")
        if not (q.get("prompt") or "").strip():
            ng.append(f"{t}: prompt が空")

    if len(ranks) == 3 and len(set(ranks)) == 1:
        ng.append(f"3問とも正解の長さ順位が同じ（すべて{ranks[0]}位）→ 問ごとに順位をばらけさせる")

    m = PLACEHOLDER.search(json.dumps(c, ensure_ascii=False))
    if m:
        ng.append(f"プレースホルダらしき文字列 {m.group(0)!r} が残っている")

    for x in ng:
        print("NG: " + x)
    print(f"違反 {len(ng)} 件")
    return 1 if ng else 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python3 check_case.py cases/caseNN.json")
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
