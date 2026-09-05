/* GitHub Pages に出す一式を _site/ に組み立てる。
 *
 *   node build-pages.mjs   → quiz/_site/
 *
 * アーティファクト版（build-artifact.mjs）との違い:
 *
 *   - 問題データは埋め込まない。index.html が隣の quiz-data.json を fetch する。
 *     ページを差し替えずに問題だけ増やせるし、初回の転送も小さくなる。
 *   - 方式設計書を同じオリジンに置くので、クイズの「方式設計書 §4」から #s4 が
 *     そのまま効く（claude.ai の枠を通らないため）。
 *   - manifest とアイコンを一緒に置く。ホーム画面に追加するとアドレスバー無しで開く。
 *
 * design-doc.html はアーティファクトの「中身」だけを持つ（<!doctype> や <head> は
 * 発行時に付く前提）。Pages では素のファイルとして配られるので、ここで器を被せる。
 * 被せないと charset の宣言が無く、日本語が文字化けし得る。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir  = path.dirname(fileURLToPath(import.meta.url));
const out  = path.join(dir, '_site');

/* そのまま配るファイル。ここに挙げたものだけが公開される。
   README・テスト・ビルドスクリプト・artifact.html は出さない
   （artifact.html は claude.ai 用の版で、Pages では二重に配る意味がない）。 */
const COPY = ['index.html', 'quiz-data.json', 'manifest.webmanifest',
              'icon-192.png', 'icon-512.png'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const f of COPY) {
  const src = path.join(dir, f);
  if (!fs.existsSync(src)) throw new Error(`${f} がありません`);
  fs.copyFileSync(src, path.join(out, f));
}

/* index.html は Pages でもローカルサーバでも同じもの。埋め込みが無いことを確かめる
   （artifact.html を間違えてコピーすると、問題を増やしても反映されなくなる）。 */
const app = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
/* 素の id="quizData" では判定できない。index.html にも、アプリが自分を再発行する
   コードの中に同じ文字列が（'<'+'script' と分けた形で）入っているため。
   埋め込み版にだけ現れる、つながった開始タグを見る。 */
if (app.includes('<script type="application/json" id="quizData">')) throw new Error(
  'index.html に問題データが埋め込まれています（artifact.html を配ろうとしていませんか）');
if (!/var DOC_URL = 'design-doc\.html';/.test(app)) throw new Error(
  "index.html の DOC_URL が 'design-doc.html' ではありません（Pages では隣の設計書を指す必要があります）");
if (!/var NOTE_URL = 'note\.html';/.test(app)) throw new Error(
  "index.html の NOTE_URL が 'note.html' ではありません（Pages では隣のノートを指す必要があります）");

/* --- 読み物のページに器を被せる ---
   design-doc.html / note.html はアーティファクトの「中身」だけを持つ形で置いてある。
   Pages では素のファイルとして配られるので、ここで <!doctype> と <head> を被せる。 */
function shell(file, fallbackTitle){
  const doc = fs.readFileSync(path.join(dir, file), 'utf8');
  const at = doc.indexOf('<main>');
  if (at < 0) throw new Error(`${file} に <main> が見つかりません`);
  /* 生のまま開いたとき用に、ファイル側にも charset が入っている。器を被せる側でも
     宣言するので、ここでは落とす（2つ入っていても先頭が勝つが、出すものは1つにする）。 */
  const head = doc.slice(0, at).replace(/<meta charset=[^>]*>\s*/i, '').trim();
  const body = doc.slice(at).trim();
  const title = (head.match(/<title>([\s\S]*?)<\/title>/) || [null, fallbackTitle])[1];
  if (!/<style>/.test(head)) throw new Error(`${file} に <style> が見つかりません`);
  if (/<title>/.test(body)) throw new Error(`${file} の <title> が本文側に残っています`);
  if ((body.match(/<style>/g) || []).length) throw new Error(`${file} の <style> が本文側にもあります`);
  return { head, body, title };
}

const docPage  = shell('design-doc.html', '方式設計書');
const notePage = shell('note.html', '基礎知識ノート');
const head = docPage.head, body = docPage.body, title = docPage.title;

/* アイコンは § の1文字。クイズ（青地に ?）とタブで見分けられるようにする。 */
const icon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'"
  + "%3E%3Crect width='64' height='64' rx='14' fill='%232C6E72'/%3E%3Ctext x='32' y='46'"
  + " font-size='40' font-family='system-ui,sans-serif' font-weight='700' text-anchor='middle'"
  + " fill='%23fff'%3E%C2%A7%3C/text%3E%3C/svg%3E";

const page = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="description" content="マーケットデータ基盤の方式設計書（GCP / BigQuery / Terraform）">
<link rel="icon" href="${icon}">
${head}
</head>
<body>
${body}
</body>
</html>
`;
fs.writeFileSync(path.join(out, 'design-doc.html'), page);

/* 基礎知識ノート。アイコンは「基」の1文字。設計書（§）・クイズ（?）と見分ける。 */
const noteIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'"
  + "%3E%3Crect width='64' height='64' rx='14' fill='%232C6E72'/%3E%3Ctext x='32' y='46'"
  + " font-size='34' font-family='system-ui,sans-serif' font-weight='700' text-anchor='middle'"
  + " fill='%23fff'%3E%E5%9F%BA%3C/text%3E%3C/svg%3E";
const notePageOut = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="description" content="マーケットデータ基盤を作るために要るぶんだけの基礎知識（GCP / BigQuery / Terraform）">
<link rel="icon" href="${noteIcon}">
${notePage.head}
</head>
<body>
${notePage.body}
</body>
</html>
`;
fs.writeFileSync(path.join(out, 'note.html'), notePageOut);

/* 出したものを検算する。壊れた一式を Pages に上げないため。 */
const ids = [...page.matchAll(/<h2 id="(s\d+)"/g)].map(m => m[1]);
if (ids.length !== 11) throw new Error(`設計書の節の id が 11 個ではありません（${ids.length}個）`);
for (const [, h] of page.matchAll(/href="#(s\d+)"/g)) {
  if (!ids.includes(h)) throw new Error(`設計書に行き先の無いリンクがあります: #${h}`);
}
if (/<title>/.test(body)) throw new Error('<title> が本文側に残っています');
if ((page.match(/<style>/g) || []).length !== 1) throw new Error('設計書の <style> が1つではありません');

/* ノートの章。クイズの章チップが note.html#c1〜#c7 を指すので、章の数と id が
   合っていないと、押しても黙ってページ先頭に着く（404 にはならない＝気づけない）。
   章を増やしたら DEFAULT_CHAPTER_TITLES とここの数を一緒に動かす。 */
const chaps = [...notePageOut.matchAll(/<details id="(c\d+)"/g)].map(m => m[1]);
if (chaps.length !== 7) throw new Error(`ノートの章の id が 7 個ではありません（${chaps.length}個）`);
for (const [, h] of notePageOut.matchAll(/href="#(c\d+)"/g)) {
  if (!chaps.includes(h)) throw new Error(`ノートに行き先の無いリンクがあります: #${h}`);
}
if ((notePageOut.match(/<style>/g) || []).length !== 1) throw new Error('ノートの <style> が1つではありません');

const made = COPY.concat('design-doc.html', 'note.html');
const size = made.reduce((n, f) => n + fs.statSync(path.join(out, f)).size, 0);
console.log('_site/ を書き出しました');
console.log(`  ファイル : ${made.join(' / ')}`);
console.log(`  合計     : ${(size / 1024).toFixed(1)} KB`);
console.log(`  設計書   : ${title}（節 ${ids.length}）`);
console.log(`  ノート   : ${notePage.title}（章 ${chaps.length}）`);
