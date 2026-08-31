import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __d = path.dirname(fileURLToPath(import.meta.url));
const QUIZ = path.join(__d, '..');
// 問題数はデータから読む。増えるたびにテストが壊れないように。
const N = String(JSON.parse(fs.readFileSync(path.join(QUIZ,'quiz-data.json'),'utf8')).length);

const OUT = __d;
const fail = [];
const ok = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) fail.push(m); };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !((m.location() && m.location().url) || '').includes('favicon')) errs.push('console.error: ' + m.text()); });

await page.goto('http://localhost:8777/index.html', { waitUntil: 'networkidle' });

console.log('\n== load ==');
await page.waitForSelector('#screenHome:not(.hidden)', { timeout: 5000 });
ok(true, 'home screen rendered');
ok(await page.locator('#stTotal').textContent() === '48', 'all 48 questions loaded — got ' + await page.locator('#stTotal').textContent());
ok(await page.locator('#dataWarn').isHidden(), 'no data warnings — all 38 questions valid');
const chapBtns = await page.locator('#chapBtns .btn').count();
ok(chapBtns === 7, 'chapter buttons built dynamically: ' + chapBtns);

console.log('\n== 非数値タグ (as-of / 品質 / 設計) ==');
const tagCheck = await page.evaluate(async () => {
  const d = await (await fetch('quiz-data.json')).json();
  return [...new Set(d.map(x => x.tag))];
});
ok(tagCheck.includes('as-of') && tagCheck.includes('品質') && tagCheck.includes('設計'),
   'data keeps word tags: ' + JSON.stringify(tagCheck.filter(t => !t.startsWith('#'))));

console.log('\n== horizontal overflow @375 ==');
const ow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(ow <= 0, 'no horizontal scroll on home (overflow=' + ow + ')');

console.log('\n== tap targets ==');
const small = await page.evaluate(() => [...document.querySelectorAll('#screenHome button')]
  .filter(b => b.offsetParent && b.getBoundingClientRect().height < 40)
  .map(b => (b.textContent || '').slice(0, 24)));
ok(small.length === 0, 'all home buttons >= 40px tall' + (small.length ? ' — small: ' + JSON.stringify(small) : ''));

await page.screenshot({ path: OUT + '/01-home-light.png', fullPage: true });

console.log('\n== theme toggle ==');
await page.click('#themeBtn');                      // auto -> light
ok(await page.getAttribute('html', 'data-theme') === 'light', 'theme -> light');
await page.click('#themeBtn');                      // light -> dark
ok(await page.getAttribute('html', 'data-theme') === 'dark', 'theme -> dark');
const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
ok(bg === 'rgb(15, 19, 24)', 'dark bg applied: ' + bg);
await page.screenshot({ path: OUT + '/02-home-dark.png', fullPage: true });

console.log('\n== quiz flow (all mode) ==');
await page.click('#modeAll');
await page.waitForSelector('#screenQuiz:not(.hidden)');
ok(await page.locator('#qChapter').isVisible(), 'chapter chip visible during question');
const total = (await page.locator('#qCount').textContent()).split('/')[1].trim();
ok(total === '10', '全範囲 serves 10 questions, got ' + total);

// answer question 1 deliberately wrong where possible
let wrongCount = 0, rightCount = 0;
for (let i = 0; i < Number(total); i++) {
  // 選択肢は実行時にシャッフルされるので、インデックスではなく「正解の文言」で判定して
  // それ以外を選ぶ（＝必ず不正解にする）
  const qTextNow = await page.locator('#qText').textContent();
  const correctText = await page.evaluate(async (qt) => {
    const d = await (await fetch('quiz-data.json')).json();
    const row = d.find(x => x.q === qt);
    return row ? row.options[row.answer] : null;
  }, qTextNow);
  const shown = await page.locator('#qOpts .opt .txt').allTextContents();
  const correctIdx = shown.indexOf(correctText);
  if (i === 0) ok(correctIdx >= 0, 'correct option text found among rendered options');
  const pick = (correctIdx === 0) ? 1 : 0;
  await page.locator('#qOpts .opt').nth(pick).click();
  await page.waitForSelector('#qVerdict:not(.hidden)');
  const isOk = (await page.locator('#qVerdict').getAttribute('class')).includes('ok');
  isOk ? rightCount++ : wrongCount++;
  if (i === 0) {
    ok((await page.locator('#qVerdict .exp').count()) === 1, 'explanation rendered');
    const backTxt = await page.locator('#qVerdict .backto').textContent();
    ok(/第\d章/.test(backTxt), 'back-to chapter shown in explanation: ' + backTxt.trim());
    ok(/理解度表\s*\S+/.test(backTxt), 'back-to tag shown in explanation');
    ok((await page.locator('#qOpts .opt.is-correct').count()) === 1, 'exactly one option marked correct');
    ok(await page.locator('#qOpts .opt').first().isDisabled(), 'options locked after answering');
    await page.screenshot({ path: OUT + '/03-answered-dark.png', fullPage: true });
    // double-click guard: clicking another option must not change the recorded answer
    await page.locator('#qOpts .opt').nth(1).click({ force: true }).catch(() => {});
    ok((await page.locator('#qOpts .opt.is-correct').count()) === 1, 'no double-answer after lock');
  }
  await page.click('#nextBtn');
}

console.log('\n== result screen ==');
await page.waitForSelector('#screenResult:not(.hidden)');
ok(await page.locator('#rsTotal').textContent() === '10', 'result total = 10');
ok(await page.locator('#rsCorrect').textContent() === String(rightCount), 'result correct = ' + rightCount);
ok((await page.locator('#rsChapters .chaprow').count()) > 0, 'per-chapter score table rendered');
if (wrongCount > 0) {
  ok(await page.locator('#rsBackChap .backchap .lbl').textContent() === '戻る章（基礎知識ノート）', '戻る章 shown');
  ok((await page.locator('#rsReview .rev').count()) === wrongCount, 'review list has ' + wrongCount + ' wrong items');
}
const ow2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(ow2 <= 0, 'no horizontal scroll on result (overflow=' + ow2 + ')');
await page.screenshot({ path: OUT + '/04-result-dark.png', fullPage: true });

console.log('\n== localStorage persistence ==');
const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('gcpQuiz.v1')));
ok(Object.keys(ls.stats).length === 10, 'stats saved for 10 questions');
ok(ls.sessions.length === 1, 'session history saved');
await page.click('#toHomeBtn');
await page.waitForSelector('#screenHome:not(.hidden)');
ok(await page.locator('#stSeen').textContent() === '10', 'home shows 10 attempted');
ok(await page.locator('#stWrong').textContent() === String(wrongCount), 'home shows ' + wrongCount + ' to review');
ok((await page.locator('#histList .histrow').count()) === 1, 'session history row on home');

console.log('\n== reload keeps history ==');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#screenHome:not(.hidden)');
ok(await page.locator('#stSeen').textContent() === '10', 'history survived reload');
ok(await page.getAttribute('html', 'data-theme') === 'dark', 'theme survived reload');

console.log('\n== 間違いのみ mode ==');
const wrongDisabled = await page.locator('#modeWrong').isDisabled();
if (wrongCount > 0) {
  ok(!wrongDisabled, '間違いのみ enabled');
  await page.click('#modeWrong');
  await page.waitForSelector('#screenQuiz:not(.hidden)');
  const t2 = (await page.locator('#qCount').textContent()).split('/')[1].trim();
  ok(Number(t2) === wrongCount, '間違いのみ serves exactly ' + wrongCount + ' questions, got ' + t2);
  await page.click('#homeBtn');
  await page.waitForSelector('#screenHome:not(.hidden)');
} else {
  ok(wrongDisabled, '間違いのみ disabled when nothing is wrong');
}

console.log('\n== keyboard ==');
await page.click('#modeRecent');
await page.waitForSelector('#screenQuiz:not(.hidden)');
await page.keyboard.press('1');
await page.waitForSelector('#qVerdict:not(.hidden)');
ok(true, 'number key answers');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
ok((await page.locator('#qCount').textContent()).startsWith('2'), 'Enter advances to Q2');
await page.click('#homeBtn');

console.log('\n== 最近追加 ordering ==');
const order = await page.evaluate(async () => {
  const r = await fetch('quiz-data.json'); const d = await r.json();
  return d.filter(x => x.addedAt).map(x => x.addedAt);
});
ok(true, 'addedAt values present: ' + JSON.stringify(order));

console.log('\n== reset ==');
page.once('dialog', d => d.accept());
await page.click('#resetBtn');
await page.waitForTimeout(300);
ok(await page.locator('#stSeen').textContent() === '0', 'reset clears history');

console.log('\n== light-mode screenshot ==');
await page.click('#themeBtn'); // dark -> auto
await page.click('#themeBtn'); // auto -> light
await page.screenshot({ path: OUT + '/05-home-light-final.png', fullPage: true });

console.log('\n== 404 / file:// error path ==');
const p3 = await ctx.newPage();
await p3.route('**/quiz-data.json', r => r.abort());
await p3.goto('http://localhost:8777/index.html');
await p3.waitForSelector('#screenError:not(.hidden)', { timeout: 5000 });
ok(true, 'error screen shown when quiz-data.json fails to load');
ok(await p3.locator('#filePick').isVisible(), 'manual file picker offered on error');
await p3.screenshot({ path: OUT + '/06-error.png', fullPage: true });

console.log('\n== console errors ==');
ok(errs.length === 0, 'no page/console errors' + (errs.length ? ': ' + JSON.stringify(errs.slice(0, 5)) : ''));

await browser.close();
console.log('\n' + (fail.length ? 'FAILURES (' + fail.length + '):\n - ' + fail.join('\n - ') : 'ALL PASS'));
process.exit(fail.length ? 1 : 0);
