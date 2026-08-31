// 公開時に付く器を模擬して artifact.html を包む
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __d = path.dirname(fileURLToPath(import.meta.url));
const QUIZ = path.join(__d, '..');
const inner = fs.readFileSync(path.join(QUIZ,'artifact.html'),'utf8');
fs.writeFileSync('artifact-inner.html',
`<!doctype html><html><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>:root{color-scheme:light}body{margin:0;padding:0;font:14px -apple-system,sans-serif;background:#faf9f5;color:#141413}img{max-width:100%}[hidden]:not([hidden=until-found]){display:none!important}</style>
</head><body>${inner}</body></html>`);
console.log('wrapped');
