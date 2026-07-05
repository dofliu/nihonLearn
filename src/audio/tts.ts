/**
 * TTS 抽象層。
 * v2 的核心升級路徑：預設用瀏覽器 Web Speech（零依賴、離線可用），
 * 但若偵測到 5090 上的 VOICEVOX sidecar 在線，改用它——自然度與可控韻律
 * 遠勝瀏覽器內建。呼叫端不需知道用的是哪個 provider。
 */

import { apiUrl, ttsCacheKey, probeHealth } from '../lib/sidecar'
import { getCachedTTS, putCachedTTS } from './ttsCache'

export interface TTSProvider {
  name: string
  speak(text: string, rate: number): Promise<void>
  available(): Promise<boolean>
}

function clean(text: string): string {
  return text.replace(/<[^>]+>/g, '').replace(/\s+/g, '')
}

// ---------- Web Speech（fallback，永遠可用） ----------
class WebSpeechTTS implements TTSProvider {
  name = 'web-speech'
  private voice: SpeechSynthesisVoice | null = null

  constructor() {
    if ('speechSynthesis' in window) {
      const pick = () => {
        const vs = speechSynthesis.getVoices()
        this.voice =
          vs.find((v) => v.lang === 'ja-JP') ||
          vs.find((v) => v.lang?.toLowerCase().startsWith('ja')) ||
          null
      }
      speechSynthesis.onvoiceschanged = pick
      pick()
    }
  }
  async available() {
    return 'speechSynthesis' in window
  }
  speak(text: string, rate: number): Promise<void> {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) return resolve()
      speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(clean(text))
      u.lang = 'ja-JP'
      if (this.voice) u.voice = this.voice
      u.rate = rate
      u.onend = () => resolve()
      u.onerror = () => resolve()
      speechSynthesis.speak(u)
    })
  }
}

// ---------- VOICEVOX（經 sidecar /api/tts） ----------
export interface VoicevoxSpeaker {
  id: number
  name: string
  style: string
}

class VoicevoxTTS implements TTSProvider {
  name = 'voicevox'
  private audio: HTMLAudioElement | null = null
  speakerId: number | null = null

  async available() {
    return (await probeHealth(1500)).voicevox
  }
  async listSpeakers(): Promise<VoicevoxSpeaker[]> {
    try {
      const r = await fetch(apiUrl('/api/speakers'), { signal: AbortSignal.timeout(3000) })
      if (!r.ok) return []
      const j = await r.json()
      if (this.speakerId == null) this.speakerId = j.default ?? null
      return j.speakers as VoicevoxSpeaker[]
    } catch {
      return []
    }
  }
  async speak(text: string, rate: number): Promise<void> {
    const t = clean(text)
    const key = ttsCacheKey(t, this.speakerId, rate)
    let blob = await getCachedTTS(key)
    if (!blob) {
      // cache miss → 打 sidecar；失敗就靜默返回（與舊版 onerror 行為一致）
      try {
        const params = new URLSearchParams({ text: t, rate: String(rate) })
        if (this.speakerId != null) params.set('speaker', String(this.speakerId))
        const r = await fetch(apiUrl(`/api/tts?${params.toString()}`), {
          signal: AbortSignal.timeout(15000),
        })
        if (!r.ok) return
        blob = await r.blob()
        void putCachedTTS(key, blob)
      } catch {
        return
      }
    }
    const url = URL.createObjectURL(blob)
    return new Promise((resolve) => {
      this.audio?.pause()
      const a = new Audio(url)
      this.audio = a
      const done = () => {
        URL.revokeObjectURL(url)
        resolve()
      }
      a.onended = done
      a.onerror = done
      a.play().catch(done)
    })
  }
}

// ---------- 門面：自動選擇 ----------
let active: TTSProvider = new WebSpeechTTS()
const voicevox = new VoicevoxTTS()
let probed = false

export async function initTTS() {
  if (probed) return active.name
  probed = true
  if (await voicevox.available()) active = voicevox
  return active.name
}

/** 重新探測（sidecar 在 app 啟動後才開時可手動觸發切換） */
export async function reprobeTTS() {
  active = (await voicevox.available()) ? voicevox : new WebSpeechTTS()
  return active.name
}

export function ttsProviderName() {
  return active.name
}

/** VOICEVOX 說話者：僅在 voicevox 在線時有資料 */
export async function listSpeakers(): Promise<VoicevoxSpeaker[]> {
  return voicevox.listSpeakers()
}
export function setSpeaker(id: number) {
  voicevox.speakerId = id
}
export function getSpeaker(): number | null {
  return voicevox.speakerId
}

export async function speak(text: string, rate = 0.85) {
  return active.speak(text, rate)
}
