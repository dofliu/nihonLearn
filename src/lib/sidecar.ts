/**
 * Sidecar 位址抽象。
 * Web 版：base 預設空字串 → fetch('/api/…') 相對路徑，dev proxy／同源部署照舊。
 * Android（Capacitor）版：App 的 origin 是 https://localhost，必須在設定頁填
 * sidecar 的絕對網址（Cloudflare Tunnel / Tailscale）。
 * 存 localStorage 而非 Dexie：這是「裝置層」設定，需在 DB 開啟前同步可讀，
 * 也不該跟著學習進度備份在裝置間搬移。
 * 純函式（normalizeBase / joinApi / ttsCacheKey）供 Node 測試直接 import，
 * 不得在模組層碰 window / localStorage。
 */

const LS_KEY = 'nihongo-michi:sidecarBase'

/** 使用者輸入 → 標準化 base URL。空值回 ''；無 scheme 補 https://；去尾斜線。 */
export function normalizeBase(input: string): string {
  let s = (input || '').trim()
  if (!s) return ''
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s
  return s.replace(/\/+$/, '')
}

/** base + path（path 以 / 開頭）。base 為空 → 維持相對路徑。 */
export function joinApi(base: string, path: string): string {
  return base ? base + path : path
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

export function getSidecarBase(): string {
  return storage()?.getItem(LS_KEY) || ''
}

export function setSidecarBase(input: string): string {
  const base = normalizeBase(input)
  const st = storage()
  if (st) {
    if (base) st.setItem(LS_KEY, base)
    else st.removeItem(LS_KEY)
  }
  return base
}

/** 全站 sidecar API 的唯一取址口。 */
export function apiUrl(path: string): string {
  return joinApi(getSidecarBase(), path)
}

/** TTS 音檔快取 key（Dexie ttsCache 表用）。speaker null＝sidecar 預設聲線。 */
export function ttsCacheKey(text: string, speakerId: number | null, rate: number): string {
  return `${speakerId ?? 'default'}|${rate}|${text}`
}

export interface SidecarHealth {
  ok: boolean
  voicevox: boolean
  whisper: boolean
  content: boolean
}

/** 打 /health 測連線（設定頁「測試連線」與各 provider 偵測共用）。 */
export async function probeHealth(timeoutMs = 3000): Promise<SidecarHealth> {
  try {
    const r = await fetch(apiUrl('/api/health'), { signal: AbortSignal.timeout(timeoutMs) })
    if (!r.ok) return { ok: false, voicevox: false, whisper: false, content: false }
    const j = await r.json()
    return {
      ok: true,
      voicevox: Boolean(j.voicevox),
      whisper: Boolean(j.whisper),
      content: Boolean(j.content),
    }
  } catch {
    return { ok: false, voicevox: false, whisper: false, content: false }
  }
}
