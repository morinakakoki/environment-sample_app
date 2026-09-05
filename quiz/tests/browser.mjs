/* Chromium の起動をここに集約する。
   環境によって実行ファイルの場所が違うので、順に探して最初に見つかったものを使う。
   1. 環境変数 CHROME_PATH
   2. PLAYWRIGHT_BROWSERS_PATH 配下の chromium-… ディレクトリの chrome-linux/chrome
   3. Playwright の既定（npx playwright install で入れた場所） */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root && fs.existsSync(root)) {
    const dirs = fs.readdirSync(root).filter(d => d.startsWith('chromium')).sort().reverse();
    for (const d of dirs) {
      for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell', 'chrome']) {
        const p = path.join(root, d, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return undefined;   // Playwright に任せる
}

export function launchBrowser(opts = {}) {
  const exe = findChrome();
  return chromium.launch(exe ? { executablePath: exe, ...opts } : opts);
}
