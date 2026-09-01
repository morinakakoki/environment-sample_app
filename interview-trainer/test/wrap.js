// Reproduce the Artifact publish-time skeleton so the test sees what viewers see.
const fs=require('fs');
const body=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const html=`<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>:root{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif;background:#fafaf9}
img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>${body}</body></html>`;
fs.writeFileSync(require('path').join(require('os').tmpdir(),'wrapped.html'),html);
console.log('wrapped ->', html.length, 'bytes');
