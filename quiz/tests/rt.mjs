import { launchBrowser } from './browser.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __d = path.dirname(fileURLToPath(import.meta.url));
const QUIZ = path.join(__d, '..');
// 問題数はデータから読む。増えるたびにテストが壊れないように。
const N = String(JSON.parse(fs.readFileSync(path.join(QUIZ,'quiz-data.json'),'utf8')).length);

const D=__d;
const fail=[];const ok=(c,m)=>{console.log((c?'  PASS ':'  FAIL ')+m);if(!c)fail.push(m)};
const inner=fs.readFileSync(path.join(QUIZ,'artifact.html'),'utf8');
const wrap=h=>`<!doctype html><html><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{color-scheme:light}body{margin:0;padding:0}[hidden]{display:none!important}</style></head><body>${h}</body></html>`;
fs.writeFileSync(D+'/rt0.html', wrap(inner));

// publish を差し替えて、保存されるHTMLを横取りするスタブ
const STUB=`window.claude={use:function(n){return Promise.resolve(n==='artifact'?{publish:function(h){window.__PUBLISHED=h;return Promise.resolve();}}:null);}};`;

const NEWQ=JSON.stringify([{id:900,chapter:8,tag:"#21",q:"追加テスト用の問題。Pub/Sub の配信保証の既定はどれですか。",options:["at-least-once","exactly-once","at-most-once","順序保証つきのexactly-once"],answer:0,explanation:"既定は at-least-once。重複し得るので下流で冪等にする。",addedAt:"2026-09-01"}]);

const b=await launchBrowser();
const c=await b.newContext({viewport:{width:375,height:812}});
await c.addInitScript(STUB);
const p=await c.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{if(m.type()==='error'&&!(m.location()&&m.location().url||'').includes('favicon'))errs.push(m.text())});
p.on('response',r=>{if(r.status()>=400)errs.push('HTTP '+r.status()+' '+r.url())});

console.log('== 1周目: 追加して保存 ==');
await p.goto('http://localhost:8790/rt0.html',{waitUntil:'load'});
await p.locator('#screenHome:not(.hidden)').waitFor({timeout:5000});
ok(await p.locator('#stTotal').textContent()===N,'テンプレートから描画され38問読めた');
await p.locator('#addBtn').click();
await p.locator('#screenAdd:not(.hidden)').waitFor();
await p.locator('#addTa').fill(NEWQ);
await p.locator('#addCheckBtn').click();
await p.locator('#addResult.ok').waitFor({timeout:3000});
const summary=(await p.locator('#addResult').innerText()).replace(/\n/g,' / ');
ok(new RegExp(`1問を追加します（このアプリに埋め込む分が ${Number(N)+1}問`).test(summary),'プレビュー: '+summary.slice(0,80));
ok(/新しい章/.test(summary),'新しい章として検出された');
ok(await p.locator('#addSaveWrap').isVisible(),'保存ボタンが出る（publish可能なので）');
await p.locator('#addSaveBtn').click();
await p.waitForFunction(()=>window.__PUBLISHED,null,{timeout:5000});
const published=await p.evaluate(()=>window.__PUBLISHED);
ok(published.startsWith('<!doctype html>'),'保存されるHTMLは doctype から始まる完全なドキュメント');
ok(!/screenAdd" class="hidden"[\s\S]{0,50}addTa[^>]*>.{5,}</.test(published),'貼り付けたテキストが保存版に残っていない');
fs.writeFileSync(D+'/rt1.html', published);
ok(errs.length===0,'1周目エラーなし'+(errs.length?': '+errs[0]:''));

console.log('\n== 2周目: 保存されたHTMLをそのまま開く ==');
const p2=await c.newPage();
const errs2=[];p2.on('pageerror',e=>errs2.push(e.message));
p2.on('console',m=>{if(m.type()==='error'&&!(m.location()&&m.location().url||'').includes('favicon'))errs2.push(m.text())});
await p2.goto('http://localhost:8790/rt1.html',{waitUntil:'load'});
await p2.locator('#screenHome:not(.hidden)').waitFor({timeout:5000});
ok(await p2.locator('#stTotal').textContent()===String(Number(N)+1),`保存版が${Number(N)+1}問で開けた`);
ok((await p2.locator('#chapBtns .btn').count())===8,'章が8つに増えた');
const ch8=await p2.locator('#chapBtns .btn').last().innerText();
ok(/第8章/.test(ch8),'第8章が出る: '+ch8.replace(/\n/g,' / '));
ok(errs2.length===0,'2周目エラーなし'+(errs2.length?': '+errs2[0]:''));

console.log('\n== 3周目: もう一度追加して、構造が再生産されるか ==');
await p2.locator('#addBtn').click();
await p2.locator('#addTa').fill(JSON.stringify([{id:901,chapter:8,tag:"#21",q:"2周目の追加テスト。",options:["あ","い","う","え"],answer:1,explanation:"構造の再生産を確認するための問題。",addedAt:"2026-09-02"}]));
await p2.locator('#addCheckBtn').click();
await p2.locator('#addResult.ok').waitFor({timeout:3000});
await p2.locator('#addSaveBtn').click();
await p2.waitForFunction(()=>window.__PUBLISHED,null,{timeout:5000});
const pub2=await p2.evaluate(()=>window.__PUBLISHED);
fs.writeFileSync(D+'/rt2.html', pub2);
// データ部分以外が1周目と一致するか（＝自己再生産が安定している）
const strip=h=>h.replace(/id="quizData">[\s\S]*?<\/script>/,'id="quizData">DATA</script>');
ok(strip(pub2)===strip(published),'データ以外の構造が完全に一致（自己再生産が安定）');
const d2=JSON.parse(pub2.match(/id="quizData">([\s\S]*?)<\/script>/)[1].replace(/<\\\//g,'</'));
ok((Array.isArray(d2)?d2:d2.questions).length===Number(N)+2,`${Number(N)+2}問になっている`);

console.log('\n== 重複idは弾かれるか ==');
const p3=await c.newPage();
await p3.goto('http://localhost:8790/rt1.html',{waitUntil:'load'});
await p3.locator('#screenHome:not(.hidden)').waitFor();
await p3.locator('#addBtn').click();
await p3.locator('#addTa').fill(JSON.stringify([{id:900,chapter:8,tag:"#21",q:"idが重複した問題",options:["あ","い","う","え"],answer:0,explanation:"弾かれるはず",addedAt:"2026-09-02"}]));
await p3.locator('#addCheckBtn').click();
await p3.locator('#addResult.ng').waitFor({timeout:3000});
ok(/新しく追加される問題がありませんでした/.test(await p3.locator('#addResult').innerText()),'重複idは弾かれ、警告が出る');
console.log('\n== 壊れたJSON ==');
await p3.locator('#addTa').fill('これはJSONじゃない');
await p3.locator('#addCheckBtn').click();
await p3.locator('#addResult.ng').waitFor({timeout:3000});
ok(/JSON として読めませんでした/.test(await p3.locator('#addResult').innerText()),'壊れたJSONは弾かれる');
ok(await p3.locator('#addSaveWrap').isHidden(),'その場合は保存ボタンが出ない');

await b.close();
console.log('\n'+(fail.length?'FAILURES ('+fail.length+'):\n - '+fail.join('\n - '):'ALL PASS'));
process.exit(fail.length?1:0);
