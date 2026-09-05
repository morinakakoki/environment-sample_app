#!/usr/bin/env python3
"""
復習クイズのアーティファクト HTML に、段階(level)・前提(premise)・新規 L1 問題を流し込む。

使い方:
  python3 apply_data.py <入力 quiz.html> <出力 quiz.html>

やること:
  1. <script type="application/json" id="quizData">…</script> を取り出す
  2. patch_existing.json の {id, level, premise} を同じ id の問題に付ける
  3. new_questions.json を末尾に足す（id が既存とかぶれば止める）
  4. JSON を書き戻す（"<" は \\u003c に逃がす。buildDocument と同じ流儀）
  5. 検算して件数を表示する
"""
import json, re, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
if len(sys.argv) != 3:
    sys.exit(__doc__)
src, dst = sys.argv[1], sys.argv[2]

html = open(src, encoding='utf-8').read()
m = re.search(r'(<script type="application/json" id="quizData">)(.*?)(</script>)', html, re.S)
if not m:
    sys.exit('quizData が見つかりません')
qs = json.loads(m.group(2))
assert isinstance(qs, list), 'quizData は配列のはず'

patch = {p['id']: p for p in json.load(open(os.path.join(HERE, 'patch_existing.json'), encoding='utf-8'))}
new   = json.load(open(os.path.join(HERE, 'new_questions.json'), encoding='utf-8'))

existing_ids = {q['id'] for q in qs}
missing = set(patch) - existing_ids
if missing:
    sys.exit('patch 側にあって HTML に無い id: %s' % sorted(missing))
dup = [q['id'] for q in new if q['id'] in existing_ids]
if dup:
    sys.exit('新規問題の id が既存とかぶっています: %s' % dup)

for q in qs:
    p = patch.get(q['id'])
    if p:
        q['level']   = p['level']
        q['premise'] = p['premise']
    else:
        q.setdefault('level', 2)
qs.extend(new)

# 検算
for q in qs:
    assert q['level'] in (1, 2, 3), q['id']
    assert len(q['options']) == 4 and 0 <= q['answer'] < 4, q['id']
    assert all(o.strip() for o in q['options']), q['id']
    assert len(q.get('premise', '')) <= 140, (q['id'], len(q['premise']))
ids = [q['id'] for q in qs]
assert len(ids) == len(set(ids)), 'id 重複'

out_json = json.dumps(qs, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
html2 = html[:m.start(2)] + out_json + html[m.end(2):]
open(dst, 'w', encoding='utf-8').write(html2)

by_level = {1: 0, 2: 0, 3: 0}
for q in qs:
    by_level[q['level']] += 1
print('問題数 %d = 段階1 %d + 段階2 %d + 段階3 %d' % (len(qs), by_level[1], by_level[2], by_level[3]))
print('premise あり %d / %d' % (sum(1 for q in qs if q.get('premise')), len(qs)))
