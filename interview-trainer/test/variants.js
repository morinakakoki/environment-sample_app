const {chromium}=require('playwright'); const fs=require('fs');
const SP=require('os').tmpdir();
const SRC=require('path').join(__dirname,'..','index.html');
let fails=0; const ok=(c,m)=>{console.log((c?'   PASS ':'   FAIL ')+m); if(!c)fails++;};

const base=fs.readFileSync(SRC,'utf8');
const S='/* BANK:START */', E='/* BANK:END */';
const build=bank=>{
  const i=base.indexOf(S), j=base.indexOf(E);
  const body=base.slice(0,i)+S+'\nconst BANK = '+JSON.stringify(bank,null,2).replace(/<\//g,'<\\/')+';\n'+base.slice(j);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>:root{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif;background:#fafaf9}img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>${body}</body></html>`;
};

const VARIANTS={
 'A: categories がオブジェクトマップ':{
   meta:{deepDiveCategories:['A','B'],checkCriteria:['結論が最初','60秒以内','軸と矛盾なし','具体あり','前提共有'],
         logFormat:'| 日付 | ID | 結果 | 崩れた基準の番号 | 次にやること |'},
   categories:{A:'転職理由・軸',B:'キャリアの一貫性',K:'逆質問'},
   questions:[{id:'A-01',category:'A',text:'Q1'},{id:'B-01',category:'B',text:'Q2'},{id:'K-01',category:'K',text:'Q3'}]},

 'B: checkCriteria がオブジェクト配列 + note':{
   meta:{deepDiveCategories:['A'],
         checkCriteria:[{no:1,label:'結論が最初',note:'一文目で言い切る'},{no:2,label:'60秒以内'},
                        {no:3,label:'軸と矛盾なし'},{no:4,label:'具体あり'},{no:5,label:'前提共有'}],
         logFormat:'| 日付 | ID | 結果 | 崩れた基準の番号 | 次にやること |'},
   categories:[{id:'A',name:'転職理由・軸'}],
   questions:[{id:'A-01',category:'A',text:'Q1'}]},

 'C: キー名ちがい (question / categoryId / sourceTag)':{
   meta:{deepDiveCategories:['A'],checkCriteria:['結論が最初','60秒以内','軸と矛盾なし','具体あり','前提共有']},
   categories:[{id:'A',name:'転職理由・軸'}],
   items:[{ID:'A-01',categoryId:'A',question:'キー名が違う質問',sourceTag:'出典X'}]},

 'D: categories キー無し / ID がハイフン無し':{
   meta:{deepDiveCategories:['A'],checkCriteria:['結論が最初','60秒以内','軸と矛盾なし','具体あり','前提共有']},
   questions:[{id:'A01',text:'ハイフン無しID'},{id:'K01',text:'逆質問だがハイフン無し'}]},

 'E: HTML特殊文字を含む質問文':{
   meta:{deepDiveCategories:['A'],checkCriteria:['結論が最初','60秒以内','軸と矛盾なし','具体あり','前提共有']},
   categories:[{id:'A',name:'A & B <重要>'}],
   questions:[{id:'A-01',category:'A',text:'「5% → 12%」<script>alert(1)</script> & "引用" は大丈夫？',source:'<出典>'}]},

 'F: logFormat が4列（次にやること無し）':{
   meta:{deepDiveCategories:['A'],checkCriteria:['結論が最初','60秒以内','軸と矛盾なし','具体あり','前提共有'],
         logFormat:'| 日付 | ID | 結果 | 崩れた基準の番号 |'},
   categories:[{id:'A',name:'転職理由・軸'}],
   questions:[{id:'A-01',category:'A',text:'Q1'}]},

 'G: meta 無し（既定値で動くか）':{
   categories:[{id:'A',name:'転職理由・軸'}],
   questions:[{id:'A-01',category:'A',text:'metaが無い'}]},
};

(async()=>{
const b=await chromium.launch({executablePath:process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
for(const [name,bank] of Object.entries(VARIANTS)){
  console.log('\n'+name);
  const f=SP+'/v.html'; fs.writeFileSync(f,build(bank));
  const ctx=await b.newContext({viewport:{width:375,height:667}});
  const p=await ctx.newPage(); const errs=[];
  p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
  await p.goto('file://'+f,{waitUntil:'load'}); await p.waitForTimeout(250);

  ok(errs.length===0,'JSエラーなし '+(errs[0]||''));
  ok(await p.locator('.mode[data-mode="random"]').count()===1,'トップが描画される');

  const q=await p.evaluate(()=>QUESTIONS.length);
  ok(q>0,`質問を ${q} 問読み込んだ`);
  const cn=await p.evaluate(()=>JSON.stringify(CAT_NAME));
  console.log('     CAT_NAME:',cn);
  const crit=await p.evaluate(()=>CRITERIA.map(c=>c.no+':'+c.label).join(' / '));
  console.log('     CRITERIA:',crit);
  console.log('     TIME_CRIT idx:',await p.evaluate(()=>TIME_CRIT),' LOG_COLS:',await p.evaluate(()=>LOG_COLS));

  await p.locator('.mode[data-mode="random"]').click(); await p.waitForTimeout(150);
  ok(await p.locator('.qtext').count()===1,'質問が表示される');
  const txt=await p.locator('.qtext').textContent();
  const want=(bank.questions||bank.items).map(x=>x.text||x.question);
  ok(want.includes(txt),`質問文が原文どおり: ${JSON.stringify(txt.slice(0,42))}`);

  if(name.startsWith('E')){
    ok(await p.evaluate(()=>!window.__xss),'scriptタグが実行されていない（エスケープ済み）');
    ok(txt.includes('<script>'),'< > & " が文字として表示される');
  }
  if(name.startsWith('D')){
    ok(await p.evaluate(()=>QUESTIONS[0].cat)==='A','ID から категория を推測できる'.replace('категория','カテゴリ'));
    ok(await p.evaluate(()=>isReverse(QUESTIONS[1])),'K01 も逆質問として扱われる');
  }

  // run one full lap
  const rev=await p.locator('[data-act="rev-ok"]').count()>0;
  if(rev){ await p.locator('[data-act="rev-ok"]').click(); }
  else{
    await p.locator('[data-act="start"]').click(); await p.waitForTimeout(120);
    await p.locator('[data-act="done"]').click(); await p.waitForTimeout(120);
    ok(await p.locator('.crit').count()===(bank.meta?.checkCriteria?.length||5),
       `セルフチェック項目数が meta と一致 (${await p.locator('.crit').count()})`);
    if(await p.locator('.crit[data-crit="3"]').count()) await p.locator('.crit[data-crit="3"]').click();
    await p.locator('[data-act="judge"]').click();
  }
  await p.waitForTimeout(150);
  ok(await p.locator('.verdict').count()===1,'判定画面が出る');
  const line=await p.locator('#line').textContent();
  console.log('     log:',line);
  const cols=line.split('|').length-2;
  const wantCols=bank.meta?.logFormat?(bank.meta.logFormat.split('|').length-2):5;
  ok(cols===wantCols,`ログ行の列数が logFormat と一致 (${cols}列)`);
  await ctx.close();
}
await b.close();
console.log('\n============ '+(fails?fails+' FAILED':'ALL VARIANTS PASSED')+' ============');
process.exit(fails?1:0);
})().catch(e=>{console.error('HARNESS',e);process.exit(2)});
