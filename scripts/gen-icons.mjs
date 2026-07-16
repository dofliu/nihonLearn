// 由 favicon.svg 的設計生成 App 圖示（用 Chromium 渲染截圖）：
//   public/icon-192.png / icon-512.png            —— PWA
//   resources/icon-only.png (1024)                —— Android 一般圖示來源
//   resources/icon-foreground.png (1024)          —— adaptive icon 前景（安全區內縮）
//   resources/icon-background.png (1024)          —— adaptive icon 背景（純色）
//   resources/splash.png / splash-dark.png (2732) —— 啟動畫面
// 之後執行：npx @capacitor/assets generate --android --assetPath resources
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

// 品牌＝鳥居（torii）：藍夜空底、朱紅鳥居、通往鳥居的參道（呼應「日本語の道」）。
const AI = '#24466B' // 藍（夜空／品牌主色）
const SHU = '#E0563E' // 朱（鳥居丹色，在藍底上更亮）
const WASHI = '#F4F1E8' // 和紙
const SUMI = '#1A2E45' // 墨（深色啟動畫面底）

// 鳥居（明神鳥居）：笠木＋島木＋兩柱＋貫。cx 為中線、s 為整體縮放（1＝viewBox 64）。
const torii = (fill) =>
  `<g fill="${fill}"><rect x="13" y="16.5" width="38" height="4.2" rx="2.1"/><rect x="16.5" y="21" width="31" height="2.5"/><rect x="20.8" y="19.5" width="4.6" height="30.5"/><rect x="38.6" y="19.5" width="4.6" height="30.5"/><rect x="17.5" y="28.5" width="29" height="3.3"/></g>`

// 參道（通往鳥居的路），淡和紙色梯形。
const michi = `<path d="M28.5 62 L31 50 L33 50 L35.5 62 Z" fill="${WASHI}" opacity="0.22"/>`

const html = (size, inner) => `<!doctype html><meta charset="utf-8">
<style>*{margin:0;padding:0}body{width:${size}px;height:${size}px}</style>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">${inner}</svg>`

// 各產物：viewBox 皆 64，靠 SVG 等比縮放。與 public/favicon.svg 同一設計。
const TARGETS = [
  // PWA：藍夜空圓角方章＋參道＋朱鳥居
  { path: 'public/icon-192.png', size: 192, transparent: true, svg: `<rect width="64" height="64" rx="13" fill="${AI}"/>${michi}${torii(SHU)}` },
  { path: 'public/icon-512.png', size: 512, transparent: true, svg: `<rect width="64" height="64" rx="13" fill="${AI}"/>${michi}${torii(SHU)}` },
  // Android 圖示來源（1024、滿版無圓角——形狀由各 launcher 裁切）
  { path: 'resources/icon-only.png', size: 1024, svg: `<rect width="64" height="64" fill="${AI}"/>${michi}${torii(SHU)}` },
  // adaptive 前景：安全區約中央 66%，鳥居置中縮小避免圓形裁切
  { path: 'resources/icon-foreground.png', size: 1024, transparent: true, svg: `<g transform="translate(32 33) scale(0.66) translate(-32 -32)">${torii(WASHI)}</g>` },
  { path: 'resources/icon-background.png', size: 1024, svg: `<rect width="64" height="64" fill="${AI}"/>` },
  // 啟動畫面：和紙底、朱鳥居；深色模式反轉為墨底和紙鳥居
  { path: 'resources/splash.png', size: 2732, svg: `<rect width="64" height="64" fill="${WASHI}"/><g transform="translate(32 34) scale(0.5) translate(-32 -32)">${torii(SHU)}</g>` },
  { path: 'resources/splash-dark.png', size: 2732, svg: `<rect width="64" height="64" fill="${SUMI}"/><g transform="translate(32 34) scale(0.5) translate(-32 -32)">${torii(WASHI)}</g>` },
]

mkdirSync('resources', { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
})
for (const t of TARGETS) {
  const page = await browser.newPage({
    viewport: { width: t.size, height: t.size },
    deviceScaleFactor: 1,
  })
  await page.setContent(html(t.size, t.svg))
  await page.screenshot({
    path: t.path,
    omitBackground: Boolean(t.transparent),
    clip: { x: 0, y: 0, width: t.size, height: t.size },
  })
  await page.close()
  console.log('✓', t.path)
}
await browser.close()
console.log('icons generated')
