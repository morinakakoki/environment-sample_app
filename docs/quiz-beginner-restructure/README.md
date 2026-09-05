# データ基盤 復習クイズ：初心者向け構成見直し 実装仕様

作成 2026-09-05。対象は公開済みアーティファクト2つ。実装者はこの文書と同じフォルダのファイルだけで作業が終わる想定。

| 対象 | URL | 変更 |
|---|---|---|
| 復習クイズ | https://claude.ai/code/artifact/961a5f90-b530-4a93-8925-de6cdb85e282 | コード（§3〜§5）＋データ（§6） |
| 基礎知識ノート | https://claude.ai/code/artifact/39af473a-7ab5-4f68-9d60-561aa254e638 | 用語カード追加（§7） |

このフォルダのファイル

| ファイル | 用途 |
|---|---|
| `patch_existing.json` | 既存48問に付ける `level` と `premise` |
| `new_questions.json` | 新規の段階1（用語）問題 23問。id 49〜71 |
| `apply_data.py` | 上2つをクイズ HTML の `quizData` に流し込むスクリプト（検証済み） |
| `glossary_cards.html` | ノートに差し込む用語カードの HTML / CSS / script |
| `smoke_test.mjs` | 発行前の動作確認（Playwright） |

---

## 1. 前提（3点）

1. 学習者の床は「SQL・Docker・cron・AWS の IAM の概念は知っている。DWH と GCP は初めて」。床より上の語はクイズ側で定義する。
2. 問題に **段階** を付ける。1＝用語（何か）、2＝仕組み（どう動く）、3＝判断（なぜ選んだ）。
3. 出題は章ごとの梯子。同じ章の段階 N が全部一度正解になるまで、段階 N+1 の未挑戦問題は出さない。

## 2. 変更しないもの

- 学習記録（localStorage の stats / explain / notes）の形式。既存の成績はそのまま使う。
- 間違いのみ・そろそろ復習・最近追加 の各モードの並び（未挑戦を含まない、または今日足した分を解く目的なので梯子を掛けない）。
- `FRESH_MAX = 4`。未挑戦の1日上限は変えない（変えるなら別件）。
- Notion 同期のログ形式。

---

## 3. データ仕様（クイズ）

問題オブジェクトに2つ追加する。

| キー | 型 | 既定 | 用途 |
|---|---|---|---|
| `level` | 1 / 2 / 3 | 2 | 段階。範囲外・未指定は 2 |
| `premise` | string | "" | 問題文の上に出す前提。140字以内。無ければ欄ごと出さない |

### 3.1 `parseData`（読み込み時の正規化）

`addedAt` の行の後ろに追加。

```js
      /* 段階。1=用語 2=仕組み 3=判断。範囲外は 2（仕組み）に倒す。 */
      level     : (function(){ var n = parseInt(r.level, 10); return (n >= 1 && n <= 3) ? n : 2; })(),
      /* 問題文の上に出す前提。用語の定義を1〜2文。 */
      premise   : (typeof r.premise === 'string') ? r.premise.trim() : ''
```

### 3.2 `withShuffledOptions`

返すオブジェクトに `level:q.level, premise:q.premise` を足す。ここを忘れると出題画面で両方消える。

### 3.3 `rowToQuestion`（Notion 経路）

`NOTION.cols` に `level:'段階', premise:'前提'` を足し、返すオブジェクトに 3.1 と同じ正規化で `level` / `premise` を足す（`r` の代わりに `row[c.level]` / `row[c.premise]`）。Notion 側に列が無ければ undefined → 既定値になるので、列の追加は任意。

### 3.4 `addCheck` の `KEEP`

```js
var KEEP = ['id','chapter','tag','method','section','q','options','answer','explanation','source','addedAt','level','premise'];
```

### 3.5 中断の再開

`saveResume` は問題オブジェクトを丸ごと保存しているので追加作業なし。ただし旧版で保存された中断には `level` が無いので、描画側は `q.level || 2` で読む（§5.1）。

---

## 4. 出題ロジック仕様

### 4.1 追加する関数（`isDue` の直後に置く）

```js
/* 段階の名前。チップと結果画面で使う。 */
var LEVEL_NAMES = { 1:'用語', 2:'仕組み', 3:'判断' };

/* 一度でも正解したことがあるか。梯子の「済み」の判定はこれ（直近の正誤ではない）。 */
function everCorrect(id){
  var s = statOf(id);
  return !!(s && (s.correct | 0) > 0);
}

/* 章ごとに「どの段階まで済んだか」を返す（0〜3）。
   段階 N の問題が全部 everCorrect なら N まで済み。
   その段階に問題が1つも無い章は、その段階は済んだものとみなす（空なら真）。
   こうしておくと、段階1が無い第7章はいきなり段階3が出るし、
   段階2が無い章でも段階3が永久に出ない事故が起きない。
   出題から外した問題（hidden）は数えない。 */
function clearedLevel(chapter){
  var qs = activeQ().filter(function(q){ return q.chapter === chapter; });
  var n = 0;
  for(var lv = 1; lv <= 3; lv++){
    var same = qs.filter(function(q){ return (q.level || 2) === lv; });
    if(same.some(function(q){ return !everCorrect(q.id); })) break;
    n = lv;
  }
  return n;
}
```

### 4.2 `prioritize` の変更

未挑戦（`fresh`）だけに梯子を掛ける。間違い・復習・済みは触らない。

```js
function prioritize(list){
  var wrong = [], due = [], fresh = [], done = [];
  var now = Date.now();
  var cl = bare();   // 章 -> clearedLevel。1セッションの組み立てで章ごとに1回だけ計算する
  list.forEach(function(q){
    var st = statusOf(q.id);
    if(st === 'wrong') wrong.push(q);
    else if(st === 'new'){
      /* 章の梯子。済んだ段階の1つ上までを出す。それより先は今日は出さない。 */
      if(cl[q.chapter] === undefined) cl[q.chapter] = clearedLevel(q.chapter);
      if((q.level || 2) <= cl[q.chapter] + 1) fresh.push(q);
    }
    else if(isDue(q.id, now)) due.push(q);
    else done.push(q);
  });
  /* 以下は既存のまま（due / done の並べ替えと return） */
```

既存のコメント（60日シミュレーションの説明）は残す。その下に1段落足す：

```
   段階の梯子（2026-09-05）。未挑戦は「章順 → 段階順」で出し、同じ章の下の段階が
   全部一度正解になるまで上の段階は出さない。用語を知らないまま仕組みを聞かれる
   問題を無くすため。間違い・復習には掛けない（既に一度見ている）。
```

### 4.3 `byChapterThenShuffle` の変更

章の中を段階順にする。同じ章・同じ段階の中だけシャッフル。

```js
function byChapterThenShuffle(list){
  var byKey = bare(), keys = [], out = [];
  list.forEach(function(q){
    var c = q.chapter || 0, l = q.level || 2, k = c + ':' + l;
    if(!byKey[k]){ byKey[k] = []; keys.push({ c:c, l:l, k:k }); }
    byKey[k].push(q);
  });
  /* 章未設定（0）は最後。同じ章では段階の低い順。 */
  keys.sort(function(a, b){ return ((a.c || 1e9) - (b.c || 1e9)) || (a.l - b.l); });
  keys.forEach(function(x){ out = out.concat(shuffle(byKey[x.k])); });
  return out;
}
```

### 4.4 動作の帰結（実装者が確認する事実）

- 履歴の無いブラウザで「全範囲 10問」を押すと、1問目は第1章の段階1になる。
- 第2章の段階2（例：id 10 の maximum_bytes_billed 判定タイミング）は、第2章の段階1（id 7, 8, 53〜60 の10問）が全部一度正解になるまで未挑戦として出ない。
- 既に解いたことのある問題は `statusOf` が `new` でないので、梯子の影響を受けない。
- 「章別に解く」も `prioritize` を通るので同じ梯子が掛かる。1セッション内では組み立て時の判定で固定され、段階1を正解しても同じセッションで段階2は出ない（次のセッションから出る）。この挙動は仕様。

---

## 5. 画面仕様（クイズ）

### 5.1 出題画面

`#bodyTpl` 内、`<div class="chips">` と `<h1 class="qtext" id="qText">` を次のように変える。

```html
      <div class="chips">
        <span class="chip" id="qChapter"></span>
        <span class="chip tag" id="qTag"></span>
        <span class="chip method" id="qMethod"></span>
        <span class="chip tag" id="qLevel"></span>
        <span class="chip" id="qWhy"></span>
      </div>
      <div class="premise hidden" id="qPremise"><span class="plbl">前提</span><span id="qPremiseTxt"></span></div>
      <h1 class="qtext" id="qText"></h1>
```

CSS（`#appStyle` の「クイズ画面」ブロックの `.qtext` の前に追加）

```css
/* 前提。問題文で使う用語の定義を、答える前に読める位置に置く。
   解説側に置く案は「読むのが答えを見た後」になり、用語を知らないまま選ぶことになる。 */
.premise{margin:0 0 12px;padding:10px 12px;border-radius:var(--r-sm);
  background:var(--card-2);border:1px dashed var(--line-strong);
  font-size:13.5px;line-height:1.7;color:var(--fg-soft)}
.premise .plbl{display:inline-block;font-size:10.5px;font-weight:800;letter-spacing:.06em;
  color:var(--muted);border:1px solid var(--line-strong);border-radius:99px;
  padding:0 7px;margin-right:6px;vertical-align:1px}
```

`renderQuestion()`：`$('qText').textContent = q.q;` の直前に追加。説明モードでも出す（前提は答えではない）。

```js
  var lv = q.level || 2;
  $('qLevel').textContent = '段階' + lv + ' ' + (LEVEL_NAMES[lv] || '');
  var pBox = $('qPremise');
  if(q.premise){ $('qPremiseTxt').textContent = q.premise; show(pBox); } else { hide(pBox); }
```

### 5.2 解説の「戻る先」を基礎知識ノートへのリンクにする

`DOC_URL` の近くに追加：

```js
/* 基礎知識ノート。章チップの飛び先。#cN でその章の <details> を開く（ノート側に script あり）。 */
var NOTE_URL = 'https://claude.ai/code/artifact/39af473a-7ab5-4f68-9d60-561aa254e638';
function noteChip(n){
  if(!n) return el('span', 'chip', chapterFull(n));
  var a = document.createElement('a');
  a.className = 'chip chip-link';
  a.href = NOTE_URL + '#c' + n;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = chapterFull(n);
  return a;
}
```

`reveal()` と `answer()` の両方にある次の行を置き換える（2か所）。

```js
  back.appendChild(el('span', 'chip', chapterFull(q.chapter)));
  ↓
  back.appendChild(noteChip(q.chapter));
```

`renderPrep()`（面接前チェックリスト）の `chips.appendChild(el('span', 'chip', chapterFull(q.chapter)));` も同様に置き換える。

### 5.3 ホームの文言

`#modeAll` の `.sub` を置き換える。

```
未挑戦（章順・用語→仕組み→判断）→ 間違い → そろそろ忘れる頃 → 済み。復習が溜まった日は未挑戦4問まで
```

### 5.4 「取り込みのルール」に2行追加

```html
        <li><code>level</code> は段階（1=用語 / 2=仕組み / 3=判断）。<b>省くと 2 になります</b>。用語を聞く問題は必ず 1 にしてください。同じ章の 1 が全部正解になるまで 2 は出ません</li>
        <li><code>premise</code> は問題文の上に出す前提（140字以内）。問題文に出てくる用語のうち、基礎知識ノートの床より上の語を1〜2文で定義します。答えそのものは書きません</li>
```

---

## 6. データ投入（クイズ）

1. アーティファクトを読む：`Artifact read url=…961a5f90…` → 保存先のフルパスが返る。
2. `python3 apply_data.py <保存先> quiz_next.html` を実行。次の出力になること。
   ```
   問題数 71 = 段階1 33 + 段階2 25 + 段階3 13
   premise あり 48 / 71
   ```
3. `quiz_next.html` に §3〜§5 のコード変更を入れる（順番は逆でもよい。データ投入は `quizData` の中身しか触らない）。

既存48問の段階の内訳（`patch_existing.json` と一致することを確認）

| 段階 | id |
|---|---|
| 1（10問） | 1, 2, 3, 7, 8, 17, 25, 26, 28, 34 |
| 2（25問） | 4, 6, 9, 10, 11, 12, 13, 15, 16, 18, 19, 20, 21, 22, 24, 30, 31, 33, 36, 39, 40, 41, 45, 46, 47 |
| 3（13問） | 5, 14, 23, 27, 29, 32, 35, 37, 38, 42, 43, 44, 48 |

検算：10 + 25 + 13 = 48。新規23問は全部段階1 → 33 + 25 + 13 = 71。

新規23問の章別：第1章 4（49〜52）、第2章 8（53〜60）、第3章 4（61〜64）、第4章 3（65〜67）、第5章 3（68〜70）、第6章 1（71）、第7章 0。4+8+4+3+3+1 = 23。

### 6.1 出典 URL について

新規問題の `source` は公式ドキュメントの URL だが、**作成環境からは docs.cloud.google.com / developer.hashicorp.com / docs.getdbt.com へのアクセスが遮断されていて内容を確認できていない**（cloud.google.com → docs.cloud.google.com への 301 までは確認）。発行前に実装者が各 URL をブラウザで開き、404 のものは同じサイトの該当ページに差し替える。差し替え候補は既存問題で使っている URL（`quizData` の `source`）。

---

## 7. 基礎知識ノートの変更

`glossary_cards.html` の中身を、次の位置に差し込む。

| 差し込むもの | 位置 |
|---|---|
| `<style>` の中身 | 既存 `<style>` の末尾 |
| lead の1文 | `<div class="lead"><p>…AWS を知っている前提で、違うところに絞って書く。…</p></div>` の「AWS を知っている前提で、違うところに絞って書く。」を置き換え |
| 第N章の `<div class="terms">` | `<details id="cN">` の `</summary>` の直後 |
| `<script>` | `</main>` の直後 |

第7章はカード無し（表だけの章）。第2章本文の最初の段落に、1文足す（課金の仕組みが1行も無いため）：

```
クエリは対象の列を丸ごと読む（一般的な DB のインデックスは使わない）。読んだ量がそのまま計算量なので、そこに課金する。
```

差し込み位置：「課金は「読んだバイト数」で決まる（オンデマンド）。」の直後。

---

## 8. 手順と検証

1. §6-1 で HTML を取得。`cp` で作業用に複製。
2. §6-2 データ投入 → §3〜§5 コード変更。
3. 構文確認：
   ```
   node -e "const h=require('fs').readFileSync('quiz_next.html','utf8');const m=h.match(/<script id=\"appScript\">([\s\S]*?)<\/script>/);new Function(m[1]);console.log('js ok')"
   ```
4. 動作確認：`node smoke_test.mjs quiz_next.html`。exit 0 と、出力の `level` が「段階1 用語」、`noteHref` が `…39af473a…#c1` であること。Playwright が無ければ `npm i playwright` （ブラウザは `/opt/pw-browsers/chromium` を `CHROMIUM_PATH` で指定）。
5. 発行：`Artifact publish file_path=quiz_next.html url=https://claude.ai/code/artifact/961a5f90-b530-4a93-8925-de6cdb85e282 label="段階と前提"`。favicon は渡さない。
6. ノート：`Artifact read url=…39af473a…` → §7 を差し込み → 同じ url に publish。
7. 発行後、スマホで「全範囲 10問」を開いて、1問目に「段階1 用語」チップと（前提がある問題なら）前提欄が出ること、解説の章チップを押すとノートの該当章が開いた状態で表示されることを見る。

### 8.1 発行前チェック

- [ ] `stTotal` が 71
- [ ] 履歴の無い状態で1問目が段階1
- [ ] 前提欄が問題文の上、チップの下に出る。前提が無い問題では欄ごと消える
- [ ] 説明モードでも前提欄が出る（選択肢は隠れたまま）
- [ ] 解説の章チップがノートの `#cN` に飛び、その章が開く
- [ ] 「問題を追加」で `level` / `premise` 付きの JSON を貼ると、追記後 JSON にその2キーが残る
- [ ] 旧版で保存された中断（`level` 無し）を再開してもエラーにならない（`q.level || 2`）
- [ ] 出典 URL 23件を開いて 404 が無い（§6.1）

---

## 9. やらないと決めたこと（次回以降）

- 結果画面・面接前チェックリストへの前提の表示。出題画面で読んでいるので重複。
- 第7章への段階1追加。第7章は「当てはめ」の章で、用語は1〜6章側にある。
- `FRESH_MAX` の調整。段階1が33問あるので初週は用語ばかりになるが、一度正解すれば「忘れる頃」まで出ないので初週だけの負担。
