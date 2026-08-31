/* quiz-data.json を index.html に埋め込んで、アーティファクト用の1ファイルを作る。
 *
 *   node build-artifact.mjs
 *   → artifact.html を出力
 *
 * アーティファクトは単独のHTMLページなので隣のファイルを fetch できない。
 * そのため問題データを HTML に焼き込む。index.html 側は window.QUIZ_DATA が
 * あればそれを使い、なければ従来どおり quiz-data.json を fetch する。
 *
 * アーティファクトの器（<!doctype>/<html>/<head>/<body>）とビューポート指定は
 * 公開時に付くので、ここでは中身だけを書き出す。
 */
import fs from 'fs';
import path from 'path';

const dir  = path.dirname(new URL(import.meta.url).pathname);
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(dir, 'quiz-data.json'), 'utf8'));

const pick = (re, label) => {
  const m = html.match(re);
  if (!m) throw new Error(`index.html から ${label} を取り出せませんでした`);
  return m[0];
};

const title = pick(/<title>[\s\S]*?<\/title>/, '<title>');
const style = pick(/<style>[\s\S]*?<\/style>/, '<style>');
const body  = html.slice(html.indexOf('<body>') + '<body>'.length, html.lastIndexOf('</body>')).trim();

// </script> がデータ中に現れると script が途中で閉じてしまうのでエスケープする
const json = JSON.stringify(data).replace(/<\//g, '<\\/');

const out = [
  title,
  style,
  `<script>window.QUIZ_DATA=${json};</script>`,
  body,
  '',
].join('\n');

const dest = path.join(dir, 'artifact.html');
fs.writeFileSync(dest, out);

console.log(`artifact.html を書き出しました`);
console.log(`  問題数   : ${data.length}`);
console.log(`  サイズ   : ${(out.length / 1024).toFixed(1)} KB`);
console.log(`  章       : ${[...new Set(data.map(q => q.chapter))].sort((a,b)=>a-b).join(', ')}`);
// 器のタグが混じっていないか（<header> に誤反応しないよう境界を見る）
const stray = out.match(/<!DOCTYPE|<\/?(html|head|body)[\s>]/i);
if (stray) throw new Error(`器のタグが混入しています: ${stray[0]}`);
