import { launchBrowser } from './browser.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __d = path.dirname(fileURLToPath(import.meta.url));
const QUIZ = path.join(__d, '..');
const D=__d;
const f=[];const ok=(c,m)=>{console.log((c?'  PASS ':'  FAIL ')+m);if(!c)f.push(m)};
const inner=fs.readFileSync(path.join(QUIZ,'artifact.html'),'utf8');
fs.writeFileSync(D+'/s0.html',`<!doctype html><html><head><meta charset="utf8"><title>host</title><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${inner}</body></html>`);
const b=await launchBrowser();

// 学習記録が250行ある状況（＝3ページ必要）
const many=[];
for(let i=0;i<250;i++){
  const at=new Date(Date.UTC(2026,0,1+i,9,0,0)).toISOString();
  many.push({'記録':'r'+i,'モード':'全範囲','出題数':10,'正解数':7,'正答率':0.7,
    '明細':'@'+at+'|1:1','date:日時:start':at,'date:日時:is_datetime':1,url:'https://app.notion.com/p/'+String(i).padStart(32,'0')});
}
const stub = (rows, opts={}) => `
window.__ROWS=${JSON.stringify(rows)};window.__CALLS=[];window.__WRITES=[];
window.claude={use:n=>Promise.resolve(n==='mcp'?{
 callTool:(s,t,i)=>{
   if(t==='notion-create-pages'){window.__WRITES.push(i);return Promise.resolve({payload:{}});}
   if(i&&i.data&&i.data.view_url&&i.data.view_url.indexOf('c68a3cb4')>=0){
     window.__CALLS.push(i.data.start_cursor||'first');
     const start=i.data.start_cursor?Number(i.data.start_cursor):0;
     const page=window.__ROWS.slice(start,start+100);
     const more=start+100<window.__ROWS.length;
     return new Promise(r=>setTimeout(()=>r({payload:{results:page,has_more:more,next_cursor:more?String(start+100):null}}),${opts.delay||0}));
   }
   return Promise.resolve({payload:{results:[],has_more:false}});
 },watchTool:()=>()=>{},listTools:()=>Promise.resolve([])}
:n==='artifact'?{publish:h=>{window.__PUB=h;return Promise.resolve()}}:null)};`;

console.log('\n【修正1】学習記録が100行を超えても全部読むか');
{
  const c=await b.newContext({viewport:{width:375,height:812}});
  await c.addInitScript(stub(many));
  const p=await c.newPage();
  await p.goto('http://localhost:8790/s0.html',{waitUntil:'load'});
  await p.locator('#syncLine.ok').waitFor({timeout:15000});
  const calls=await p.evaluate(()=>window.__CALLS);
  ok(calls.length===3,`3ページ読んだ（250行）: ${calls.length}ページ  ${JSON.stringify(calls)}`);
  ok(/250件 取り込み/.test(await p.locator('#syncLine').innerText()),'250件すべて取り込んだ');
  ok((await p.evaluate(()=>window.__WRITES.length))===0,'既存ぶんを送り直していない');
  await c.close();
}

console.log('\n【修正1b】読み切れないときは送信を見送るか');
{
  const huge=[];for(let i=0;i<2500;i++)huge.push(many[i%250]);
  const c=await b.newContext({viewport:{width:375,height:812}});
  await c.addInitScript(stub(huge));
  const p=await c.newPage();
  await p.goto('http://localhost:8790/s0.html',{waitUntil:'load'});
  await p.locator('#screenHome:not(.hidden)').waitFor();
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  for(let i=0;i<10;i++){await p.locator('#qOpts .opt').nth(0).click();
    await p.locator('#qVerdict:not(.hidden)').waitFor();await p.locator('#nextBtn').click();}
  await p.locator('#screenResult:not(.hidden)').waitFor();
  await p.waitForTimeout(3000);
  const t=await p.locator('#syncLine').innerText().catch(()=>'');
  ok((await p.evaluate(()=>window.__WRITES.length))===0,'全部読めていないときは書き込まない（重複防止）');
  await c.close();
}

console.log('\n【修正2】同期の多重実行で二重送信しないか');
{
  const c=await b.newContext({viewport:{width:375,height:812}});
  await c.addInitScript(stub([], {delay:1200}));   // 応答を遅くして重ねる
  const p=await c.newPage();
  await p.goto('http://localhost:8790/s0.html',{waitUntil:'load'});
  await p.locator('#screenHome:not(.hidden)').waitFor();
  await p.locator('#modeAll').click();             // 起動時の同期がまだ走っている最中に
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  for(let i=0;i<10;i++){await p.locator('#qOpts .opt').nth(0).click();
    await p.locator('#qVerdict:not(.hidden)').waitFor();await p.locator('#nextBtn').click();}
  await p.locator('#screenResult:not(.hidden)').waitFor();
  await p.waitForTimeout(4000);
  const w=await p.evaluate(()=>window.__WRITES);
  const rows=w.flatMap(x=>x.pages||[]);
  ok(rows.length<=1,`同じセッションを重ねて書かない: 書き込み行数 ${rows.length}`);
  await c.close();
}

console.log('\n【修正3】リセット後に古い記録が戻らないか');
{
  const c=await b.newContext({viewport:{width:375,height:812}});
  await c.addInitScript(stub(many.slice(0,5), {delay:2500}));
  const p=await c.newPage();
  p.once('dialog',d=>d.accept());
  await p.goto('http://localhost:8790/s0.html',{waitUntil:'load'});
  await p.locator('#screenHome:not(.hidden)').waitFor();
  await p.locator('#resetBtn').click();            // 同期の応答が返る前にリセット
  await p.waitForTimeout(4000);
  ok(await p.locator('#stSeen').textContent()==='0','リセット後に履歴が復活しない');
  ok((await p.locator('#histList .histrow').count())===0,'セッション履歴も戻らない');
  await c.close();
}

console.log('\n【修正4】選択肢に空欄があっても answer:"" は通らないか');
{
  const c=await b.newContext({viewport:{width:375,height:812}});
  const p=await c.newPage();
  await p.route('**/quiz-data.json', r=>r.fulfill({contentType:'application/json',body:JSON.stringify([
    {id:1,chapter:1,tag:'#1',q:'正常な問題',options:['あ','い','う','え'],answer:0,explanation:'x',addedAt:'2026-01-01'},
    {id:2,chapter:1,tag:'#1',q:'選択肢が空 かつ 正解未設定',options:['','い','う','え'],answer:'',explanation:'x',addedAt:'2026-01-02'}])}));
  await p.goto('http://localhost:8777/index.html',{waitUntil:'networkidle'});
  await p.locator('#screenHome:not(.hidden)').waitFor();
  ok(await p.locator('#stTotal').textContent()==='1','壊れた問題は取り込まれない（1問だけ）');
  await c.close();
}

console.log('\n【出典】実データに出典が出るか');
{
  const c=await b.newContext({viewport:{width:375,height:812}});
  await c.addInitScript(stub([]));
  const p=await c.newPage();
  await p.goto('http://localhost:8790/s0.html',{waitUntil:'load'});
  await p.locator('#screenHome:not(.hidden)').waitFor();
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  let withSrc=0;
  for(let i=0;i<10;i++){
    await p.locator('#qOpts .opt').nth(0).click();
    await p.locator('#qVerdict:not(.hidden)').waitFor();
    if(await p.locator('#qVerdict .srcline a').count()) withSrc++;
    await p.locator('#nextBtn').click();
  }
  ok(withSrc>0,`10問中 ${withSrc}問に出典リンクが出た`);
  await c.close();
}

await b.close();
console.log('\n'+(f.length?`FAILURES (${f.length}):\n - `+f.join('\n - '):'ALL PASS'));
process.exit(f.length?1:0);
