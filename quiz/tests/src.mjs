import { launchBrowser } from './browser.mjs';
const f=[];const ok=(c,m)=>{console.log((c?'  PASS ':'  FAIL ')+m);if(!c)f.push(m)};
const b=await launchBrowser();
const c=await b.newContext({viewport:{width:375,height:812}});
const p=await c.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('**/quiz-data.json', r=>r.fulfill({contentType:'application/json',body:JSON.stringify([
 {id:1,chapter:3,tag:'#10',q:'出典つきの問題',options:['あ','い','う','え'],answer:0,explanation:'解説文',source:'https://docs.cloud.google.com/bigquery/docs/partitioned-tables',addedAt:'2026-12-31'},
 {id:2,chapter:3,tag:'#10',q:'出典なしの問題',options:['か','き','く','け'],answer:1,explanation:'解説文',addedAt:'2026-12-30'},
 {id:3,chapter:3,tag:'#10',q:'危険なURLの問題',options:['さ','し','す','せ'],answer:2,explanation:'解説文',source:'javascript:alert(1)',addedAt:'2026-12-29'}])}));
await p.goto('http://localhost:8777/index.html',{waitUntil:'networkidle'});
await p.locator('#screenHome:not(.hidden)').waitFor();
await p.locator('#modeRecent').click();
await p.locator('#screenQuiz:not(.hidden)').waitFor();
for(let i=0;i<3;i++){
  const qt=await p.locator('#qText').textContent();
  // 振り返り一覧は不正解の問題だけを載せるので、必ず外す
  const correct=await p.evaluate(async t=>{const d=await(await fetch('quiz-data.json')).json();
    const r=(Array.isArray(d)?d:d.questions).find(x=>x.q===t);return r?r.options[r.answer]:null;},qt);
  const shown=await p.locator('#qOpts .opt .txt').allTextContents();
  const ci=shown.indexOf(correct);
  await p.locator('#qOpts .opt').nth(ci===0?1:0).click();
  await p.locator('#qVerdict:not(.hidden)').waitFor();
  const n=await p.locator('#qVerdict .srcline').count();
  if(/出典つき/.test(qt)){
    ok(n===1,'出典つき: 出典欄が出る');
    const a=p.locator('#qVerdict .srcline a');
    ok(await a.count()===1,'  リンクになっている');
    ok((await a.textContent())==='docs.cloud.google.com','  ドメイン名で表示: '+await a.textContent());
    ok(((await a.getAttribute('rel'))||'').includes('noopener'),'  rel=noopener が付く');
    ok((await a.getAttribute('target'))==='_blank','  別タブで開く');
  }
  if(/出典なし/.test(qt)) ok(n===0,'出典なし: 出典欄は出ない');
  if(/危険なURL/.test(qt)){
    ok(n===1,'危険なURL: 欄は出る');
    ok(await p.locator('#qVerdict .srcline a').count()===0,'  リンクにはしない（javascript: を踏ませない）');
  }
  await p.locator('#nextBtn').click();
}
await p.locator('#screenResult:not(.hidden)').waitFor();
ok(await p.locator('#rsReview .srcline a').count()>=1,'振り返り一覧にも出典が出る');
ok(errs.length===0,'例外なし'+(errs.length?': '+errs[0]:''));

/* 出典リンクの表示が、実際の遷移先と食い違わないか。
   入力文字列を切り出してドメインを出すと、キリル文字の e やタブ入り userinfo で
   本物そっくりの表示のまま別サイトへ飛ばせる。 */
console.log('\n【リンク偽装】表示ドメインと実際の遷移先が一致するか');
{
  const CASES = [
    ['https://cloud.googlе.com/bigquery/docs', 'IDN ホモグラフ（е はキリル文字）'],
    ['https://cloud.google.com\t@evil.example/phish', 'タブ入り userinfo'],
    ['https://cloud.google.com\n@evil.example/phish', '改行入り userinfo'],
    ['https://user:pw@evil.example/x', '素の userinfo'],
  ];
  const p2 = await c.newPage();
  await p2.route('**/quiz-data.json', r => r.fulfill({ contentType:'application/json',
    body: JSON.stringify(CASES.map((cs, i) => ({
      id: 100 + i, chapter: 1, tag: '#1', q: '偽装URLの問題' + i,
      options: ['あ' + i, 'い', 'う', 'え'], answer: 0, explanation: '解説',
      source: cs[0], addedAt: '2026-12-31' }))) }));
  await p2.goto('http://localhost:8777/index.html', { waitUntil:'networkidle' });
  await p2.locator('#screenHome:not(.hidden)').waitFor();
  await p2.locator('#modeRecent').click();
  await p2.locator('#screenQuiz:not(.hidden)').waitFor();
  for (let i = 0; i < CASES.length; i++) {
    await p2.locator('#qOpts .opt').nth(0).click();
    await p2.locator('#qVerdict:not(.hidden)').waitFor();
    const a = p2.locator('#qVerdict .srcline a');
    if (await a.count()) {
      const label = (await a.textContent()).trim();
      const host = await a.evaluate(n => n.hostname);
      ok(label === host,
         `表示が実際のホストと一致する（"${label}" / 実際 "${host}"）`);
      ok(!/^cloud\.google\.com$/.test(label) || host === 'cloud.google.com',
         `本物のドメインを騙っていない: "${label}"`);
    } else {
      ok(true, 'リンクにしない（' + CASES[i][1] + '）');
    }
    if (i < CASES.length - 1) await p2.locator('#nextBtn').click();
  }
  await p2.close();
}

await b.close();
console.log('\n'+(f.length?`FAILURES (${f.length}):\n - `+f.join('\n - '):'ALL PASS'));
process.exit(f.length?1:0);
