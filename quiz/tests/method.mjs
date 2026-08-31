import { launchBrowser } from './browser.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __d = path.dirname(fileURLToPath(import.meta.url));
const QUIZ = path.join(__d, '..');
const N = String(JSON.parse(fs.readFileSync(path.join(QUIZ,'quiz-data.json'),'utf8')).length);
const f=[];const ok=(c,m)=>{console.log((c?'  PASS ':'  FAIL ')+m);if(!c)f.push(m)};
const b=await launchBrowser();
const c=await b.newContext({viewport:{width:375,height:812}});
const p=await c.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8777/index.html',{waitUntil:'networkidle'});
await p.locator('#screenHome:not(.hidden)').waitFor();

console.log('\n【方式別カード】');
const n=await p.locator('#methodBtns .btn').count();
ok(n===8,`方式が8つ出る: ${n}`);
const first=await p.locator('#methodBtns .btn').first().innerText();
ok(/構成・前提/.test(first),'方式設計書の順に並ぶ（先頭は構成・前提）: '+first.split('\n')[0]);
const texts=await p.locator('#methodBtns .btn').allInnerTexts();
const counts=texts.map(t=>{const m=t.match(/(\d+)問/);return m?Number(m[1]):0;});
ok(counts.reduce((a,x)=>a+x,0)===Number(N),`問題数の合計が${N}: ${counts.reduce((a,x)=>a+x,0)}`);
ok(texts.every(t=>/まだ解いていません/.test(t)),'未挑戦なら「まだ解いていません」と出る');

console.log('\n【方式別に解く】');
const idx=texts.findIndex(t=>/データ方式/.test(t));
await p.locator('#methodBtns .btn').nth(idx).click();
await p.locator('#screenQuiz:not(.hidden)').waitFor();
const total=Number((await p.locator('#qCount').textContent()).split('/')[1].trim());
ok(total===9,`データ方式の9問が出る: ${total}`);
ok((await p.locator('#brandSub').textContent())==='データ方式','ヘッダに方式名が出る');
ok(await p.locator('#qMethod').isVisible(),'出題中に方式チップが出る');
ok((await p.locator('#qMethod').textContent())==='データ方式','チップの中身が正しい');
// 全部データ方式の問題か
const seen=new Set();
for(let i=0;i<total;i++){
  seen.add(await p.locator('#qMethod').textContent());
  await p.locator('#qOpts .opt').nth(1).click();     // わざと外す確率を上げる
  await p.locator('#qVerdict:not(.hidden)').waitFor();
  await p.locator('#nextBtn').click();
}
ok(seen.size===1 && seen.has('データ方式'),'出題は全部その方式に限られる');
await p.locator('#screenResult:not(.hidden)').waitFor();
ok(await p.locator('#rsReview .chip.method').count()>0,'振り返り一覧にも方式が出る');
await p.locator('#toHomeBtn').click();
await p.locator('#screenHome:not(.hidden)').waitFor();
const after=await p.locator('#methodBtns .btn').nth(idx).innerText();
ok(/正答率 \d+%/.test(after),'解いた方式に正答率が出る: '+after.replace(/\n/g,' / '));

console.log('\n【新しい方式を足すと自動で増えるか】');
const p2=await c.newPage();
await p2.route('**/quiz-data.json', async r=>{
  const res=await r.fetch(); const d=await res.json();
  d.push({id:900,chapter:3,tag:'#16',method:'ストリーミング方式',q:'新しい方式の問題',
    options:['あ','い','う','え'],answer:0,explanation:'x',addedAt:'2026-09-01'});
  r.fulfill({contentType:'application/json',body:JSON.stringify(d)});
});
await p2.goto('http://localhost:8777/index.html',{waitUntil:'networkidle'});
await p2.locator('#screenHome:not(.hidden)').waitFor();
const n2=await p2.locator('#methodBtns .btn').count();
ok(n2===9,`方式が9つに増える（コード変更なし）: ${n2}`);
const last=await p2.locator('#methodBtns .btn').last().innerText();
ok(/ストリーミング方式/.test(last),'知らない方式は末尾に並ぶ: '+last.split('\n')[0]);

console.log('\n【方式が無い問題】');
const p3=await c.newPage();
await p3.route('**/quiz-data.json', r=>r.fulfill({contentType:'application/json',body:JSON.stringify([
  {id:1,chapter:1,tag:'#1',q:'方式なしの問題',options:['あ','い','う','え'],answer:0,explanation:'x',addedAt:'2026-09-01'}])}));
await p3.goto('http://localhost:8777/index.html',{waitUntil:'networkidle'});
await p3.locator('#screenHome:not(.hidden)').waitFor();
ok((await p3.locator('#methodBtns .btn').count())===0,'方式が無ければボタンは出ない');
ok(/方式が設定された問題がまだありません/.test(await p3.locator('#methodBtns').innerText()),'その旨を出す');
await p3.locator('#modeAll').click();
await p3.locator('#screenQuiz:not(.hidden)').waitFor();
ok(await p3.locator('#qMethod').isHidden(),'方式チップは出ない');

ok(errs.length===0,'例外なし'+(errs.length?': '+errs[0]:''));
await b.close();
console.log('\n'+(f.length?`FAILURES (${f.length}):\n - `+f.join('\n - '):'ALL PASS'));
process.exit(f.length?1:0);
