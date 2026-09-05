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
const QROWS={results:[],has_more:false};

// Notion をメモリ上で再現するスタブ（読み書き両方）
const STUB=(seedLog)=>`
window.__LOG=${JSON.stringify(seedLog)};window.__WRITES=[];
window.claude={use:n=>Promise.resolve(n==='mcp'?{
  callTool:(s,t,i)=>{
    if(t==='notion-query-data-sources'){
      const isLog = i.data.view_url.indexOf('c68a3cb4')>=0;
      return Promise.resolve({payload: isLog? {results:window.__LOG,has_more:false} : ${JSON.stringify(QROWS)}});
    }
    if(t==='notion-create-pages'){
      window.__WRITES.push(i);
      i.pages.forEach(p=>{
        const q=p.properties;
        window.__LOG.push({'記録':q['記録'],'モード':q['モード'],'出題数':q['出題数'],'正解数':q['正解数'],
          '正答率':q['正答率'],'明細':q['明細'],'date:日時:start':q['date:日時:start'],'date:日時:is_datetime':1,
          url:'https://app.notion.com/p/'+Math.random().toString(16).slice(2).padEnd(32,'0')});
      });
      return Promise.resolve({payload:{pages:[]}});
    }
    return Promise.reject(Object.assign(new Error('x'),{code:'bad_request'}));
  },watchTool:()=>()=>{},listTools:()=>Promise.resolve([])}
:n==='artifact'?{publish:()=>Promise.resolve()}:null)};`;

const b=await launchBrowser();

console.log('\n【端末A】10問解いて Notion に送る');
const cA=await b.newContext({viewport:{width:375,height:812}});
await cA.addInitScript(STUB([]));
const pA=await cA.newPage();
const errA=[];pA.on('pageerror',e=>errA.push(e.message));
await pA.goto('http://localhost:8790/s0.html',{waitUntil:'load'});
await pA.locator('#screenHome:not(.hidden)').waitFor();
await pA.locator('#modeAll').click();
await pA.locator('#screenQuiz:not(.hidden)').waitFor();
const wrongIds=[];
for(let i=0;i<10;i++){
  const qt=await pA.locator('#qText').textContent();
  const correctText=await pA.evaluate(async t=>{const d=JSON.parse(document.getElementById('quizData').textContent);
    const r=(Array.isArray(d)?d:d.questions).find(x=>x.q===t);return r?r.options[r.answer]:null;},qt);
  const shown=await pA.locator('#qOpts .opt .txt').allTextContents();
  const ci=shown.indexOf(correctText);
  // 前半は正解、後半はわざと不正解
  const pick = i<5 ? ci : (ci===0?1:0);
  if(i>=5) wrongIds.push(qt);
  await pA.locator('#qOpts .opt').nth(pick).click();
  await pA.locator('#qVerdict:not(.hidden)').waitFor();
  await pA.locator('#nextBtn').click();
}
await pA.locator('#screenResult:not(.hidden)').waitFor();
ok(await pA.locator('#rsCorrect').textContent()==='5','端末A: 5問正解');
await pA.locator('#toHomeBtn').click();
await pA.locator('#syncLine.ok').waitFor({timeout:6000});
const log=await pA.evaluate(()=>window.__LOG);
ok(log.length===1,'Notion に1行書かれた');
const detail=log[0]['明細'];
ok(/^@\d{4}-\d\d-\d\dT[\d:.]+Z\|/.test(detail),'明細に正確な日時が入る: '+detail.slice(0,32)+'…');
ok(detail.split(',').length===10,'10問ぶんの明細: '+detail.split(',').length);
ok(log[0]['正解数']===5&&log[0]['出題数']===10,'件数が正しい');
ok(errA.length===0,'端末A: 例外なし'+(errA.length?': '+errA[0]:''));
const wrongA=await pA.locator('#stWrong').textContent();
ok(wrongA==='5','端末A: 要復習5問');

console.log('\n【端末B】まっさらな端末で開く（← これが本題）');
const cB=await b.newContext({viewport:{width:375,height:812}});
await cB.addInitScript(STUB(log));
const pB=await cB.newPage();
const errB=[];pB.on('pageerror',e=>errB.push(e.message));
await pB.goto('http://localhost:8790/s0.html',{waitUntil:'load'});
await pB.locator('#screenHome:not(.hidden)').waitFor();
await pB.locator('#syncLine.ok').waitFor({timeout:6000});
ok(await pB.locator('#stSeen').textContent()==='10','端末B: 挑戦済み10問を引き継いだ');
ok(await pB.locator('#stWrong').textContent()==='5','端末B: 要復習5問を引き継いだ');
ok(await pB.locator('#stAcc').textContent()==='50%','端末B: 正答率50%');
ok((await pB.locator('#histList .histrow').count())===1,'端末B: セッション履歴も引き継いだ');
ok(!(await pB.locator('#modeWrong').isDisabled()),'端末B: 「間違いのみ」が使える');
await pB.locator('#modeWrong').click();
await pB.locator('#screenQuiz:not(.hidden)').waitFor();
ok((await pB.locator('#qCount').textContent()).split('/')[1].trim()==='5','端末B: 間違えた5問が出る');
ok(errB.length===0,'端末B: 例外なし'+(errB.length?': '+errB[0]:''));

console.log('\n【二重送信しないか】端末Bをもう一度開く');
const pB2=await cB.newPage();
await pB2.goto('http://localhost:8790/s0.html',{waitUntil:'load'});
await pB2.locator('#syncLine.ok').waitFor({timeout:6000});
const w=await pB2.evaluate(()=>window.__WRITES.length);
ok(w===0,'既に Notion にあるセッションは送り直さない: 書き込み'+w+'回');

console.log('\n【オフライン】書き込みが失敗しても記録は残るか');
const cC=await b.newContext({viewport:{width:375,height:812}});
await cC.addInitScript(`window.claude={use:n=>Promise.resolve(n==='mcp'?{
  callTool:()=>Promise.reject(Object.assign(new Error('x'),{code:'server_unavailable',retryable:true})),
  watchTool:()=>()=>{},listTools:()=>Promise.resolve([])}:null)};`);
const pC=await cC.newPage();
await pC.goto('http://localhost:8790/s0.html',{waitUntil:'load'});
await pC.locator('#screenHome:not(.hidden)').waitFor();
await pC.locator('#modeAll').click();
await pC.locator('#screenQuiz:not(.hidden)').waitFor();
for(let i=0;i<10;i++){await pC.locator('#qOpts .opt').nth(0).click();
  await pC.locator('#qVerdict:not(.hidden)').waitFor();await pC.locator('#nextBtn').click();}
await pC.locator('#screenResult:not(.hidden)').waitFor();
await pC.locator('#toHomeBtn').click();
await pC.waitForTimeout(1500);
ok(await pC.locator('#stSeen').textContent()==='10','送信できなくても手元の記録は残る');
const t=await pC.locator('#syncLine').innerText();
ok(/送り直します/.test(t),'次回送り直す旨を出す: '+t.split('\n')[0]);
const ls=await pC.evaluate(()=>JSON.parse(localStorage.getItem('gcpQuiz.v1')));
ok(!!ls.sessions[0].detail,'未送信ぶんの明細が保存されている（次回の再送に使う）');

await b.close();
console.log('\n'+(f.length?`FAILURES (${f.length}):\n - `+f.join('\n - '):'ALL PASS'));
process.exit(f.length?1:0);
