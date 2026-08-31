import { launchBrowser } from './browser.mjs';
import fs from 'fs';
const f=[];const ok=(c,m)=>{console.log((c?'  PASS ':'  🐛 BUG ')+m);if(!c)f.push(m)};

// Notion に「新しいセッション20件」が既にある状態を作る
const remote=[];
for(let i=0;i<20;i++){
  const at=new Date(Date.UTC(2026,11,1+i,12,0,0)).toISOString();   // 未来＝ローカルより新しい
  remote.push({'記録':'既存'+i,'モード':'全範囲','出題数':10,'正解数':9,'正答率':0.9,
    '明細':'@'+at+'|1:1','date:日時:start':at,'date:日時:is_datetime':1,
    url:'https://app.notion.com/p/'+String(i).padStart(32,'0')});
}
const STUB=`
const online = location.search.indexOf('ok=1')>=0;
window.__LOG = online ? ${JSON.stringify(remote)} : [];
window.__WRITES=[];
window.claude={use:n=>Promise.resolve(n==='mcp'?{
  callTool:(s,t,i)=>{
    if(t==='notion-create-pages'){
      if(!online) return Promise.reject(Object.assign(new Error('offline'),{code:'server_unavailable',retryable:true}));
      window.__WRITES.push(i); i.pages.forEach(p=>window.__LOG.push({'明細':p.properties['明細'],'date:日時:start':p.properties['date:日時:start']}));
      return Promise.resolve({payload:{}});
    }
    if(i&&i.data&&i.data.view_url&&i.data.view_url.indexOf('c68a3cb4')>=0){
      if(!online) return Promise.reject(Object.assign(new Error('offline'),{code:'server_unavailable',retryable:true}));
      return Promise.resolve({payload:{results:window.__LOG,has_more:false}});
    }
    return Promise.resolve({payload:{results:[],has_more:false}});
  },watchTool:()=>()=>{},listTools:()=>Promise.resolve([])}:null)};`;

const b=await launchBrowser();
const c=await b.newContext({viewport:{width:375,height:812}});
await c.addInitScript(STUB);
const p=await c.newPage();

console.log('\n① オフラインで10問解く（Notionには送れない）');
await p.goto('http://localhost:8790/s0.html',{waitUntil:'load'});
await p.locator('#screenHome:not(.hidden)').waitFor();
await p.locator('#modeAll').click();
await p.locator('#screenQuiz:not(.hidden)').waitFor();
for(let i=0;i<10;i++){await p.locator('#qOpts .opt').nth(0).click();
  await p.locator('#qVerdict:not(.hidden)').waitFor();await p.locator('#nextBtn').click();}
await p.locator('#screenResult:not(.hidden)').waitFor();
await p.locator('#toHomeBtn').click();
await p.waitForTimeout(800);
let ls=await p.evaluate(()=>JSON.parse(localStorage.getItem('gcpQuiz.v1')));
const offlineAt=ls.sessions[0].at;
ok(ls.sessions.length===1 && !!ls.sessions[0].detail,'未送信のセッションが手元に残っている');

console.log('\n② オンラインに戻る（Notionには既に新しい20件がある）');
await p.goto('http://localhost:8790/s0.html?ok=1',{waitUntil:'load'});
await p.locator('#screenHome:not(.hidden)').waitFor();
await p.waitForTimeout(2500);
ls=await p.evaluate(()=>JSON.parse(localStorage.getItem('gcpQuiz.v1')));
const stillThere = ls.sessions.some(x=>x.at===offlineAt);
const writes = await p.evaluate(()=>window.__WRITES.length);
const pushedIt = await p.evaluate(at=>window.__LOG.some(r=>String(r['明細']||'').indexOf('@'+at)===0), offlineAt);
console.log(`     ローカルに残存: ${stillThere} / 書き込み回数: ${writes} / Notionに届いた: ${pushedIt}`);
ok(pushedIt,'オフラインで解いた記録が Notion に送られた');

await b.close();
console.log('\n'+(f.length?`確認された不具合 ${f.length}件`:'不具合なし'));
process.exit(f.length?1:0);
