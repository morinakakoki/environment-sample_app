import { launchBrowser } from './browser.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __d = path.dirname(fileURLToPath(import.meta.url));
const QUIZ = path.join(__d, '..');
const D=__d;
const found=[];const chk=(bad,m)=>{console.log((bad?'  🐛 BUG  ':'  ok     ')+m);if(bad)found.push(m)};
const inner=fs.readFileSync(path.join(QUIZ,'artifact.html'),'utf8');
fs.writeFileSync(D+'/a0.html',`<!doctype html><html><head><meta charset="utf8"><title>ホスト側のタイトル</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${inner}</body></html>`);
const b=await launchBrowser();
const c=await b.newContext({viewport:{width:375,height:812}});
await c.addInitScript(`window.claude={use:n=>Promise.resolve(n==='artifact'?{publish:h=>{window.__PUB=h;return Promise.resolve();}}:null)};`);
const p=await c.newPage();
await p.goto('http://localhost:8790/a0.html',{waitUntil:'load'});
await p.locator('#screenHome:not(.hidden)').waitFor();

console.log('\n【1】「最近追加された問題」の並び順');
// 元の不具合: id を文字列で比べていたため "9" が "38" より新しい扱いになっていた。
// 現在は「追加日の新しい順 → 同じ日は未挑戦優先」なので、日付で並ぶことを確かめる。
{
  const rows = [];
  for (let i = 1; i <= 12; i++) {
    // id 9 をわざと古い日付にする。文字列比較に戻ったら先頭に来てしまう
    const day = (i === 9) ? '2026-08-01' : '2026-08-' + String(10 + i).padStart(2, '0');
    rows.push({id:i, chapter:1, tag:'#1', q:'Q'+i, options:['a'+i,'b','c','d'],
               answer:0, explanation:'e', addedAt:day});
  }
  const p9 = await c.newPage();
  await p9.route('**/quiz-data.json', r => r.fulfill({contentType:'application/json', body:JSON.stringify(rows)}));
  await p9.goto('http://localhost:8777/index.html', {waitUntil:'networkidle'});
  await p9.locator('#screenHome:not(.hidden)').waitFor();
  await p9.locator('#modeRecent').click();
  await p9.locator('#screenQuiz:not(.hidden)').waitFor();
  const order = [];
  for (let i = 0; i < 10; i++) {
    order.push(await p9.locator('#qText').textContent());
    await p9.locator('#qOpts .opt').nth(0).click();
    await p9.locator('#qVerdict:not(.hidden)').waitFor();
    await p9.locator('#nextBtn').click();
  }
  console.log('     出題順:', order.join(' '));
  chk(order.indexOf('Q9') >= 0 && order.indexOf('Q9') < 5,
      '最も古い Q9 が上位に来る（id の文字列比較に戻っている）');
  chk(order[0] !== 'Q12', '最新の Q12 が先頭に来ていない（日付順が壊れている）');
  await p9.close();
}

console.log('\n【2】確認したあとに本文を書き換えて保存すると、古い内容が保存されないか');
await p.locator('#addBtn').click();
const A=JSON.stringify([{id:801,chapter:2,tag:"#9",q:"確認したときの問題A",options:["あ","い","う","え"],answer:0,explanation:"A",addedAt:"2026-09-01"}]);
const B=JSON.stringify([{id:802,chapter:2,tag:"#9",q:"書き換えたあとの問題B",options:["か","き","く","け"],answer:1,explanation:"B",addedAt:"2026-09-01"}]);
await p.locator('#addTa').fill(A);
await p.locator('#addCheckBtn').click();
await p.locator('#addResult.ok').waitFor();
await p.locator('#addTa').fill(B);          // ← 確認せずに書き換える
const saveHidden = await p.locator('#addSaveWrap').isHidden();
const warned = /もう一度「内容を確認」/.test(await p.locator('#addResult').innerText());
chk(!saveHidden, '書き換えても保存ボタンが残る（古い内容が保存され得る）');
chk(!warned, '書き換えたことが画面に出ない');
// 再確認してから保存すれば、書き換え後の内容が入ること
await p.locator('#addCheckBtn').click();
await p.locator('#addResult.ok').waitFor();
await p.locator('#addSaveBtn').click();
await p.waitForFunction(()=>window.__PUB,null,{timeout:5000});
const pub=await p.evaluate(()=>window.__PUB);
chk(pub.includes('確認したときの問題A')||!pub.includes('書き換えたあとの問題B'),
    '再確認しても、保存されるのが書き換え後の内容にならない');

console.log('\n【3】保存版に焼かれるタイトル（ホストのタイトルを拾っていないか）');
const t=pub.match(/<title[^>]*>(.*?)<\/title>/)[1];
console.log('     保存版のタイトル:',JSON.stringify(t));
chk(t!=='データ基盤 復習クイズ','保存版のタイトルが本来のものと違う');

console.log('\n【4】問題文にHTMLが入っていても文字として出るか');
await p.goto('http://localhost:8790/a0.html',{waitUntil:'load'});
await p.locator('#screenHome:not(.hidden)').waitFor();
const xss=await p.evaluate(()=>{
  var d=JSON.parse(document.getElementById('quizData').textContent);
  var arr=Array.isArray(d)?d:d.questions;
  arr.push({id:999,chapter:1,tag:"#1",q:"<img src=x onerror=window.__XSS=1>タグは文字として出るか",
    options:["<b>太字にならない</b>","い","う","え"],answer:0,explanation:"<i>斜体にならない</i>",addedAt:"2026-12-31"});
  document.getElementById('quizData').textContent=JSON.stringify(arr);
  location.reload();return true;});
await p.waitForLoadState('load');
await p.locator('#screenHome:not(.hidden)').waitFor();
await p.locator('#modeRecent').click();
await p.locator('#screenQuiz:not(.hidden)').waitFor();
const qtxt=await p.locator('#qText').textContent();
const hasImg=await p.locator('#qText img').count();
const xssFired=await p.evaluate(()=>!!window.__XSS);
chk(hasImg>0||xssFired,'問題文のHTMLが実体化する（現状: '+(hasImg?'img生成':'文字列のまま')+'）');
console.log('     表示:',JSON.stringify(qtxt.slice(0,44)));
const optHtml=await p.locator('#qOpts .opt .txt').first().innerHTML();
chk(optHtml.includes('<b>'),'選択肢のHTMLが実体化する');

await b.close();
console.log('\n'+(found.length?`見つかった不具合 ${found.length}件:\n - `+found.join('\n - '):'不具合なし'));
