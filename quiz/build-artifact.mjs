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

const dir  = path.dirname(new URL(import.meta.url).pathname);
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
const script = bodyRaw.slice(scriptAt + '<script>'.length, bodyRaw.lastIndexOf('</' + 'script>'));

// script 要素の中身に </script が現れると、そこで途中終了してしまう
for (const [name, text] of [['本文マークアップ', markup], ['アプリ本体', script]]) {
  if (/<\/script/i.test(text)) throw new Error(`${name} に </script が含まれています（分割して書いてください）`);
}

const C  = '</' + 'script>';
const SO = '<' + 'script';
const json = JSON.stringify(data).replace(/<\//g, '<\\/');

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
if (JSON.parse(json.replace(/<\\\//g, '</')) === undefined) throw new Error('埋め込みJSONが壊れています');

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
