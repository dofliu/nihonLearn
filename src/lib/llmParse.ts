/**
 * Gemini 回應的純解析工具（無任何 Capacitor/瀏覽器依賴），供 Node 測試 import。
 */

/** 去除 ```json ... ``` 圍欄，回純 JSON 字串。 */
export function stripJsonFences(s: string): string {
  let t = (s || '').trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-zA-Z]*\n?/, '')
    if (t.endsWith('```')) t = t.slice(0, -3)
  }
  return t.trim()
}

export interface ChatMsg {
  role: 'user' | 'model'
  text: string
}

/** 對話歷史 → Gemini contents 陣列（role 對映 user/model）。 */
export function chatContents(history: ChatMsg[]): { role: string; parts: { text: string }[] }[] {
  return history.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.text }],
  }))
}

/** 一道中文理解題（LLM 只生中文問題與中文選項；日文題材來自已驗證短文，不由 LLM 生）。 */
export interface ListenQCandidate {
  q: string // 中文問題
  options: string[] // 3~4 個中文選項（含正解）
  answer: string // 正解（須為 options 之一）
}

/**
 * 純解析 Gemini 生成的中文理解題。容錯：只收「問題非空、選項 3~4 個互異、
 * 正解在選項內」的題；其餘丟棄。回傳乾淨陣列（可能為空）。無 Capacitor/瀏覽器依賴。
 */
export function parseListenQuestions(raw: unknown): ListenQCandidate[] {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { questions?: unknown[] })?.questions)
      ? (raw as { questions: unknown[] }).questions
      : []
  const out: ListenQCandidate[] = []
  for (const item of arr) {
    const it = item as { q?: unknown; options?: unknown; answer?: unknown }
    const q = typeof it?.q === 'string' ? it.q.trim() : ''
    const answer = typeof it?.answer === 'string' ? it.answer.trim() : ''
    const options = Array.isArray(it?.options)
      ? it.options.filter((o): o is string => typeof o === 'string').map((o) => o.trim()).filter(Boolean)
      : []
    const uniq = Array.from(new Set(options))
    if (!q || !answer) continue
    if (uniq.length < 3 || uniq.length > 4) continue
    if (!uniq.includes(answer)) continue
    out.push({ q, options: uniq, answer })
  }
  return out
}

/** 自由對話（角色扮演）的一回合：對方台詞＋中文翻譯＋對你上一句的中文小提示。 */
export interface RoleplayTurn {
  jp: string // 對方的日文台詞（AI 生成，僅供參考、不入庫）
  zh: string // 中文翻譯
  hint: string // 中文小提示（用詞是否恰當／更道地的說法）
}

/**
 * 純解析 Gemini 的角色扮演回合。容錯：接受物件或（含 ``` 圍欄的）JSON 字串、
 * 陣列取第一筆；`jp` 為必要欄位，`zh`/`hint` 缺少時以空字串補。解析不出 → null，
 * 由呼叫端提示重試（不入庫、不進 SRS）。無 Capacitor/瀏覽器依賴。
 */
export function parseRoleplayTurn(raw: unknown): RoleplayTurn | null {
  let obj: unknown = raw
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(stripJsonFences(obj))
    } catch {
      return null
    }
  }
  if (Array.isArray(obj)) obj = obj[0]
  if (!obj || typeof obj !== 'object') return null
  const it = obj as { jp?: unknown; zh?: unknown; hint?: unknown }
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const jp = str(it.jp)
  if (!jp) return null
  return { jp, zh: str(it.zh), hint: str(it.hint) }
}

/** 從 Gemini 回應抽出文字（candidates[0].content.parts[].text）。 */
export function extractText(data: unknown): string {
  const d = data as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const parts = d?.candidates?.[0]?.content?.parts
  if (!parts) return ''
  return parts.map((p) => p.text ?? '').join('')
}
