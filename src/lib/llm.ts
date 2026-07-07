/**
 * Gemini 直連 client。AI 生成（生成句、文章中文對照）直接由 App 呼叫
 * Google Generative Language API，不再經 sidecar——手機免內網穿透即可用。
 *
 * 金鑰只存裝置本機（localStorage），不進 git / APK / 備份。這對「個人自用、
 * 自己安裝」的 App 是可接受的取捨（金鑰是你的、在你自己的裝置上）。
 *
 * CORS：原生（Android）走 Capacitor 原生 HTTP（不受 WebView CORS 限制）；
 * 網頁版走一般 fetch（Gemini 端點允許跨源）。
 *
 * 純函式（stripJsonFences / extractText）供 Node 測試 import；模組層不碰 window。
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { stripJsonFences, extractText } from './llmParse'
export { stripJsonFences, extractText } from './llmParse'

const LS_KEY = 'nihongo-michi:geminiKey'
const LS_MODEL = 'nihongo-michi:geminiModel'
export const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash'

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

export function getGeminiKey(): string {
  return storage()?.getItem(LS_KEY) || ''
}
export function setGeminiKey(k: string): void {
  const st = storage()
  const v = (k || '').trim()
  if (!st) return
  if (v) st.setItem(LS_KEY, v)
  else st.removeItem(LS_KEY)
}
export function getGeminiModel(): string {
  return storage()?.getItem(LS_MODEL) || DEFAULT_GEMINI_MODEL
}
export function setGeminiModel(m: string): void {
  const st = storage()
  const v = (m || '').trim()
  if (!st) return
  if (v) st.setItem(LS_MODEL, v)
  else st.removeItem(LS_MODEL)
}

/** 是否已設定 AI 生成（有金鑰）。無金鑰時呼叫端走離線降級。 */
export function hasLLM(): boolean {
  return Boolean(getGeminiKey())
}

function endpoint(model: string, key: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(key)}`
}

function buildBody(system: string, user: string, asJson: boolean) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
      ...(asJson ? { responseMimeType: 'application/json' } : {}),
    },
  }
}

async function callGemini(system: string, user: string, asJson: boolean): Promise<string> {
  const key = getGeminiKey()
  if (!key) throw new Error('no-key')
  const url = endpoint(getGeminiModel(), key)
  const body = buildBody(system, user, asJson)

  if (Capacitor.isNativePlatform()) {
    // 原生 HTTP：繞過 WebView 的 CORS
    const r = await CapacitorHttp.post({
      url,
      headers: { 'Content-Type': 'application/json' },
      data: body,
      readTimeout: 90000,
      connectTimeout: 15000,
    })
    if (r.status < 200 || r.status >= 300) throw new Error('gemini-http-' + r.status)
    // CapacitorHttp 已把 JSON 回應解析成物件
    return extractText(typeof r.data === 'string' ? JSON.parse(r.data) : r.data)
  }

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  })
  if (!r.ok) throw new Error('gemini-http-' + r.status)
  return extractText(await r.json())
}

/** 呼叫 Gemini 並解析 JSON 物件。無金鑰 → 'no-key'；解析失敗 → 'gemini-bad-json'。 */
export async function generateJSON(system: string, user: string): Promise<unknown> {
  const text = await callGemini(system, user, true)
  if (!text) throw new Error('gemini-empty')
  try {
    return JSON.parse(stripJsonFences(text))
  } catch {
    throw new Error('gemini-bad-json')
  }
}

/** 設定頁「測試」用：小請求驗證金鑰可用。 */
export async function probeGemini(): Promise<{ ok: boolean; error?: string }> {
  try {
    const text = await callGemini(
      '只回覆一個字。',
      '請只回覆：ok',
      false,
    )
    return { ok: Boolean(text) }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
