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

 'H: questions がカテゴリ別オブジェクトマップ':{
   meta:{deepDiveCategories:['A'],checkCriteria:['結論が最初','60秒以内','軸と矛盾なし','具体あり','前提共有']},
   categories:[{id:'A',name:'転職理由・軸'}],
   questions:{'A-01':{category:'A',text:'オブジェクトマップの質問'},'A-02':{category:'A',text:'ふたつめ'}}},

 'I: questions が categories[] にネスト':{
   meta:{deepDiveCategories:['A'],checkCriteria:['結論が最初','60秒以内','軸と矛盾なし','具体あり','前提共有']},
   categories:[{id:'A',name:'転職理由・軸',questions:[{id:'A-01',text:'ネストされた質問'}]}]},

 'J: deepDiveCategories が文字列':{
   meta:{deepDiveCategories:'A・B',checkCriteria:['結論が最初','60秒以内','軸と矛盾なし','具体あり','前提共有']},
   categories:[{id:'A',name:'転職理由・軸'},{id:'B',name:'キャリア'}],
   questions:[{id:'A-01',category:'A',text:'Q1'},{id:'B-01',category:'B',text:'Q2'}]},

 'K: checkCriteria がオブジェクトマップ / logFormat に区切り行':{
   meta:{deepDiveCategories:['A'],
         checkCriteria:{'1':'結論が最初','2':'60秒以内','3':'軸と矛盾なし','4':'具体あり','5':'前提共有'},
         logFormat:'| 日付 | ID | 結果 | 崩れた基準の番号 | 次にやること |\n|---|---|---|---|---|'},
   categories:[{id:'A',name:'転職理由・軸'}],
   questions:[{id:'A-01',category:'A',text:'Q1'}]},

 'L: logFormat の列順が入れ替わっている':{
   meta:{deepDiveCategories:['A'],checkCriteria:['結論が最初','60秒以内','軸と矛盾なし','具体あり','前提共有'],
         logFormat:'| ID | 結果 | 次にやること | 崩れた基準の番号 | 日付 |'},
   categories:[{id:'A',name:'転職理由・軸'}],
   questions:[{id:'A-01',category:'A',text:'Q1'}]},

 'M: question.category がオブジェクト / logFormat が非文字列':{
   meta:{deepDiveCategories:[{id:'A'}],checkCriteria:['結論が最初','60秒以内','軸と矛盾なし','具体あり','前提共有'],
         logFormat:{cols:5}},
   categories:[{id:'A',name:'転職理由・軸'}],
   questions:[{id:'A-01',category:{id:'A',name:'転職理由・軸'},text:'Q1'}]},

 'N: checkCriteria の番号が0始まり（重複の危険）':{
   meta:{deepDiveCategories:['A'],
         checkCriteria:[{index:0,label:'結論が最初'},{index:1,label:'60秒以内'},
                        {index:2,label:'軸と矛盾なし'},{index:3,label:'具体あり'},{index:4,label:'前提共有'}],
         logFormat:'| 日付 | ID | 結果 | 崩れた基準の番号 | 次にやること |'},
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
  const nos=await p.evaluate(()=>CRITERIA.map(c=>c.no));
  ok(new Set(nos).size===nos.length,`基準番号が重複していない [${nos}]`);
  ok(nos.every(n=>Number.isFinite(n)&&n>=1),`基準番号が全て1以上の数値 [${nos}]`);
  const crit=await p.evaluate(()=>CRITERIA.map(c=>c.no+':'+c.label).join(' / '));
  console.log('     CRITERIA:',crit);
  console.log('     TIME_CRIT idx:',await p.evaluate(()=>TIME_CRIT),
              ' LOG_FIELDS:',await p.evaluate(()=>LOG_FIELDS.join(',')));

  await p.locator('.mode[data-mode="random"]').click(); await p.waitForTimeout(150);
  ok(await p.locator('.qtext').count()===1,'質問が表示される');
  const txt=await p.locator('.qtext').textContent();
  // JSONの形がまちまちなので、期待する質問文もアプリと同じように集める
  const collect=v=>{
    if(!v) return [];
    const list=Array.isArray(v)?v:Object.values(v);
    return list.map(x=>typeof x==='string'?x:(x.text||x.question));
  };
  const want=[...collect(bank.questions),...collect(bank.items),
    ...(bank.categories&&Array.isArray(bank.categories)
      ? bank.categories.flatMap(c=>collect(c.questions)) : [])].filter(Boolean);
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
  const fields=await p.evaluate(()=>LOG_FIELDS);
  const cols=line.split('|').length-2;
  ok(cols===fields.length,`ログ行の列数が logFormat の見出し数と一致 (${cols}列)`);
  // 見出しの意味どおりに値が入っているか（列順が違っても入れ替わらないこと）
  const cells=line.split('|').slice(1,-1).map(x=>x.trim());
  const idAt=fields.indexOf('id'), dateAt=fields.indexOf('date'), vAt=fields.indexOf('verdict');
  if(idAt>=0) ok(/^[A-Za-z]/.test(cells[idAt]),`ID が「${fields[idAt]}」の列に入っている`);
  if(dateAt>=0) ok(/^\d{4}-\d{2}-\d{2}$/.test(cells[dateAt]),'日付が日付列に入っている');
  if(vAt>=0) ok(/^(🟢|🟡|🔴)$/.test(cells[vAt]),'判定が結果列に入っている');
  await ctx.close();
}
await b.close();
console.log('\n============ '+(fails?fails+' FAILED':'ALL VARIANTS PASSED')+' ============');
process.exit(fails?1:0);
})().catch(e=>{console.error('HARNESS',e);process.exit(2)});
