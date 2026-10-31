import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const svgPath = path.resolve(__dirname, '../public/icons/icon.svg');
const outDir = path.resolve(__dirname, '../public/icons');

async function generate() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto(`file://${svgPath}`);
  
  // 192x192
  await page.setViewportSize({ width: 192, height: 192 });
  await page.screenshot({ path: path.join(outDir, 'icon-192.png') });
  
  // 512x512
  await page.setViewportSize({ width: 512, height: 512 });
  await page.screenshot({ path: path.join(outDir, 'icon-512.png') });
  
  // maskable 512x512
  await page.screenshot({ path: path.join(outDir, 'icon-maskable-512.png') });

  await browser.close();
  console.log('✅ Generated icon-192.png, icon-512.png, icon-maskable-512.png');
}

generate().catch(console.error);
