// 直接把鳥居 logo 產成 Android launcher mipmap（各密度），寫進 android/ res。
// 免依賴 @capacitor/assets——用 Chromium 渲染 SVG 截圖，尺寸對齊現有檔案。
//   ic_launcher_foreground.png（adaptive 前景，透明底、朱鳥居，內縮安全區）
//   ic_launcher.png / ic_launcher_round.png（legacy，藍底＋朱鳥居＋參道）
// adaptive 背景色由 values/ic_launcher_background.xml 提供（#24466B 藍）。
// 執行：PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/gen-android-icons.mjs
import { chromium } from '@playwright/test'

const AI = '#24466B' // 藍夜空
const SHU = '#E0563E' // 朱鳥居
const WASHI = '#F4F1E8'

// 與 public/favicon.svg 同一鳥居幾何。
const torii = (fill) =>
  `<g fill="${fill}"><rect x="13" y="16.5" width="38" height="4.2" rx="2.1"/><rect x="16.5" y="21" width="31" height="2.5"/><rect x="20.8" y="19.5" width="4.6" height="30.5"/><rect x="38.6" y="19.5" width="4.6" height="30.5"/><rect x="17.5" y="28.5" width="29" height="3.3"/></g>`
const michi = `<path d="M28.5 62 L31 50 L33 50 L35.5 62 Z" fill="${WASHI}" opacity="0.22"/>`
// 前景：置中縮到安全區（adaptive 前景四周各留 ~1/4）。
const fg = `<g transform="translate(32 33) scale(0.6) translate(-32 -33)">${torii(SHU)}</g>`

const html = (size, inner) => `<!doctype html><meta charset="utf-8">
<style>*{margin:0;padding:0}body{width:${size}px;height:${size}px}</style>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">${inner}</svg>`

const R = 'android/app/src/main/res'
const DENS = [
  { d: 'mdpi', legacy: 48, fgpx: 108 },
  { d: 'hdpi', legacy: 72, fgpx: 162 },
  { d: 'xhdpi', legacy: 96, fgpx: 216 },
  { d: 'xxhdpi', legacy: 144, fgpx: 324 },
  { d: 'xxxhdpi', legacy: 192, fgpx: 432 },
]

const TARGETS = []
for (const { d, legacy, fgpx } of DENS) {
  // adaptive 前景（透明底、朱鳥居內縮）
  TARGETS.push({ path: `${R}/mipmap-${d}/ic_launcher_foreground.png`, size: fgpx, transparent: true, svg: fg })
  // legacy 方形：藍底＋參道＋朱鳥居
  TARGETS.push({ path: `${R}/mipmap-${d}/ic_launcher.png`, size: legacy, svg: `<rect width="64" height="64" fill="${AI}"/>${michi}${torii(SHU)}` })
  // legacy 圓形：藍圓＋參道＋朱鳥居
  TARGETS.push({ path: `${R}/mipmap-${d}/ic_launcher_round.png`, size: legacy, transparent: true, svg: `<circle cx="32" cy="32" r="32" fill="${AI}"/>${michi}${torii(SHU)}` })
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined })
for (const t of TARGETS) {
  const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 })
  await page.setContent(html(t.size, t.svg))
  await page.screenshot({ path: t.path, omitBackground: Boolean(t.transparent), clip: { x: 0, y: 0, width: t.size, height: t.size } })
  await page.close()
  console.log('✓', t.path)
}
await browser.close()
console.log('android icons generated')
