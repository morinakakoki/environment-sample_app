import { launchBrowser } from './browser.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __d = path.dirname(fileURLToPath(import.meta.url));
const QUIZ = path.join(__d, '..');
// 問題数はデータから読む。増えるたびにテストが壊れないように。
const N = String(JSON.parse(fs.readFileSync(path.join(QUIZ,'quiz-data.json'),'utf8')).length);

const D=__d;
const f=[];const ok=(c,m)=>{console.log((c?'  PASS ':'  FAIL ')+m);if(!c)f.push(m)};
const inner=fs.readFileSync(path.join(QUIZ,'artifact.html'),'utf8');
fs.writeFileSync(D+'/n0.html',`<!doctype html><html><head><meta charset="utf8"><title>host</title><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${inner}</body></html>`);

// ↓ 実際に観測した応答をそのまま使う
const REAL={"results":[{"選択肢A":"環境変数またはファイルとしてマウントでき、コードに値を書かなくてよい","正解":"A","選択肢D":"Secret Manager は Services 専用で Jobs からは参照できない","選択肢C":"実行のたびにコンテナ内で gcloud を叩いて取得する必要がある","選択肢B":"コンテナイメージのビルド時に焼き込んでおく必要がある","解説":"Cloud Run Jobs はシークレットを環境変数として渡すか、ファイルとしてマウントできます。","date:追加日:start":"2026-08-31","date:追加日:is_datetime":0,"タグ":"#18","章":3,"問題":"Cloud Run Jobs から Secret Manager のシークレットを使うときの扱いとして正しいのは？","url":"https://app.notion.com/p/3cdc8403e248814cb688d0c4315c3f9a"},{"選択肢A":"実リソースが destroy され、state からも外れる","正解":"A","選択肢D":"plan の時点でエラーになり apply できない","選択肢C":"差分として検出されないので何も起きない","選択肢B":"state からだけ外れ、実リソースはそのまま残る","解説":"Terraform は .tf を「あるべき姿」として扱うため、定義が消えたリソースは不要と判断して削除します。","date:追加日:start":"2026-08-31","date:追加日:is_datetime":0,"タグ":"#9","章":4,"問題":"Terraform で管理しているリソースの定義を .tf から削除して apply すると何が起きる？","url":"https://app.notion.com/p/3cdc8403e248816e8bc4f7c11936d685"}],"has_more":false};

// 「最近追加」は同じ日の中ではシャッフルされる（未挑戦→間違い→正解済みの群の中で）。
// Notion 分が先頭に来ることを確実に見るため、埋め込みのどの日付よりも新しい日にする。
{
  const days = JSON.parse(fs.readFileSync(path.join(QUIZ,'quiz-data.json'),'utf8'))
                 .map(x=>x.addedAt).filter(Boolean).sort();
  const t = new Date(days[days.length-1]+'T00:00:00Z');
  t.setUTCDate(t.getUTCDate()+1);
  const NEWEST = t.toISOString().slice(0,10);
  REAL.results.forEach(r=>{ r['date:追加日:start'] = NEWEST; });
}

const LOGVIEW='c68a3cb4';
const mk=(mode,extra={})=>`window.__CALLS=[];window.claude={use:n=>Promise.resolve(
 n==='artifact'?{publish:h=>{window.__PUB=h;return Promise.resolve()}}
:n==='mcp'?{callTool:(s,t,i)=>{
   // 学習記録側の呼び出しは、この試験では対象外（空で返す）
   if(t==='notion-create-pages') return Promise.resolve({payload:{pages:[]}});
   if(i&&i.data&&i.data.view_url&&i.data.view_url.indexOf('${LOGVIEW}')>=0)
     return Promise.resolve({payload:{results:[],has_more:false}});
   window.__CALLS.push({s,t,i});return (${mode})(s,t,i)},
            watchTool:()=>()=>{},listTools:()=>Promise.resolve([])}
:null)};Object.assign(window,${JSON.stringify(extra)});`;

const b=await launchBrowser();

async function run(label, stub, fn){
  const c=await b.newContext({viewport:{width:375,height:812}});
  await c.addInitScript(stub);
  const p=await c.newPage();
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8790/n0.html',{waitUntil:'load'});
  await p.locator('#screenHome:not(.hidden)').waitFor({timeout:5000});
  console.log('\n'+label);
  await fn(p);
  ok(errs.length===0,'  例外なし'+(errs.length?': '+errs[0]:''));
  await c.close();
}

// 1) 正常系
await run('【正常】Notion に2問ある', mk(`()=>Promise.resolve({payload:${JSON.stringify(REAL)}})`), async p=>{
  await p.locator('#notionLine.ok').waitFor({timeout:5000});
  ok(await p.locator('#stTotal').textContent()===String(Number(N)+2),`${N} + Notion 2問 = ${Number(N)+2}問`);
  ok(/Notion から 2問 読み込みました/.test(await p.locator('#notionLine').innerText()),'読み込み件数を表示');
  const call=(await p.evaluate(()=>window.__CALLS))[0];
  ok(call.s==='Notion'&&call.t==='notion-query-data-sources','宣言どおりの server/tool を呼ぶ: '+call.s+' / '+call.t);
  ok(call.i.data.mode==='view','ビューモードで呼ぶ（SQLは使用量制限があるため）');
  // Notion 分が章別に反映されているか
  const chapters=await p.locator('#chapBtns .btn').count();
  ok(chapters===7,'章の数は7のまま（3章と4章に足された）: '+chapters);
  // 実際に解けるか
  await p.locator('#modeRecent').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  const qt=await p.locator('#qText').textContent();
  ok(/Cloud Run Jobs|Terraform/.test(qt),'最近追加でNotionの問題が先頭に出る: '+qt.slice(0,26));
  const opts=await p.locator('#qOpts .opt .txt').allTextContents();
  ok(opts.length===4,'選択肢が4つ描画される');
  await p.locator('#qOpts .opt').nth(0).click();
  await p.locator('#qVerdict:not(.hidden)').waitFor();
  ok((await p.locator('#qOpts .opt.is-correct').count())===1,'正解が1つ判定される');
});

// 2) 失敗系: コードごとに違う案内が出るか
for (const [code,expect] of [['needs_reauth','繋ぎ直'],['server_not_connected','追加してください'],
                             ['not_granted','許可'],['blocked_by_policy','管理者'],['tool_error','列名']]) {
  await run(`【失敗】${code}`, mk(`()=>Promise.reject(Object.assign(new Error('x'),{code:'${code}',message:'列名が変わっています'}))`), async p=>{
    await p.locator('#notionLine.ng').waitFor({timeout:5000});
    const t=await p.locator('#notionLine').innerText();
    ok(t.includes(expect),`直し方が出る（"${expect}" を含む）: ${t.split('\n')[0]}`);
    ok(new RegExp(`${N}問はこのまま解けます`).test(t),'埋め込み分は使える旨を出す');
    ok(await p.locator('#stTotal').textContent()===N,'48問で普通に動く');
  });
}

// 3) mcp が使えない表示（use が null）
await run('【非対応】use("mcp") が null', `window.claude={use:()=>Promise.resolve(null)};`, async p=>{
  await p.waitForTimeout(600);
  ok(await p.locator('#notionLine').isHidden(),'何も表示しない（静かに埋め込み分だけで動く）');
  ok(await p.locator('#stTotal').textContent()===N,'48問で動く');
});

// 4) 壊れた行はスキップされるか
const BAD={results:[{...REAL.results[0]},{"問題":"選択肢が空の行","選択肢A":"","選択肢B":"い","選択肢C":"う","選択肢D":"え","正解":"A","章":1,"タグ":"#1","url":"https://app.notion.com/p/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},{"問題":"正解が未設定の行","選択肢A":"あ","選択肢B":"い","選択肢C":"う","選択肢D":"え","正解":"","章":1,"タグ":"#1","url":"https://app.notion.com/p/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}],has_more:false};
await run('【不備行】空欄・正解未設定はスキップ', mk(`()=>Promise.resolve({payload:${JSON.stringify(BAD)}})`), async p=>{
  await p.locator('#notionLine.ok').waitFor({timeout:5000});
  ok(await p.locator('#stTotal').textContent()===String(Number(N)+1),`正常な1問だけ足される: ${await p.locator('#stTotal').textContent()}`);
  ok(/2行は空欄か正解未設定/.test(await p.locator('#notionLine').innerText()),'スキップ件数を知らせる');
});

// 5) ページング
const P1={results:Array.from({length:100},(_,i)=>({...REAL.results[0],問題:'ページ1の問題'+i,url:'https://app.notion.com/p/'+String(i).padStart(32,'0')})),has_more:true,next_cursor:'c1'};
const P2={results:[{...REAL.results[1]}],has_more:false};
await run('【ページング】has_more を追う', mk(`(s,t,i)=>Promise.resolve({payload: i.data.start_cursor? ${JSON.stringify(P2)} : ${JSON.stringify(P1)}})`), async p=>{
  await p.locator('#notionLine.ok').waitFor({timeout:8000});
  ok(await p.locator('#stTotal').textContent()===String(Number(N)+101),`101問すべて読む（${N}+101）: ${await p.locator('#stTotal').textContent()}`);
  ok((await p.evaluate(()=>window.__CALLS)).length===2,'2ページ分呼んだ');
});

// 6) Notion 分が「保存」に混ざらないこと（最重要）
await run('【混入防止】Notionの問題が保存版に入らない', mk(`()=>Promise.resolve({payload:${JSON.stringify(REAL)}})`), async p=>{
  await p.locator('#notionLine.ok').waitFor({timeout:5000});
  await p.locator('#addBtn').click();
  await p.locator('#addTa').fill(JSON.stringify([{chapter:1,tag:'#1',q:'貼り付けで足した問題',options:['あ','い','う','え'],answer:0,explanation:'混入確認',addedAt:'2026-09-01'}]));
  await p.locator('#addCheckBtn').click();
  await p.locator('#addResult.ok').waitFor({timeout:3000});
  await p.locator('#addSaveBtn').click();
  await p.waitForFunction(()=>window.__PUB,null,{timeout:5000});
  const pub=await p.evaluate(()=>window.__PUB);
  const d=JSON.parse(pub.match(/id="quizData">([\s\S]*?)<\/script>/)[1].replace(/<\\\//g,'</'));
  const arr=Array.isArray(d)?d:d.questions;
  ok(arr.length===Number(N)+1,`保存版は ${N}+1=${Number(N)+1}問（Notionの2問は入らない）: ${arr.length}`);
  ok(!JSON.stringify(arr).includes('Cloud Run Jobs から Secret Manager'),'Notionの問題文が焼き込まれていない');
});

await b.close();
console.log('\n'+(f.length?`FAILURES (${f.length}):\n - `+f.join('\n - '):'ALL PASS'));
process.exit(f.length?1:0);
