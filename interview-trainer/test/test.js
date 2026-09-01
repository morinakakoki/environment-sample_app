const {chromium} = require('playwright');
const SP=require('os').tmpdir();
const URL='file://'+SP+'/wrapped.html';
let fails=0;
const ok=(c,m)=>{console.log((c?'  PASS ':'  FAIL ')+m); if(!c)fails++;};

(async()=>{
const b=await chromium.launch({executablePath:process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:375,height:667},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const p=await ctx.newPage();
const errs=[];
p.on('pageerror',e=>errs.push('pageerror: '+e.message));
p.on('console',m=>{if(m.type()!=='error')return;
  const t=m.text();
  // このテストは意図的にネットワークを遮断しているので、Google Fonts の
  // 読み込み失敗は想定内。アプリ由来のエラーだけを拾う。
  if(/Failed to load resource/.test(t)) return;
  errs.push('console.error: '+t);});

// block network so we prove no external fetch is required to run
const blocked=[];
await p.route('**/*',r=>{const u=r.request().url();
  if(u.startsWith('file://')) return r.continue();
  blocked.push(u); return r.abort();});

await p.goto(URL,{waitUntil:'load'});
await p.waitForTimeout(400);

console.log('\n--- 1. トップ: モード選択 ---');
ok(await p.locator('.mode[data-mode="random"]').isVisible(),'全体ランダムが表示される');
ok(await p.locator('.mode[data-mode="deep"]').isVisible(),'深掘り対象のみが表示される');
const nCats=await p.locator('.cat').count();
ok(nCats===11,`カテゴリA〜K = 11個 (got ${nCats})`);
ok((await p.locator('.mode[data-mode="deep"] .mode-ico').textContent())==='ABCDH','深掘り = ABCDH');
const isSample=await p.evaluate(()=>!!BANK.__sample__);
ok(await p.locator('.banner').count()===(isSample?1:0),
   'サンプル警告バナーが __sample__ と一致 (sample='+isSample+')');
// no horizontal scroll
let sw=await p.evaluate(()=>document.documentElement.scrollWidth);
ok(sw<=375,`横スクロールなし (scrollWidth=${sw})`);

console.log('\n--- 2. 出題 + 60秒タイマー ---');
// まず全体ランダムに入れることを確認
await p.locator('.mode[data-mode="random"]').click();
ok(await p.locator('.qtext').isVisible(),'全体ランダムで質問が出る');
// タイマーの検証はK系（計時なし）に当たると手順が変わるので、
// K を含まない「深掘り対象のみ」に切り替えて行う。
await p.locator('#rail-btn').click(); await p.waitForTimeout(120);
await p.locator('.mode[data-mode="deep"]').click(); await p.waitForTimeout(120);
ok(await p.evaluate(()=>!isReverse(S.q)),'深掘りモードにK系は出ない');
ok(await p.locator('.qtext').isVisible(),'質問文が表示される');
ok(await p.locator('.tag.id').isVisible(),'IDタグが表示される');
const qm=await p.locator('.qmeta').textContent();
console.log('    qmeta:',qm.trim().replace(/\s+/g,' '));
ok(/サンプル/.test(qm),'出典タグが表示される');

// 「答え終わった」が計時中にスクロールなしで見えるか
await p.locator('[data-act="start"]').click();
await p.waitForTimeout(300);
ok(await p.locator('#timer').isVisible(),'タイマーが表示される');
const dbox=await p.locator('[data-act="done"]').boundingBox();
ok(dbox && dbox.y+dbox.height<=667,`「答え終わった」が初期表示内に収まる (bottom=${dbox?Math.round(dbox.y+dbox.height):'?'} / 667)`);
const dig0=await p.locator('#digits').textContent();
ok(/^0:5[0-9]$|^1:00$/.test(dig0),`残り時間が減っている (${dig0})`);

// 残り10秒で色が変わるか — 開始時刻を巻き戻して検証
await p.evaluate(()=>{S.startedAt=Date.now()-52000;});
await p.waitForTimeout(250);
ok(await p.locator('#timer.is-warn').count()===1,'残り10秒以下で is-warn に切り替わる');
const warnCol=await p.locator('#digits').evaluate(e=>getComputedStyle(e).color);
console.log('    warn color:',warnCol);

// 0秒で視覚合図＋超過カウントアップ
await p.evaluate(()=>{S.startedAt=Date.now()-63000;});
await p.waitForTimeout(250);
ok(await p.locator('#timer.is-over').count()===1,'0秒で is-over（視覚合図）に切り替わる');
const overTxt=await p.locator('#digits').textContent();
ok(overTxt.startsWith('+'),`超過分をカウントアップ (${overTxt})`);
ok((await p.locator('#dial-lab').textContent()).includes('超過'),'ラベルが「60秒 超過」になる');
const anim=await p.locator('.dial').evaluate(e=>getComputedStyle(e).animationName);
ok(anim==='strike','0秒で視覚合図アニメーションが走る');
// 音が鳴らないこと
ok(await p.evaluate(()=>!/new Audio|AudioContext|\.play\(\)/.test(document.documentElement.innerHTML)),'音声APIを一切使っていない');

console.log('\n--- 3. セルフチェック ---');
await p.locator('[data-act="done"]').click();
await p.waitForTimeout(200);
const nCrit=await p.locator('.crit').count();
ok(nCrit===5,`checkCriteria 5項目 (got ${nCrit})`);
ok((await p.locator('.crits').textContent()).includes('結論が最初'),'「結論が最初」が出ている');
ok(await p.locator('.crit-auto').count()===1,'60秒超過で「60秒以内」が自動チェックされる');
ok(await p.locator('.crit[data-crit="2"]').getAttribute('aria-pressed')==='true','自動チェックの aria-pressed=true');
ok((await p.locator('.elapsed b').textContent()).startsWith('1:0'),'話した時間が表示される');
// タップでトグル
await p.locator('.crit[data-crit="1"]').click();
ok(await p.locator('.crit[data-crit="1"]').getAttribute('aria-pressed')==='true','タップでチェックが付く');
await p.locator('.crit[data-crit="1"]').click();
ok(await p.locator('.crit[data-crit="1"]').getAttribute('aria-pressed')==='false','再タップで外れる');
await p.locator('.crit[data-crit="1"]').click();

console.log('\n--- 4/5. 判定 → ログ行 ---');
await p.locator('[data-act="judge"]').click();
await p.waitForTimeout(200);
ok(await p.locator('.verdict.y').count()===1,'チェック1個以上 → 🟡');
let line=await p.locator('#line').textContent();
console.log('    log:',line);
ok(/^\| \d{4}-\d{2}-\d{2} \| \S+ \| 🟡 \| 1,2 \| - \|$/.test(line),'ログ行の形式が | 日付 | ID | 結果 | 崩れた番号 | 次にやること |');
await p.locator('#next').fill('冒頭を「結論は〜」で始める');
await p.waitForTimeout(120);
line=await p.locator('#line').textContent();
ok(line.includes('冒頭を「結論は〜」で始める'),'「次にやること」がログ行に反映される');
ok(await p.locator('.dock-body .logline').first().textContent()===line,'dockの行も同時に更新される');
ok(await p.locator('#next').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))>=16,'入力欄 font-size>=16px (iOSズーム防止)');

console.log('\n--- 6. 次の問題へ / 記録の蓄積 ---');
await p.locator('[data-act="next"]').click();
await p.waitForTimeout(150);
ok(await p.locator('.qtext').isVisible(),'次の問題が出る');
ok(await p.locator('#dock-count').textContent()==='1','記録が1件溜まっている');

// 🟢/🔴 の判定経路は計時ありの問題で確かめたいので、K系を含まない
// カテゴリAに切り替える（全体ランダムだとK系に当たって手順が変わるため）。
await p.locator('#rail-btn').click(); await p.waitForTimeout(150);
await p.locator('.cat[data-cat="A"]').click(); await p.waitForTimeout(150);
ok(await p.locator('#dock-count').textContent()==='1','モードを変えても記録は消えない');
ok((await p.locator('.tag.id').textContent()).startsWith('A-'),'カテゴリAの問題が出る');

// 🟢 経路
await p.locator('[data-act="start"]').click();
await p.waitForTimeout(150);
await p.locator('[data-act="done"]').click();
await p.waitForTimeout(150);
ok(await p.locator('.crit[aria-pressed="true"]').count()===0,'60秒以内なら自動チェックは付かない');
await p.locator('[data-act="judge"]').click();
await p.waitForTimeout(150);
ok(await p.locator('.verdict.g').count()===1,'チェック0個 → 🟢 自動判定');
ok((await p.locator('#line').textContent()).includes('🟢 | - |'),'🟢のとき崩れた番号は「-」');

// 🔴 経路
await p.locator('[data-act="next"]').click();
await p.waitForTimeout(150);
await p.locator('[data-act="skip"]').click();
await p.waitForTimeout(150);
ok(await p.locator('.verdict.r').count()===1,'「言えなかった」→ 🔴');
ok(await p.locator('#dock-count').textContent()==='3','記録が3件');

console.log('\n--- 7. K系（逆質問）はタイマーなし ---');
await p.locator('#rail-btn').click();
await p.waitForTimeout(150);
await p.locator('.cat[data-cat="K"]').click();
await p.waitForTimeout(150);
ok(await p.locator('[data-act="start"]').count()===0,'K系に「開始」ボタンが無い');
ok(await p.locator('[data-act="rev-ok"]').isVisible(),'🟢 言える ボタンがある');
ok(await p.locator('[data-act="rev-ng"]').isVisible(),'🔴 言えない ボタンがある');
ok((await p.locator('.card').nth(1).textContent()).includes('タイマーを使いません'),'タイマーなしと明示されている');
await p.locator('[data-act="rev-ok"]').click();
await p.waitForTimeout(150);
ok(await p.locator('.verdict.g').count()===1,'K系で🟢が付く');
ok(await p.locator('.elapsed').count()===0,'K系の結果に「話した時間」が出ない');

console.log('\n--- 制約 ---');
ok(await p.evaluate(()=>{try{return localStorage.length===0}catch(e){return true}}),'localStorageに書き込んでいない');
const src=require('fs').readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
ok(!/localStorage|sessionStorage|indexedDB/.test(src),'保存APIをコードに含んでいない');
ok(!/fetch\(|XMLHttpRequest|import\s|<script[^>]+src=/.test(src),'外部fetch・外部スクリプトなし');
const ext=blocked.filter(u=>!u.startsWith('data:'));
console.log('    blocked external requests:',ext.length?ext.join(', '):'(fonts only, page still works)');
ok(ext.every(u=>u.includes('fonts.googleapis.com')||u.includes('fonts.gstatic.com')),'外部リソースはGoogle Fontsのみ');
sw=await p.evaluate(()=>document.documentElement.scrollWidth);
ok(sw<=375,`結果画面でも横スクロールなし (${sw})`);
// tap targets
const small=await p.evaluate(()=>[...document.querySelectorAll('button')]
  .map(b=>({t:(b.textContent||'').trim().slice(0,14),h:Math.round(b.getBoundingClientRect().height)}))
  .filter(x=>x.h>0&&x.h<44));
ok(small.length===0,'全ボタンの高さ>=44px '+(small.length?JSON.stringify(small):''));

console.log('\n--- まとめてコピー ---');
const allBtn=p.locator('[data-act="copyall"]');
ok(await allBtn.isVisible(),'「まとめてコピー」ボタンがある');
ok((await allBtn.textContent()).includes('全4行'),'ボタンに件数が出る');

console.log('\n--- ダークテーマ ---');
await p.emulateMedia({colorScheme:'dark'});
await p.waitForTimeout(200);
const dark=await p.evaluate(()=>{const cs=getComputedStyle(document.body);
  const q=document.querySelector('.card');
  return {bodyBg:cs.backgroundColor,bodyFg:cs.color,cardBg:q?getComputedStyle(q).backgroundColor:null};});
console.log('   ',JSON.stringify(dark));
ok(dark.bodyBg!=='rgba(0, 0, 0, 0)','ダークでも body に背景が塗られている');
const lum=s=>{const m=s.match(/\d+/g);return m?(0.299*m[0]+0.587*m[1]+0.114*m[2]):null;};
ok(lum(dark.bodyBg)<80 && lum(dark.bodyFg)>150,'ダークで地が暗く文字が明るい');
await p.screenshot({path:SP+'/shot-dark.png',fullPage:true});

await p.emulateMedia({colorScheme:'light'});
await p.waitForTimeout(150);
await p.locator('#rail-btn').click(); await p.waitForTimeout(200);
await p.screenshot({path:SP+'/shot-home.png',fullPage:true});
await p.locator('.mode[data-mode="deep"]').click(); await p.waitForTimeout(150);
await p.locator('[data-act="start"]').click(); await p.waitForTimeout(150);
await p.evaluate(()=>{S.startedAt=Date.now()-53000;}); await p.waitForTimeout(300);
await p.screenshot({path:SP+'/shot-timer.png'});

console.log('\n--- JSエラー ---');
ok(errs.length===0,'コンソールエラーなし '+(errs.length?JSON.stringify(errs.slice(0,4)):''));

await b.close();
console.log('\n================ '+(fails?fails+' FAILED':'ALL PASSED')+' ================');
process.exit(fails?1:0);
})().catch(e=>{console.error('HARNESS ERROR',e);process.exit(2)});
