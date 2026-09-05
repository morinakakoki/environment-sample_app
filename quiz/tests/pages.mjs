/* GitHub Pages に出す一式（build-pages.mjs → _site/）の検査。

   アーティファクト版と違って、ここは「隣のファイルを読める」ことが前提の配り方。
   壊れ方が静かなものを見る:
     - 設計書に器（doctype と charset）が付いていない → 日本語が文字化けし得る
     - クイズから設計書へのリンクが同じオリジンを指していない → #s4 が効かない
     - manifest が壊れている → ホーム画面に追加してもアドレスバーが消えない
     - artifact.html を間違えて配る → 問題を足しても反映されない
*/
import { launchBrowser } from './browser.mjs';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __d = path.dirname(fileURLToPath(import.meta.url));
const QUIZ = path.join(__d, '..');
const SITE = path.join(QUIZ, '_site');

const f = [];
const ok = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) f.push(m); };

console.log('\n【1】_site/ が組み上がる');
{
  execFileSync('node', [path.join(QUIZ, 'build-pages.mjs')], { stdio: 'pipe' });
  for (const n of ['index.html', 'quiz-data.json', 'design-doc.html',
                   'manifest.webmanifest', 'icon-192.png', 'icon-512.png']) {
    ok(fs.existsSync(path.join(SITE, n)), n + ' がある');
  }
  /* README・テスト・ビルドスクリプト・artifact.html は公開しない */
  for (const n of ['README.md', 'artifact.html', 'build-pages.mjs', 'tests']) {
    ok(!fs.existsSync(path.join(SITE, n)), n + ' は出さない');
  }
}

console.log('\n【2】設計書に器が付く（文字化け防止）');
{
  const doc = fs.readFileSync(path.join(SITE, 'design-doc.html'), 'utf8');
  ok(/^<!DOCTYPE html>/i.test(doc), 'doctype から始まる');
  ok(/<meta charset="UTF-8">/i.test(doc), 'charset を宣言している');
  ok(/<html lang="ja">/.test(doc), 'lang="ja" がある');
  ok(/<head>[\s\S]*<title>[\s\S]*<\/title>[\s\S]*<\/head>/.test(doc), '<title> が head にある');
  ok((doc.match(/<title>/g) || []).length === 1, '<title> は1つだけ');
  ok((doc.match(/<style>/g) || []).length === 1, '<style> は1つだけ');
  ok(/<h2 id="s11"/.test(doc), '§11 が落ちていない');
  /* 元ファイルの本文が丸ごと入っていること（器を被せるときに切り落としていないか） */
  const src = fs.readFileSync(path.join(QUIZ, 'design-doc.html'), 'utf8');
  ok(doc.includes(src.slice(src.indexOf('<main>')).trim()), '本文をそのまま運んでいる');
}

console.log('\n【3】manifest が読める');
{
  const m = JSON.parse(fs.readFileSync(path.join(SITE, 'manifest.webmanifest'), 'utf8'));
  ok(m.display === 'standalone', 'display: standalone（アドレスバー無しで開く）');
  ok(/index\.html$/.test(m.start_url || ''), 'start_url がクイズを指す: ' + m.start_url);
  ok(Array.isArray(m.icons) && m.icons.length >= 2, 'アイコンが2つ以上ある');
  for (const i of (m.icons || [])) {
    ok(fs.existsSync(path.join(SITE, i.src)), i.src + ' が実在する');
  }
  const app = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok(/<link rel="manifest" href="manifest\.webmanifest">/.test(app), 'index.html が manifest を読んでいる');
}

const b = await launchBrowser();
const BASE = 'http://localhost:8791/';

console.log('\n【4】配った形のまま動く（同じオリジンの設計書へ飛べる）');
{
  const c = await b.newContext({ viewport: { width: 375, height: 812 } });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const bad = []; p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });

  await p.goto(BASE + 'index.html', { waitUntil: 'networkidle' });
  await p.locator('#screenHome:not(.hidden)').waitFor();
  ok(Number(await p.locator('#stTotal').textContent()) >= 48,
     '隣の quiz-data.json を読めている: ' + (await p.locator('#stTotal').textContent()) + '問');

  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await p.locator('#qOpts .opt').nth(0).click();
  await p.locator('#qNextWrap:not(.hidden)').waitFor();
  const link = p.locator('#qVerdict .backto a.chip-link');
  const href = await link.getAttribute('href');
  ok(href && href.startsWith(BASE + 'design-doc.html#s'),
     '節のチップが同じオリジンの設計書を指す: ' + href);

  /* 実際にその URL を開いて、狙った節に着くか。ここが Pages にした一番の効き目。 */
  const p2 = await c.newPage();
  await p2.goto(href, { waitUntil: 'load' });
  await p2.waitForTimeout(400);
  const id = href.slice(href.indexOf('#') + 1);
  const box = await p2.locator('#' + id).boundingBox();
  ok(box && box.y >= 0 && box.y < 60, '#' + id + ' の節が画面上端に来る: y=' + (box && Math.round(box.y)));
  ok(bad.length === 0, '404 が出ない: ' + (bad.join(' / ') || 'なし'));
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【5】設計書が単体で読める（ライト・ダーク）');
{
  for (const scheme of ['light', 'dark']) {
    const c = await b.newContext({ viewport: { width: 375, height: 812 }, colorScheme: scheme });
    const p = await c.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + 'design-doc.html', { waitUntil: 'load' });
    ok((await p.locator('.toc a').count()) === 11, `[${scheme}] 節の一覧が11個`);
    const over = await p.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(over <= 0, `[${scheme}] 375px で横に溢れない: ${over}px`);
    /* 文字化けの検知。器に charset が無いと、ここが化ける。 */
    ok(/マーケットデータ基盤/.test(await p.locator('h1').innerText()),
       `[${scheme}] 日本語が化けていない: ` + (await p.locator('h1').innerText()));
    ok(errs.length === 0, `[${scheme}] 例外なし` + (errs.length ? ': ' + errs[0] : ''));
    await c.close();
  }
}

await b.close();
console.log('\n' + (f.length ? `FAILURES (${f.length}):\n - ` + f.join('\n - ') : 'ALL PASS'));
process.exit(f.length ? 1 : 0);
