// 由 favicon.svg 的設計生成 App 圖示（用 Chromium 渲染截圖）：
//   public/icon-192.png / icon-512.png            —— PWA
//   resources/icon-only.png (1024)                —— Android 一般圖示來源
//   resources/icon-foreground.png (1024)          —— adaptive icon 前景（安全區內縮）
//   resources/icon-background.png (1024)          —— adaptive icon 背景（純色）
//   resources/splash.png / splash-dark.png (2732) —— 啟動畫面
// 之後執行：npx @capacitor/assets generate --android --assetPath resources
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const AI = '#24466B' // 藍（品牌主色）
const WASHI = '#F4F1E8' // 和紙

const glyph = (fontSize, y, fill) =>
  `<text x="32" y="${y}" font-family="'Noto Serif CJK JP','Noto Serif JP',serif" font-size="${fontSize}" font-weight="700" fill="${fill}" text-anchor="middle">道</text>`

const html = (size, inner) => `<!doctype html><meta charset="utf-8">
<style>*{margin:0;padding:0}body{width:${size}px;height:${size}px}</style>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">${inner}</svg>`

// 各產物：viewBox 皆 64，靠 SVG 等比縮放
const TARGETS = [
  // PWA（既有設計不變）
  { path: 'public/icon-192.png', size: 192, transparent: true, svg: `<rect width="64" height="64" rx="12" fill="${AI}"/>${glyph(38, 44, WASHI)}` },
  { path: 'public/icon-512.png', size: 512, transparent: true, svg: `<rect width="64" height="64" rx="12" fill="${AI}"/>${glyph(38, 44, WASHI)}` },
  // Android 圖示來源（1024、滿版無圓角——形狀由各 launcher 裁切）
  { path: 'resources/icon-only.png', size: 1024, svg: `<rect width="64" height="64" fill="${AI}"/>${glyph(38, 44, WASHI)}` },
  // adaptive 前景：安全區約中央 66%，字內縮避免圓形裁切
  { path: 'resources/icon-foreground.png', size: 1024, transparent: true, svg: glyph(26, 41, WASHI) },
  { path: 'resources/icon-background.png', size: 1024, svg: `<rect width="64" height="64" fill="${AI}"/>` },
  // 啟動畫面：和紙底、置中「道」；深色模式反轉
  { path: 'resources/splash.png', size: 2732, svg: `<rect width="64" height="64" fill="${WASHI}"/>${glyph(14, 37, AI)}` },
  { path: 'resources/splash-dark.png', size: 2732, svg: `<rect width="64" height="64" fill="#1A2E45"/>${glyph(14, 37, WASHI)}` },
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
