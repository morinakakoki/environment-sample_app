/* index.html + quiz-data.json から、アーティファクト用の1ファイルを作る。
 *
 *   node build-artifact.mjs   → artifact.html
 *
 * アーティファクトは隣のファイルを fetch できないので、問題データを埋め込む。
 * さらに「アプリ自身が新しい版を保存する」ため、次の形にしておく:
 *
 *   <style id="appStyle">      … CSS
 *   <script id="quizData">     … 問題データ（保存のたびに差し替わる部分）
 *   <script id="bodyTpl">      … 本文の元マークアップ（操作しても変化しない）
 *   <div id="root">            … ここに bodyTpl を描く
 *   <script id="appScript">    … アプリ本体
 *
 * 保存時は「画面の今の状態」ではなく bodyTpl から作り直すので、
 * 解答途中の表示などが保存される版に混ざらない。
 *
 * <!doctype>/<html>/<head>/<body> は公開時に付くので、ここでは中身だけ出す。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// URL.pathname はパーセントエンコードのままなので、空白や日本語を含むパスで落ちる
const dir  = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(dir, 'quiz-data.json'), 'utf8'));

// quiz-data.json は配列でも {chapters, questions} でもよい（アプリと同じ扱い）
const questions = Array.isArray(data) ? data : data.questions;
if (!Array.isArray(questions)) {
  throw new Error('quiz-data.json は配列、または {"chapters":{...},"questions":[...]} である必要があります');
}
if (questions.length === 0) throw new Error('問題が1問もありません');

const pick = (re, label) => {
  const m = html.match(re);
  if (!m) throw new Error(`index.html から ${label} を取り出せませんでした`);
  return m;
};

const title = pick(/<title>([\s\S]*?)<\/title>/, '<title>')[1];
const style = pick(/<style>([\s\S]*?)<\/style>/, '<style>')[1];

// <body> の中身を「マークアップ」と「アプリ本体のスクリプト」に分ける
const bodyRaw = html.slice(html.indexOf('<body>') + '<body>'.length, html.lastIndexOf('</body>'));
const scriptAt = bodyRaw.indexOf('<script>');
if (scriptAt < 0) throw new Error('<body> 内に <script> が見つかりません');
const markup = bodyRaw.slice(0, scriptAt).trim();
let script = bodyRaw.slice(scriptAt + '<script>'.length, bodyRaw.lastIndexOf('</' + 'script>'));

/* 版の目印をビルド時刻に差し替える。アーティファクトは端末にキャッシュされるので、
   「再発行したのに直っていない」が起きたときに、画面を見れば古い版かどうか分かる。
   アプリが自分を再発行するときは生きている #appScript を写すので、この値は残る。 */
const STAMP = /var APP_BUILD  = 'dev';/;
if (!STAMP.test(script)) throw new Error(
  "アプリ本体に APP_BUILD の目印が見つかりません（index.html の var APP_BUILD = 'dev'; を消さないでください）");
const buildId = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
script = script.replace(STAMP, `var APP_BUILD  = '${buildId}';`);

/* 方式設計書の置き場を、アーティファクト版だけ絶対 URL に差し替える。
   index.html は隣の design-doc.html を指している（Pages・ローカルはそれで届くし、
   同じオリジンなので #s4 がそのまま効く）。アーティファクトは単独のページで隣を
   読めないため、そのままだと節のチップが 404 へのリンクになる。 */
const DOC_ARTIFACT = 'https://claude.ai/code/artifact/68d8ce3d-c753-4c35-9e96-73d1f6553fff';
const DOC_MARK = /var DOC_URL = 'design-doc\.html';/;
if (!DOC_MARK.test(script)) throw new Error(
  "アプリ本体に DOC_URL の目印が見つかりません（index.html の var DOC_URL = 'design-doc.html'; を消さないでください）");
script = script.replace(DOC_MARK, `var DOC_URL = '${DOC_ARTIFACT}';`);

/* 器の前提: 運ばれるのは <style> 1つと本文マークアップ1つだけ。
   2つ目の <style> を head に足すと、それは style にも markup にも入らず、
   artifact.html のどこにも現れない。画面は出るのでアーティファクトだけ
   CSS が欠けた状態で静かに出荷される。ここで落として気づけるようにする。
   数えるのは「運ぶ範囲」（head + 本文マークアップ）だけ。アプリ本体の中には
   自己再発行のために '<style id="appStyle">' という文字列があり、それは器ではない。 */
const shellSrc = html.slice(0, html.indexOf('<body>')) + markup;
for (const [tag, label] of [['<style', '<style>'], ['<script', '<body> 内の <script>']]) {
  const n = shellSrc.split(tag).length - 1;
  if (n !== (tag === '<style' ? 1 : 0)) throw new Error(
    `index.html の ${label} の数が想定と違います（${n}個）。` +
    'CSS は既存の <style id="appStyle"> になる1つへ、JS は既存の1つの <script> へ追記してください。');
}

// 埋め込む部品はすべて検査する。title と style も対象。
// title は RCDATA なので、ここを素通りさせると、アプリが自分を再発行したときに
// 実体参照が解けて生タグに化け、公開版で本物の script として動いてしまう。
for (const [name, text] of [['タイトル', title], ['スタイル', style],
                            ['本文マークアップ', markup], ['アプリ本体', script]]) {
  if (/<\/script/i.test(text)) throw new Error(`${name} に </script が含まれています（分割して書いてください）`);
  // "<!--" のあとに "<script" が来ると double escaped state に入り、閉じタグが効かなくなる
  const c = text.indexOf('<!--');
  if (c >= 0 && /<script/i.test(text.slice(c)) && !/-->/.test(text.slice(c, text.search(/<script/i))))
    throw new Error(`${name} に「閉じていない <!-- のあとの <script」があります`);
}
if (/[<>&]/.test(title)) throw new Error(`タイトルに < > & は使えません: ${title}`);

const C  = '</' + 'script>';
const SO = '<' + 'script';
/* "<" を全部 < に逃がす。"</script" だけを潰すのでは足りない:
   HTML のトークナイザは script の中身を状態機械で読むので、"<!--" のあとに "<script"
   が現れると double escaped state に入り、そこでは "</script>" が要素を閉じない。
   結果、後ろの bodyTpl まで飲み込まれてアーティファクトが白画面になる。
   < は JSON の正当なエスケープなので JSON.parse はそのまま通る。 */
const json = JSON.stringify(data).replace(/</g, '\\u003c');

const out = [
  `<title id="appTitle">${title}</title>`,
  `<style id="appStyle">${style}</style>`,
  `${SO} type="application/json" id="quizData">${json}${C}`,
  `${SO} type="text/plain" id="bodyTpl">${markup}${C}`,
  `<div id="root"></div>`,
  `${SO} id="appScript">${script}${C}`,
  '',
].join('\n');

// --- 検査は書き出しの前に。壊れた artifact.html を残さないため ---
// 器のタグの検査はマークアップ部分だけに掛ける。
// アプリ本体には、保存する版を組み立てるための '<!doctype html>' 等が
// 文字列として正しく含まれているため。
const stray = markup.match(/<!DOCTYPE|<\/?(html|head|body)[\s>]/i);
if (stray) throw new Error(`本文マークアップに器のタグが混入しています: ${stray[0]}`);
for (const id of ['appTitle', 'appStyle', 'quizData', 'bodyTpl', 'appScript', 'root']) {
  if (!out.includes(`id="${id}"`)) throw new Error(`id="${id}" が出力にありません`);
}
if (!out.includes('function buildDocument')) throw new Error('自己保存のコードが含まれていません');
if (JSON.parse(json) === undefined) throw new Error('埋め込みJSONが壊れています');
// 生の "<" が1つも残っていないこと（= すべて < に逃げたこと）を直接見る。
// "</script" 等を探す形だと、逃がしたあとでは原理的に真にならず検査として死ぬ。
if (json.indexOf('<') >= 0) throw new Error('埋め込みJSONに生の < が残っています');
if (out.split(C).length - 1 !== 3) throw new Error('script の閉じタグが3つではありません');
// 個数を数えるときはアプリ本体を除く。buildDocument が同じ id を
// 文字列リテラルとして持っているので、全文で数えると必ず複数になる。
const shell = out.replace(script, '');
for (const id of ['appTitle', 'appStyle', 'quizData', 'bodyTpl', 'appScript', 'root']) {
  const n = shell.split(`id="${id}"`).length - 1;
  if (n !== 1) throw new Error(`id="${id}" が ${n} 個あります（1つであるべき）`);
}

fs.writeFileSync(path.join(dir, 'artifact.html'), out);

const chapters = [...new Set(questions.map(q => q.chapter))].sort((a, b) => a - b);
const titles = Array.isArray(data) ? null : (data.chapters || {});
console.log('artifact.html を書き出しました');
console.log(`  問題数 : ${questions.length}`);
console.log(`  サイズ : ${(out.length / 1024).toFixed(1)} KB`);
console.log(`  章     : ${chapters.map(c => c + (titles && titles[c] ? ` ${titles[c]}` : '')).join(' / ')}`);
if (titles) {
  const noName = chapters.filter(c => !titles[c]);
  if (noName.length) console.log(`  ⚠ 章名がない章: ${noName.join(', ')}`);
}
