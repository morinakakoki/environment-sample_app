import { launchBrowser } from './browser.mjs';
const f=[];const ok=(c,m)=>{console.log((c?'  PASS ':'  FAIL ')+m);if(!c)f.push(m)};
const b=await launchBrowser();
const mk=async(data)=>{
  const c=await b.newContext({viewport:{width:375,height:812},permissions:['clipboard-read','clipboard-write']});
  const p=await c.newPage();
  await p.route('**/quiz-data.json', r=>r.fulfill({contentType:'application/json',body:JSON.stringify(data)}));
  return {c,p};
};
const Q=(id,extra={})=>({id,chapter:1,tag:'#1',q:'問題'+id,options:['あ'+id,'い','う','え'],answer:0,explanation:'解説',addedAt:'2026-08-01',...extra});
const solve=async(p,n,pick=0)=>{const seen=[];for(let i=0;i<n;i++){
  seen.push(await p.locator('#qText').textContent());
  await p.locator('#qOpts .opt').nth(pick).click();
  await p.locator('#qVerdict:not(.hidden)').waitFor();
  await p.locator('#nextBtn').click();} return seen;};
// 選択肢は出題ごとにシャッフルされるので、「index 1 を選べば必ず不正解」とは限らない。
// Q() の正解は 'あ' 始まりなので、それ以外を選んで確実に外す。
const solveWrong=async(p,n)=>{for(let i=0;i<n;i++){
  const shown=await p.locator('#qOpts .opt .txt').allTextContents();
  const idx=shown.findIndex(x=>!x.startsWith('あ'));
  await p.locator('#qOpts .opt').nth(idx<0?1:idx).click();
  await p.locator('#qVerdict:not(.hidden)').waitFor();
  await p.locator('#nextBtn').click();}};
const copyJson=async(p)=>{await p.locator('#addCopyBtn').click();await p.waitForTimeout(400);
  return JSON.parse(await p.evaluate(()=>navigator.clipboard.readText()));};

console.log('\n【A】同じ日に15問。未挑戦の問題が次の周で必ず出るか');
{
  const data=[];for(let i=1;i<=15;i++)data.push(Q(i,{addedAt:'2026-08-20'}));
  const {c,p}=await mk(data);
  await p.goto('http://localhost:8777/index.html',{waitUntil:'networkidle'});
  await p.locator('#screenHome:not(.hidden)').waitFor();
  await p.locator('#modeRecent').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  const r1=await solve(p,10);
  await p.locator('#screenResult:not(.hidden)').waitFor();
  await p.locator('#toHomeBtn').click();
  await p.locator('#screenHome:not(.hidden)').waitFor();
  const unseen=data.map(q=>q.q).filter(q=>!r1.includes(q));
  ok(unseen.length===5,`1周目で10問、未挑戦は5問: ${unseen.length}`);
  await p.locator('#modeRecent').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  const r2=await solve(p,10);
  const covered=unseen.filter(q=>r2.includes(q));
  ok(covered.length===5,`2周目に未挑戦5問がすべて含まれる（干上がらない）: ${covered.length}/5`);
  await c.close();
}

console.log('\n【B】消した問題の id を再利用しないか');
{
  const {c,p}=await mk([Q(1),Q(2)]);
  await p.goto('http://localhost:8777/index.html',{waitUntil:'networkidle'});
  await p.locator('#screenHome:not(.hidden)').waitFor();
  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('gcpQuiz.v1')||'{"stats":{},"sessions":[]}');
    s.stats['5']={seen:3,correct:0,wrong:3,last:'wrong',lastAt:'2026-08-01T00:00:00.000Z'};
    localStorage.setItem('gcpQuiz.v1',JSON.stringify(s));});
  await p.reload({waitUntil:'networkidle'});
  await p.locator('#screenHome:not(.hidden)').waitFor();
  await p.locator('#addBtn').click();
  await p.locator('#addTa').fill(JSON.stringify([{chapter:1,tag:'#1',q:'新しい問題',options:['ア','イ','ウ','エ'],answer:0,explanation:'x'}]));
  await p.locator('#addCheckBtn').click();
  await p.locator('#addResult.ok').waitFor({timeout:3000});
  const merged=await copyJson(p);
  const nq=merged.find(x=>x.q==='新しい問題');
  ok(nq && Number(nq.id)>5, `記録に残る id 5 を避けて採番: id=${nq&&nq.id}`);
  await c.close();
}

console.log('\n【C】保存データが壊れていても起動できるか');
{
  const {c,p}=await mk([Q(1),Q(2)]);
  await p.goto('http://localhost:8777/index.html',{waitUntil:'networkidle'});
  await p.locator('#screenHome:not(.hidden)').waitFor();
  await p.evaluate(()=>localStorage.setItem('gcpQuiz.v1', JSON.stringify({
    stats:{'1':{seen:1,correct:1,wrong:0,last:'correct'},'2':null,'3':'こわれてる'},
    sessions:[null,{at:'2026-08-01T00:00:00.000Z',label:'全範囲',total:2,correct:1},'ごみ',{noAt:true}]})));
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.reload({waitUntil:'networkidle'});
  await p.locator('#screenHome:not(.hidden)').waitFor({timeout:5000});
  ok(errs.length===0,'壊れた記録があっても例外なく起動する'+(errs.length?': '+errs[0]:''));
  ok((await p.locator('#histList .histrow').count())===1,'正常な履歴1件だけ残る');
  ok(await p.locator('#resetBtn').isVisible(),'リセットボタンに到達できる');
  await c.close();
}

console.log('\n【D】キーボードのヒントが解答前から見えるか');
{
  const {c,p}=await mk([Q(1),Q(2)]);
  await p.goto('http://localhost:8777/index.html',{waitUntil:'networkidle'});
  await p.locator('#screenHome:not(.hidden)').waitFor();
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  ok(await p.locator('#qHint').isVisible(),'解答する前からヒントが見えている');
  await c.close();
}

console.log('\n【E】形式エラーの行を保存データに混ぜないか');
{
  const {c,p}=await mk([Q(1)]);
  await p.goto('http://localhost:8777/index.html',{waitUntil:'networkidle'});
  await p.locator('#screenHome:not(.hidden)').waitFor();
  await p.locator('#addBtn').click();
  await p.locator('#addTa').fill(JSON.stringify([
    {chapter:1,tag:'#1',q:'正常な問題',options:['ア','イ','ウ','エ'],answer:0,explanation:'x',addedAt:'2026-09-01'},
    {chapter:1,tag:'#1',q:'選択肢が1つしかない',options:['ア'],answer:0,explanation:'x'},
    {chapter:1,tag:'#1',q:'正解が範囲外',options:['ア','イ','ウ','エ'],answer:9,explanation:'x'}]));
  await p.locator('#addCheckBtn').click();
  await p.locator('#addResult.ok').waitFor({timeout:3000});
  const t=await p.locator('#addResult').innerText();
  ok(/2件は形式エラーのため除きました/.test(t),'形式エラーの件数を出す: '+(t.split('\n').find(x=>/形式エラー/.test(x))||'表示なし'));
  const merged=await copyJson(p);
  ok(merged.length===2,`保存データは正常な2問だけ: ${merged.length}`);
  ok(!JSON.stringify(merged).includes('選択肢が1つしかない'),'壊れた行が焼き込まれていない');
  await c.close();
}

console.log('\n【F】addedAt を省いても「最近追加」に出るか');
{
  const {c,p}=await mk([Q(1)]);
  await p.goto('http://localhost:8777/index.html',{waitUntil:'networkidle'});
  await p.locator('#screenHome:not(.hidden)').waitFor();
  await p.locator('#addBtn').click();
  await p.locator('#addTa').fill(JSON.stringify([{chapter:1,tag:'#1',q:'日付を省いた問題',options:['ア','イ','ウ','エ'],answer:0,explanation:'x'}]));
  await p.locator('#addCheckBtn').click();
  await p.locator('#addResult.ok').waitFor({timeout:3000});
  const merged=await copyJson(p);
  const nq=merged.find(x=>x.q==='日付を省いた問題');
  ok(nq && /^\d{4}-\d{2}-\d{2}$/.test(nq.addedAt||''),`今日の日付が入る: ${nq&&nq.addedAt}`);
  await c.close();
}

console.log('\n【G】「同じモードでもう一度」の無効化');
{
  const {c,p}=await mk([Q(1),Q(2)]);
  await p.goto('http://localhost:8777/index.html',{waitUntil:'networkidle'});
  await p.locator('#screenHome:not(.hidden)').waitFor();
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await solveWrong(p,2);                               // わざと全問不正解
  await p.locator('#screenResult:not(.hidden)').waitFor();
  await p.locator('#retryWrongBtn').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  const nWrong=Number((await p.locator('#qCount').textContent()).split('/')[1].trim());
  for(let i=0;i<nWrong;i++){                           // 今度は全問正解
    const shown=await p.locator('#qOpts .opt .txt').allTextContents();
    const idx=shown.findIndex(x=>x.startsWith('あ'));
    await p.locator('#qOpts .opt').nth(idx<0?0:idx).click();
    await p.locator('#qVerdict:not(.hidden)').waitFor();
    await p.locator('#nextBtn').click();
  }
  await p.locator('#screenResult:not(.hidden)').waitFor();
  ok(await p.locator('#againBtn').isDisabled(),'解ける問題が無いので「もう一度」は無効');
  ok(/解ける問題はありません/.test(await p.locator('#againBtn').innerText()),'理由が書いてある');
  await c.close();
}

await b.close();
console.log('\n'+(f.length?`FAILURES (${f.length}):\n - `+f.join('\n - '):'ALL PASS'));
process.exit(f.length?1:0);
