// 由 favicon.svg 的設計生成 PWA icon-192 / icon-512 PNG（用 Chromium 渲染截圖）
import { chromium } from '@playwright/test'

const svg = (size) => `<!doctype html><meta charset="utf-8">
<style>*{margin:0;padding:0}body{width:${size}px;height:${size}px}</style>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
  <rect width="64" height="64" rx="12" fill="#24466B"/>
  <text x="32" y="44" font-family="'Noto Serif CJK JP','Noto Serif JP',serif" font-size="38" font-weight="700" fill="#F4F1E8" text-anchor="middle">道</text>
</svg>`

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
})
for (const size of [192, 512]) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  })
  await page.setContent(svg(size))
  await page.screenshot({
    path: `public/icon-${size}.png`,
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  })
  await page.close()
}
await browser.close()
console.log('icons generated')
