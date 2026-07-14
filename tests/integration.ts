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
import { normalizeBase, joinApi, ttsCacheKey } from '../src/lib/sidecar.ts'
import { gatingChars, isVocabUnlocked } from '../src/lib/vocabGate.ts'
import { stripJsonFences, extractText, chatContents } from '../src/lib/llmParse.ts'
import { generateQuiz, seededRng, MIN_POOL } from '../src/lib/quiz.ts'
import { karaokeChars, activeCharIndices } from '../src/lib/karaoke.ts'
import { listeningQuestions, pickParagraphs, responseQuestions, expressionQuestions, LISTEN_MIN_POOL, type ListenItem } from '../src/lib/listening.ts'
import { PASSAGES, PASSAGE_CATS } from '../src/data/passages.ts'
import { RESPONSES, EXPRESSIONS } from '../src/data/kaiwa.ts'

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

console.log('=== 5b. Sidecar 位址與 TTS 快取 key ===')
{
  ok('空輸入 → 空 base（同源相對路徑）', normalizeBase('') === '' && normalizeBase('   ') === '')
  ok('無 scheme 自動補 https', normalizeBase('sidecar.example.com') === 'https://sidecar.example.com')
  ok('保留明確的 http（LAN 除錯用）', normalizeBase('http://192.168.1.5:8848') === 'http://192.168.1.5:8848')
  ok('去尾斜線', normalizeBase('https://x.example.com///') === 'https://x.example.com')
  ok('空 base join 維持相對路徑', joinApi('', '/api/tts') === '/api/tts')
  ok('有 base join 成絕對路徑', joinApi('https://x.example.com', '/api/tts') === 'https://x.example.com/api/tts')
  ok('cache key 含 speaker/rate/text', ttsCacheKey('こんにちは', 3, 0.85) === '3|0.85|こんにちは')
  ok('無 speaker 用 default', ttsCacheKey('ねこ', null, 1) === 'default|1|ねこ')
  ok('不同 rate 不同 key', ttsCacheKey('ねこ', 3, 0.85) !== ttsCacheKey('ねこ', 3, 1))
}

console.log('=== 5c. 詞彙解鎖閘門（隨假名進度） ===')
{
  // gatingChars 只取「可當卡片的假名」，忽略小書き/長音/標點
  ok('gatingChars 取基本假名', JSON.stringify(gatingChars('みず')) === JSON.stringify(['み', 'ず']))
  ok('小書き ゃゅょっ 不計入', gatingChars('しゅぎょう').every((c) => !'ゃゅょっぁぃぅぇぉ'.includes(c)))
  ok('長音ー 不計入', !gatingChars('コーヒー').includes('ー'))
  ok('標點不計入', gatingChars('みずを、ください。').every((c) => !'、。'.includes(c)))

  // isVocabUnlocked：假名全學過才解鎖
  const known = new Set(['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ'])
  ok('假名全會 → 解鎖', isVocabUnlocked('えき', known))
  ok('含未學假名 → 未解鎖', !isVocabUnlocked('これ', known)) // れ 未學
  ok('小書き詞：主音會了即解鎖', isVocabUnlocked('きゃく', new Set(['き', 'く']))) // ゃ 不 gating
  ok('空集合下多數詞未解鎖', VOCAB.filter((v) => isVocabUnlocked(v.jp, new Set())).length < VOCAB.length)
}

console.log('=== 5d. Gemini 回應解析 ===')
{
  ok('去 ```json 圍欄', stripJsonFences('```json\n{"a":1}\n```') === '{"a":1}')
  ok('去無語言標記圍欄', stripJsonFences('```\n{"a":1}```') === '{"a":1}')
  ok('無圍欄原樣', stripJsonFences('{"a":1}') === '{"a":1}')
  const resp = { candidates: [{ content: { parts: [{ text: '{"ok":' }, { text: 'true}' }] } }] }
  ok('抽出並串接 parts 文字', extractText(resp) === '{"ok":true}')
  ok('空回應回空字串', extractText({}) === '' && extractText({ candidates: [] }) === '')

  // 對話歷史 → Gemini contents（role 對映）
  const cc = chatContents([
    { role: 'user', text: 'こんにちは' },
    { role: 'model', text: 'はい' },
  ])
  ok('user role 保留、text 進 parts', cc[0].role === 'user' && cc[0].parts[0].text === 'こんにちは')
  ok('model role 對映', cc[1].role === 'model')
}

console.log('=== 5e. N5 模擬測驗生成 ===')
{
  const pool = VOCAB.slice(0, 30)
  ok('已學不足 4 詞 → 空', generateQuiz(VOCAB.slice(0, 3), 10, seededRng(1)).length === 0)
  ok('MIN_POOL 常數為 4', MIN_POOL === 4)
  const q = generateQuiz(pool, 10, seededRng(42))
  ok('產出 10 題', q.length === 10)
  ok('每題 refId 在詞庫內', q.every((x) => pool.some((v) => v.jp === x.refId)))
  ok('四種題型都出現', new Set(q.map((x) => x.kind)).size === 4)

  const choice = q.filter((x) => x.kind !== 'arrange')
  ok('選擇題四選項', choice.every((x) => x.options!.length === 4))
  ok('正解在選項內', choice.every((x) => x.options!.includes(x.answer)))
  ok('選項互異', choice.every((x) => new Set(x.options).size === x.options!.length))
  ok('listen 題有讀音、prompt 空', q.filter((x) => x.kind === 'listen').every((x) => x.promptRead && !x.prompt))

  const arr = q.filter((x) => x.kind === 'arrange')
  ok(
    'arrange tiles 為答案字元的排列',
    arr.every((x) => [...x.answer].slice().sort().join('') === x.tiles!.slice().sort().join('')),
  )
  ok('seed 相同 → 結果可重現', JSON.stringify(generateQuiz(pool, 6, seededRng(7))) === JSON.stringify(generateQuiz(pool, 6, seededRng(7))))
}

console.log('=== 5f. 朗讀逐字上色對齊 ===')
{
  // 空白不計入 cleaned 索引（與 tts clean() 一致）
  const c = karaokeChars('きょうは いい')
  ok('非空白字元 ci 連續遞增', c.filter((x) => x.ci >= 0).map((x) => x.ci).join(',') === '0,1,2,3,4,5')
  ok('空白 ci = -1', c.find((x) => x.ch === ' ')!.ci === -1)
  // 去標籤
  ok('ruby 標籤剝除', karaokeChars('<ruby>山<rt>やま</rt></ruby>').every((x) => x.ch !== '<'))

  // 範圍高亮
  const chars = karaokeChars('みずをください')
  const set = activeCharIndices(chars, 0, 2)
  ok('range [0,2) 高亮前兩字', set.has(0) && set.has(1) && !set.has(2))
  // 未知長度（end<=start）→ 高亮整個「詞」（此處無空白＝整句）
  const spaced = karaokeChars('きょう は')
  const w = activeCharIndices(spaced, 0, 0)
  ok('未知長度：高亮 start 所在的詞', w.has(0) && w.has(1) && w.has(2) && !w.has(3))
  ok('空白不被高亮', !activeCharIndices(spaced, 0, 3).has(3))
}

console.log('=== 5g. 聽力理解出題 ===')
{
  const pool: ListenItem[] = Array.from({ length: 12 }, (_, i) => ({
    play: `ぶん${i}`,
    reveal: `ぶん${i}`,
    zh: `中文${i}`,
  }))
  ok('LISTEN_MIN_POOL 為 4', LISTEN_MIN_POOL === 4)
  ok('不足 4 句 → 空', listeningQuestions(pool.slice(0, 3), 5, seededRng(1)).length === 0)
  const qs = listeningQuestions(pool, 5, seededRng(3))
  ok('產出 5 題', qs.length === 5)
  ok('每題四選項', qs.every((x) => x.options.length === 4))
  ok('正解在選項內', qs.every((x) => x.options.includes(x.answer)))
  ok('選項互異', qs.every((x) => new Set(x.options).size === 4))
  ok('answer 對得上某句 zh', qs.every((x) => pool.some((p) => p.zh === x.answer)))
  ok('seed 相同可重現', JSON.stringify(listeningQuestions(pool, 5, seededRng(9))) === JSON.stringify(listeningQuestions(pool, 5, seededRng(9))))

  // 段落聽解選材
  const paras = [
    { id: 'a', options: ['甲', '乙', '丙', '丁'] },
    { id: 'b', options: ['戊', '己', '庚', '辛'] },
    { id: 'c', options: ['壬', '癸', '子', '丑'] },
    { id: 'd', options: ['寅', '卯', '辰', '巳'] },
  ]
  const picked = pickParagraphs(paras, 3, seededRng(5))
  ok('段落取 3 篇', picked.length === 3)
  ok('段落選項洗牌後仍為原集合', picked.every((p) => {
    const orig = paras.find((x) => x.id === p.id)!
    return [...p.options].sort().join() === [...orig.options].sort().join()
  }))
  ok('段落 seed 可重現', JSON.stringify(pickParagraphs(paras, 3, seededRng(2))) === JSON.stringify(pickParagraphs(paras, 3, seededRng(2))))
}

console.log('=== 5h. 短文分類與段落理解題 ===')
{
  ok('每篇短文都有分類', PASSAGES.every((p) => PASSAGE_CATS.includes(p.cat)))
  const withQuiz = PASSAGES.filter((p) => p.quiz)
  ok('有理解題的短文 ≥ 8 篇', withQuiz.length >= 8)
  ok('理解題四選項且含正解', withQuiz.every((p) => p.quiz!.options.length === 4 && p.quiz!.options.includes(p.quiz!.answer)))
  ok('四個分類都有短文', PASSAGE_CATS.every((c) => PASSAGES.some((p) => p.cat === c)))
}

console.log('=== 5i. JLPT 題型：即時応答・発話表現 ===')
{
  // 資料完整性：正解不在誘答內、各題選項湊得到 3~4 個
  ok('即時応答題庫 ≥ 10', RESPONSES.length >= 10)
  ok('発話表現題庫 ≥ 10', EXPRESSIONS.length >= 10)
  ok('即時応答 id 唯一', new Set(RESPONSES.map((r) => r.id)).size === RESPONSES.length)
  ok('発話表現 id 唯一', new Set(EXPRESSIONS.map((e) => e.id)).size === EXPRESSIONS.length)
  ok('即時応答正解不混入誘答', RESPONSES.every((r) => !r.distractors.includes(r.answer)))
  ok('発話表現正解不混入誘答', EXPRESSIONS.every((e) => !e.distractors.includes(e.answer)))

  const rq = responseQuestions(RESPONSES, 5, seededRng(4))
  ok('即時応答產出 5 題', rq.length === 5)
  ok('即時応答含正解', rq.every((x) => x.options.includes(x.answer)))
  ok('即時応答選項互異', rq.every((x) => new Set(x.options).size === x.options.length))
  ok('即時応答帶播放日文與中文', rq.every((x) => x.play && x.playZh && x.answerZh))
  ok('即時応答 seed 可重現', JSON.stringify(responseQuestions(RESPONSES, 5, seededRng(7))) === JSON.stringify(responseQuestions(RESPONSES, 5, seededRng(7))))

  const eq = expressionQuestions(EXPRESSIONS, 5, seededRng(6))
  ok('発話表現產出 5 題', eq.length === 5)
  ok('発話表現含正解', eq.every((x) => x.options.includes(x.answer)))
  ok('発話表現選項互異', eq.every((x) => new Set(x.options).size === x.options.length))
  ok('発話表現帶情境中文', eq.every((x) => x.situationZh && x.answerZh))
  ok('n 大於題庫時不超量', expressionQuestions(EXPRESSIONS.slice(0, 3), 5, seededRng(1)).length === 3)
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
