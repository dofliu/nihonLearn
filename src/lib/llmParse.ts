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

/** 從 Gemini 回應抽出文字（candidates[0].content.parts[].text）。 */
export function extractText(data: unknown): string {
  const d = data as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const parts = d?.candidates?.[0]?.content?.parts
  if (!parts) return ''
  return parts.map((p) => p.text ?? '').join('')
}
