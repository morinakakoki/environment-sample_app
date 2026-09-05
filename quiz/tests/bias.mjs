/* 「中身を知らなくても当てられる」抜け道が無いかを見る。

   位置バイアス（正解が2番目に偏る）は出題時シャッフルで潰したが、
   長さバイアス——正解だけが長い説明文で、誤答が短い言い切り——は
   シャッフルでは消えない。実測で「一番長いのを選ぶ」だけで83%当たっていた。

   問題を足すたびに再発するので、ここで固定する。 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __d = path.dirname(fileURLToPath(import.meta.url));
const QUIZ = path.join(__d, '..');

const P = path.join(QUIZ,'quiz-data.json');
const d = JSON.parse(fs.readFileSync(P, 'utf8'));

const f = [];
const ok = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) f.push(m); };

const len = q => q.options.map(o => o.length);
const gapOf = q => { const L = len(q); return L[q.answer] - Math.max(...L.filter((_, i) => i !== q.answer)); };

console.log('\n【長さバイアス】正解だけが長くて答えが透けていないか');
{
  // 目で見て分かる差。8字は日本語で1フレーズぶん。
  const visible = d.filter(q => gapOf(q) >= 8);
  ok(visible.length === 0,
     `正解が最長誤答より8字以上長い問題は無い: ${visible.length}問` +
     (visible.length ? ' → ' + visible.map(q => 'id' + q.id + '(+' + gapOf(q) + ')').join(' ') : ''));

  let ca = 0, cn = 0, wa = 0, wn = 0;
  d.forEach(q => q.options.forEach((o, i) => { if (i === q.answer) { ca += o.length; cn++; } else { wa += o.length; wn++; } }));
  const mean = (ca / cn) - (wa / wn);
  ok(mean <= 10, `正解と誤答の平均文字数の差が10字以下: ${mean.toFixed(1)}字`);

  // 「一番長いのを選ぶ」だけの正答率。単独最長の問題数で数える。
  const win = d.filter(q => gapOf(q) > 0).length;
  const rate = Math.round(win / d.length * 100);
  console.log(`     参考: 「最長を選ぶ」で単独正解 ${win}/${d.length} (${rate}%) ／ 差はすべて 8字未満`);

  // 逆パターン（正解だけ極端に短い）も答えが透ける
  const tooShort = d.filter(q => -gapOf(q) >= 12 && Math.min(...len(q)) === len(q)[q.answer]);
  ok(tooShort.length === 0, `正解だけが極端に短い問題は無い: ${tooShort.length}問`);
}

console.log('\n【選択肢の作り】答えが透ける書き方をしていないか');
{
  const dup = d.filter(q => new Set(q.options).size !== 4);
  ok(dup.length === 0, `選択肢が重複している問題は無い: ${dup.length}問`);

  const banned = d.filter(q => q.options.some(o => /すべて正しい|全て正しい|いずれでもない|上記のすべて|該当なし/.test(o)));
  ok(banned.length === 0, `「すべて正しい」「いずれでもない」型の選択肢は無い: ${banned.length}問`);

  const blank = d.filter(q => q.options.length !== 4 || q.options.some(o => typeof o !== 'string' || !o.trim()));
  ok(blank.length === 0, `空の選択肢は無い: ${blank.length}問`);
}

console.log('\n【前提】問題文の上に置く前提が、答えを先に言っていないか');
{
  // 前提は答える前に読む欄なので、ここに正解が入っていると当てものになる。
  // 空白を落として比べる（「課金 バイト」のような表記ゆれで抜けないように）。
  const flat = s => String(s || '').replace(/\s+/g, '');
  const leak = d.filter(q => q.premise && flat(q.premise).includes(flat(q.options[q.answer])));
  ok(leak.length === 0, `前提に正解の選択肢がそのまま入っていない: ${leak.length}問`
     + (leak.length ? ' → ' + leak.map(q => 'id' + q.id).join(' ') : ''));

  // 誤答が丸ごと入っているのも、消去法の材料を配ることになる。
  const hint = d.filter(q => q.premise &&
    q.options.some((o, i) => i !== q.answer && flat(q.premise).includes(flat(o))));
  ok(hint.length === 0, `前提に誤答の選択肢がそのまま入っていない: ${hint.length}問`
     + (hint.length ? ' → ' + hint.map(q => 'id' + q.id).join(' ') : ''));

  const long = d.filter(q => (q.premise || '').length > 140);
  ok(long.length === 0, `前提は140字以内: 超過 ${long.length}問`);
}

console.log('\n【解説】出題時にシャッフルされても壊れない書き方か');
{
  // 位置での参照は、選択肢が並び替わると意味が変わってしまう
  const re = /選択肢\s*[0-9１-４A-Da-d]|[0-9１-４]番目の選択肢|上から[0-9１-４]|下から[0-9１-４]|^[A-D]は|[（(][A-D][）)]/;
  const bad = d.filter(q => re.test(q.explanation));
  ok(bad.length === 0,
     `解説に選択肢の位置参照が無い: ${bad.length}問` +
     (bad.length ? ' → ' + bad.map(q => 'id' + q.id).join(' ') : ''));
}

console.log('\n【データ】採番と必須項目');
{
  const ids = d.map(q => q.id);
  ok(new Set(ids).size === ids.length, `id が重複していない: ${ids.length}件`);

  const keys = ['id', 'chapter', 'tag', 'q', 'options', 'answer', 'explanation', 'addedAt', 'source', 'method'];
  const missing = d.filter(q => keys.some(k => q[k] === undefined || q[k] === null || q[k] === ''));
  ok(missing.length === 0, `必須項目がそろっている: 欠け ${missing.length}問`);

  const range = d.filter(q => !(Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3)
                           || !(Number.isInteger(q.chapter) && q.chapter >= 1 && q.chapter <= 7));
  ok(range.length === 0, `answer が0-3・chapter が1-7の範囲内: 範囲外 ${range.length}問`);

  const src = d.filter(q => !/^https?:\/\//.test(q.source));
  ok(src.length === 0, `出典がすべて http(s) の URL: 例外 ${src.length}問`);

  const date = d.filter(q => !/^\d{4}-\d{2}-\d{2}$/.test(q.addedAt));
  ok(date.length === 0, `addedAt が YYYY-MM-DD 形式: 例外 ${date.length}問`);
}

console.log('\n【埋め込みエスケープ】危険な文字列を含む問題でもアーティファクトが壊れないか');
{
  // "<!--" のあとに "<script" があると、HTML のトークナイザは
  // script data double escaped state に入り "</script>" が要素を閉じない。
  // build-artifact.mjs / buildDocument が "</" しか潰していないと白画面になる。
  const evil = ['</script><h1>x</h1>', '<!--<script>', '<!-- ここから', '<script src=x>', '-->', '  '];
  const sample = evil.map((s, i) => ({
    id: 900 + i, chapter: 1, tag: '#1', method: '構成・前提',
    q: 'あぶない文字を含む問題 ' + s, options: ['あ' + i, 'い', 'う', 'え'],
    answer: 0, explanation: '解説にも入れる ' + s,
    source: 'https://example.com/', addedAt: '2026-09-01',
  }));
  const json = JSON.stringify(sample).replace(/</g, '\\u003c');
  ok(!json.includes('</' + 'script'), '埋め込みJSONに </script が残らない');
  ok(!json.includes('<' + 'script'), '埋め込みJSONに <script が残らない');
  ok(!json.includes('<!--'), '埋め込みJSONに <!-- が残らない');
  ok(JSON.stringify(JSON.parse(json)) === JSON.stringify(sample), 'エスケープしても JSON.parse で元に戻る');

  // 実装が同じ方式を使っているか（片方だけ直っている状態を防ぐ）
  const build = fs.readFileSync(path.join(QUIZ, 'build-artifact.mjs'), 'utf8');
  const app = fs.readFileSync(path.join(QUIZ, 'index.html'), 'utf8');
  const art = fs.readFileSync(path.join(QUIZ, 'artifact.html'), 'utf8');
  ok(/replace\(\/<\/g, *'\\\\u003c'\)/.test(build), 'build-artifact.mjs が < を全部エスケープしている');
  ok(/replace\(\/<\/g, *'\\\\u003c'\)/.test(app), 'index.html の buildDocument も同じ方式');
  ok(/replace\(\/<\/g, *'\\\\u003c'\)/.test(art), 'artifact.html にも直った版が焼かれている');
}

console.log('\n' + (f.length ? `FAILURES (${f.length}):\n - ` + f.join('\n - ') : 'ALL PASS'));
process.exit(f.length ? 1 : 0);
