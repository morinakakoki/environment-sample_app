const {chromium}=require('playwright');const fs=require('fs');const {execSync}=require('child_process');
const os=require('os'),path=require('path');
const SP=fs.mkdtempSync(path.join(os.tmpdir(),'sec-'));
const SRC=path.join(__dirname,'..');
const wrap=(b,o)=>fs.writeFileSync(o,`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>[hidden]{display:none!important}</style></head><body>${b}</body></html>`);
let bad=0;
(async()=>{
const br=await chromium.launch({executablePath:process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});

const run=async(name,json,marker,embeds)=>{
  const d=SP+'/re_'+name;
  fs.rmSync(d,{recursive:true,force:true});fs.mkdirSync(d);
  fs.copyFileSync(SRC+'/index.html',d+'/index.html');
  fs.copyFileSync(SRC+'/embed-bank.py',d+'/embed-bank.py');
  fs.writeFileSync(d+'/e.json',JSON.stringify(json));
  let embedErr=null;
  for(let k=0;k<embeds;k++){
    try{ execSync('python3 embed-bank.py e.json',{cwd:d,stdio:'pipe'}); }
    catch(e){ embedErr=(e.stderr||e.stdout||'').toString().trim().slice(0,90); break; }
  }
  wrap(fs.readFileSync(d+'/index.html','utf8'), d+'/p.html');
  const p=await (await br.newContext()).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
  await p.goto('file://'+d+'/p.html',{waitUntil:'load'});await p.waitForTimeout(350);
  const fired=await p.evaluate(m=>!!window[m],marker);
  const booted=await p.evaluate(()=>typeof QUESTIONS!=='undefined');
  if(fired||!booted) bad++;
  console.log(`  ${name.padEnd(16)} 埋込x${embeds}  任意JS実行:${fired?'★実行された':'なし ✓'}  起動:${booted?'○ ✓':'× ✗'}  ${embedErr?'埋込中止:'+embedErr:''}`);
  await p.context().close();
};

const base={meta:{deepDiveCategories:["A"],checkCriteria:["結論が最初","60秒以内","軸と矛盾なし","具体あり","前提共有"],
  logFormat:"| 日付 | ID | 結果 | 崩れた基準の番号 | 次にやること |"},categories:[{id:"A",name:"通常"}]};
const q=(t,extra)=>Object.assign({},base,{questions:[{id:"A-01",category:"A",text:"普通"},Object.assign({id:"A-02",category:"A",text:t},extra||{})]});

console.log('--- 悪意ある質問バンクからの攻撃（任意JS実行を狙う） ---');
await run('BANKEND_1回', q("/* BANK:END */ ; window.__PWN_END=1 ; /*"), '__PWN_END', 1);
await run('BANKEND_2回', q("/* BANK:END */ ; window.__PWN_END=1 ; /*"), '__PWN_END', 2);
await run('BANKEND_3回', q("/* BANK:END */ ; window.__PWN_END=1 ; /*"), '__PWN_END', 3);
await run('BANKSTART',   q("/* BANK:START */ ; window.__PWN_ST=1 ; /*"), '__PWN_ST', 2);
await run('closeScript', q("</script><script>window.__PWN_CS=1</script>"), '__PWN_CS', 2);
await run('dblEscape',   q("<!--<script>window.__PWN_DBL=1;//"), '__PWN_DBL', 2);
await run('htmlComment', q("<!-- 壊れるか"), '__PWN_NONE', 2);
await run('lineSep',     q("a b c"), '__PWN_NONE', 2);
await run('imgOnerror',  q('<img src=x onerror="window.__PWN_IMG=1">'), '__PWN_IMG', 2);

console.log('\n--- プロトタイプ由来キーの表示 ---');
const d=SP+'/re_proto';fs.rmSync(d,{recursive:true,force:true});fs.mkdirSync(d);
fs.copyFileSync(SRC+'/index.html',d+'/index.html');fs.copyFileSync(SRC+'/embed-bank.py',d+'/embed-bank.py');
fs.writeFileSync(d+'/e.json',JSON.stringify(Object.assign({},base,{
  categories:[{id:"A",name:"通常"},{id:"toString",name:"文字列化"},{id:"__proto__",name:"プロト"}],
  questions:[{id:"A-01",category:"toString",text:"toString質問"},{id:"A-02",category:"__proto__",text:"proto質問"}]})));
execSync('python3 embed-bank.py e.json',{cwd:d,stdio:'pipe'});
wrap(fs.readFileSync(d+'/index.html','utf8'),d+'/p.html');
const p=await (await br.newContext()).newPage();
await p.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
await p.goto('file://'+d+'/p.html',{waitUntil:'load'});await p.waitForTimeout(300);
console.log('  Object.prototype 汚染:',await p.evaluate(()=>({}).name!==undefined||({}).プロト!==undefined)?'★汚染':'なし ✓');
console.log('  CAT_NAME["toString"] :',JSON.stringify(await p.evaluate(()=>String(CAT_NAME['toString']))).slice(0,60));
await p.locator('.mode[data-mode="random"]').click();await p.waitForTimeout(200);
for(let i=0;i<2;i++){
  const m=(await p.locator('.qmeta').textContent()).replace(/\s+/g,' ');
  console.log('  表示タグ:',JSON.stringify(m.slice(0,50)));
  if(/native code|object Object/.test(m)){console.log('   ✗ 内部表現が漏れている');bad++;}
  await p.locator('[data-act="pass"]').click();await p.waitForTimeout(120);
}
await br.close();
console.log('\n=========== '+(bad?bad+' 件の問題が残存':'全攻撃を防御 ✓')+' ===========');
process.exit(bad?1:0);
})();
