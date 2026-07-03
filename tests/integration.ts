// 整合測試：直接 import 真實原始碼（Node 22 --experimental-strip-types）
// 涵蓋 FSRS 排程、pitch pattern、發音相似度、mora 對齊思路、日期/streak、
// 覆蓋率檢核、資料完整性。不含瀏覽器 UI（見 MANUAL_QA.md）。

import { KANA, KANA_BY_ID } from '../src/data/kana.ts'
import { VOCAB } from '../src/data/vocab.ts'
import { splitMora, pitchPattern, accentTypeName } from '../src/lib/pitch.ts'
import { similarity, normKana } from '../src/audio/scorer.ts'
import { computeStreak, todayStr, lastNDays } from '../src/lib/date.ts'
import { newCard, review, isDue, isMastered } from '../src/srs/scheduler.ts'
import { analyzeCoverage } from '../src/lib/coverage.ts'

let pass = 0
let fail = 0
const fails: string[] = []
function ok(name: string, cond: boolean) {
  if (cond) {
    pass++
  } else {
    fail++
    fails.push(name)
    console.log('  ✗ ' + name)
  }
}

console.log('\n=== 1. FSRS 排程 ===')
{
  const c0 = newCard(new Date('2026-01-01T00:00:00Z'))
  ok('新卡 state=New(0)', c0.state === 0)
  const good1 = review(c0, 'good', new Date('2026-01-01T00:00:00Z'))
  ok('good 後 reps 增加', good1.reps === 1)
  const easy = review(c0, 'easy', new Date('2026-01-01T00:00:00Z'))
  const good = review(c0, 'good', new Date('2026-01-01T00:00:00Z'))
  ok('easy 到期晚於 good', new Date(easy.due).getTime() >= new Date(good.due).getTime())
  // 連續 good 數次應進入 Review 且間隔拉長到定著
  let c = newCard(new Date('2026-01-01'))
  let d = new Date('2026-01-01')
  for (let i = 0; i < 6; i++) {
    c = review(c, 'good', d)
    d = new Date(c.due)
  }
  ok('連續 good 後定著 (isMastered)', isMastered(c))
  // FSRS 語義：lapse 只在 Review 狀態答錯才計
  const relapse = review(c, 'forgot', new Date(c.due))
  ok('Review 狀態 forgot 增 lapses', relapse.lapses >= 1)
  ok('新卡當下到期 (isDue)', isDue(newCard(new Date()), new Date()))
}

console.log('=== 2. Pitch pattern（東京式）===')
{
  ok('あめ雨 accent1 → HL', pitchPattern(2, 1).join('') === 'truefalse')
  ok('あめ飴 accent0 → LH', pitchPattern(2, 0).join('') === 'falsetrue')
  ok('はし橋 accent2 → LH', pitchPattern(2, 2).join('') === 'falsetrue')
  ok('にほんご accent0 → LHHH', pitchPattern(4, 0).join('') === 'falsetruetruetrue')
  ok('拗音合併 しゅぎょう=3拍', splitMora('しゅぎょう').length === 3)
  ok('型名 0→平板', accentTypeName(0, 3) === '平板型')
  ok('型名 1→頭高', accentTypeName(1, 3) === '頭高型')
  ok('型名 n→尾高', accentTypeName(2, 2) === '尾高型')
  ok('型名 中高', accentTypeName(2, 4) === '中高型')
}

console.log('=== 3. 發音相似度 ===')
{
  ok('完全一致=100', similarity('これをください', ['これをください']) === 100)
  ok('片假名正規化', normKana('コーヒー').length > 0)
  ok('多 target 取最高', similarity('わたしはドフです', ['まちがい', 'わたしはドフです']) === 100)
  ok('部分相符 0<x<100', (() => { const s = similarity('きて', ['きって']); return s > 0 && s < 100 })())
}

console.log('=== 4. 日期 / streak ===')
{
  const today = todayStr()
  const y = new Date(); y.setDate(y.getDate() - 1)
  const yStr = todayStr(y)
  ok('今日+昨日連續=2', computeStreak(new Set([today, yStr])) === 2)
  ok('只有今日=1', computeStreak(new Set([today])) === 1)
  ok('斷開的舊章不計今日', computeStreak(new Set(['2020-01-01'])) === 0)
  ok('lastNDays(14) 長度=14', lastNDays(14).length === 14)
}

console.log('=== 5. 覆蓋率檢核 ===')
{
  const known = VOCAB.map((v) => v.jp)
  const a = analyzeCoverage('みずをください', known)
  ok('已知詞句覆蓋率高', a.coveragePct >= 90 && !a.flagged)
  const b = analyzeCoverage('しゅぎょうする', known)
  ok('超綱句 flagged', b.flagged)
  ok('超綱句標出未覆蓋段', b.newSpans.length >= 1)
}

console.log('=== 6. 資料完整性 ===')
{
  ok('假名 142 枚', KANA.length === 142)
  const kanaIds = KANA.map((k) => k.id)
  ok('假名 id 唯一', new Set(kanaIds).size === 142)
  ok('KANA_BY_ID 對得上', KANA_BY_ID['h0'].ch === 'あ')
  ok('詞彙 jp 唯一', new Set(VOCAB.map((v) => v.jp)).size === VOCAB.length)
  ok('詞彙皆有中文與分類', VOCAB.every((v) => v.zh && v.cat && v.level))
}

console.log(`\n=== 結果：${pass} passed, ${fail} failed ===`)
if (fail > 0) {
  console.log('失敗項：' + fails.join('; '))
  process.exit(1)
}
