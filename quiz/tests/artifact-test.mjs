import { launchBrowser } from './browser.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __d = path.dirname(fileURLToPath(import.meta.url));
const QUIZ = path.join(__d, '..');
// 問題数はデータから読む。増えるたびにテストが壊れないように。
const N = String(JSON.parse(fs.readFileSync(path.join(QUIZ,'quiz-data.json'),'utf8')).length);

const OUT=__d;
const fail=[]; const ok=(c,m)=>{console.log((c?'  PASS ':'  FAIL ')+m); if(!c) fail.push(m);};
const b=await launchBrowser();

for (const [scheme, stamp] of [['light',null],['dark',null],['light','dark'],['dark','light']]) {
  const c=await b.newContext({viewport:{width:375,height:812},deviceScaleFactor:2,colorScheme:scheme});
  const p=await c.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error'&&!((m.location()&&m.location().url)||'').includes('favicon'))errs.push(m.text())});
  const reqs=[]; p.on('request',r=>{ if(!r.url().startsWith('http://localhost:8777/host')&&!r.url().includes('artifact-inner')) reqs.push(r.url()); });
  await p.goto(`http://localhost:8790/host.html${stamp?'?theme='+stamp:''}`, {waitUntil:'load'});
  const f=p.frameLocator('#f');
  await f.locator('#screenHome:not(.hidden)').waitFor({timeout:5000});
  const label=`scheme=${scheme}${stamp?' stamp='+stamp:' (system)'}`;
  ok(await f.locator('#stTotal').textContent()===N, `${label}: 48問を fetch なしで読めた`);
  ok(await f.locator('#themeBtn').isHidden(), `${label}: 自前テーマボタンは非表示（ホストに委ねる）`);
  const eff = stamp || scheme;
  const bg = await p.evaluate(()=>getComputedStyle(document.getElementById('f').contentDocument.body).backgroundColor);
  const wantDark = eff==='dark';
  ok(wantDark ? bg==='rgb(15, 19, 24)' : bg==='rgb(244, 246, 248)', `${label}: 背景が${wantDark?'ダーク':'ライト'} (${bg})`);
  ok(errs.length===0, `${label}: エラーなし`+(errs.length?': '+errs[0]:''));
  if (scheme==='dark'&&!stamp) await p.screenshot({path:OUT+'/10-artifact-dark.png',fullPage:false});
  if (scheme==='light'&&!stamp) await p.screenshot({path:OUT+'/11-artifact-light.png',fullPage:false});
  await c.close();
}

// 外部リクエストが一切ないこと（CSPで落ちる依存がない＝完全自己完結）
const c=await b.newContext({viewport:{width:375,height:812}});
const p=await c.newPage();
const ext=[];
p.on('request',r=>{ if(!r.url().startsWith('http://localhost:8790/')) ext.push(r.url()); });
await p.goto('http://localhost:8790/host.html',{waitUntil:'load'});
await p.frameLocator('#f').locator('#screenHome:not(.hidden)').waitFor();
ok(ext.length===0, '外部リクエストゼロ（自己完結）'+(ext.length?': '+ext.join(', '):''));

// ひととおり解けるか
const f=p.frameLocator('#f');
await f.locator('#modeAll').click();
await f.locator('#screenQuiz:not(.hidden)').waitFor();
for(let i=0;i<10;i++){ await f.locator('#qOpts .opt').nth(0).click();
  await f.locator('#qVerdict:not(.hidden)').waitFor(); await f.locator('#nextBtn').click(); }
await f.locator('#screenResult:not(.hidden)').waitFor();
ok(await f.locator('#rsTotal').textContent()==='10','10問解いて結果画面まで到達');
ok((await f.locator('#rsChapters .chaprow').count())>0,'章別スコアが出る');
const ls=await p.frames()[1].evaluate(()=>JSON.parse(localStorage.getItem('gcpQuiz.v1')));
ok(Object.keys(ls.stats).length===10,'localStorage に学習記録が残る（再発行しても消えない）');
await b.close();
console.log('\n'+(fail.length?'FAILURES ('+fail.length+'):\n - '+fail.join('\n - '):'ALL PASS'));
process.exit(fail.length?1:0);
