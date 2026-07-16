// 由 favicon.svg 的設計生成 App 圖示（用 Chromium 渲染截圖）：
//   public/icon-192.png / icon-512.png            —— PWA
//   resources/icon-only.png (1024)                —— Android 一般圖示來源
//   resources/icon-foreground.png (1024)          —— adaptive icon 前景（安全區內縮）
//   resources/icon-background.png (1024)          —— adaptive icon 背景（純色）
//   resources/splash.png / splash-dark.png (2732) —— 啟動畫面
// 之後執行：npx @capacitor/assets generate --android --assetPath resources
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

// 品牌＝朱印（vermilion seal）：朱紅底、和紙白「道」＋刻印框（陰刻風）。
const SHU = '#C4402E' // 朱（印肉紅，品牌主色）
const WASHI = '#F4F1E8' // 和紙
const SUMI = '#1A2E45' // 墨（深色啟動畫面底）

const glyph = (fontSize, y, fill) =>
  `<text x="32" y="${y}" font-family="'Noto Serif CJK JP','Noto Serif JP',serif" font-size="${fontSize}" font-weight="900" fill="${fill}" text-anchor="middle">道</text>`

// 刻印框（seal frame）：內縮的圓角描邊，讓圖示讀作「印章」。
const frame = (inset, rx, w = 2.4) =>
  `<rect x="${inset}" y="${inset}" width="${64 - inset * 2}" height="${64 - inset * 2}" rx="${rx}" fill="none" stroke="${WASHI}" stroke-width="${w}" opacity="0.92"/>`

const html = (size, inner) => `<!doctype html><meta charset="utf-8">
<style>*{margin:0;padding:0}body{width:${size}px;height:${size}px}</style>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">${inner}</svg>`

// 各產物：viewBox 皆 64，靠 SVG 等比縮放。與 public/favicon.svg 同一設計。
const TARGETS = [
  // PWA：朱印方章（圓角）＋刻印框＋和紙「道」
  { path: 'public/icon-192.png', size: 192, transparent: true, svg: `<rect width="64" height="64" rx="13" fill="${SHU}"/>${frame(5.5, 8.5)}${glyph(37, 45.5, WASHI)}` },
  { path: 'public/icon-512.png', size: 512, transparent: true, svg: `<rect width="64" height="64" rx="13" fill="${SHU}"/>${frame(5.5, 8.5)}${glyph(37, 45.5, WASHI)}` },
  // Android 圖示來源（1024、滿版無圓角——形狀由各 launcher 裁切）
  { path: 'resources/icon-only.png', size: 1024, svg: `<rect width="64" height="64" fill="${SHU}"/>${frame(6, 6)}${glyph(37, 45.5, WASHI)}` },
  // adaptive 前景：安全區約中央 66%，框與字內縮避免圓形裁切
  { path: 'resources/icon-foreground.png', size: 1024, transparent: true, svg: `${frame(17, 6, 1.8)}${glyph(24, 42, WASHI)}` },
  { path: 'resources/icon-background.png', size: 1024, svg: `<rect width="64" height="64" fill="${SHU}"/>` },
  // 啟動畫面：和紙底、置中朱「道」；深色模式反轉
  { path: 'resources/splash.png', size: 2732, svg: `<rect width="64" height="64" fill="${WASHI}"/>${glyph(14, 37, SHU)}` },
  { path: 'resources/splash-dark.png', size: 2732, svg: `<rect width="64" height="64" fill="${SUMI}"/>${glyph(14, 37, WASHI)}` },
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
