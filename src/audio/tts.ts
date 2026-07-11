/**
 * TTS 抽象層。優先序：VOICEVOX（sidecar 在線）> 原生 TTS（Android App）
 * > 瀏覽器 Web Speech（web 版 fallback）。呼叫端不需知道用的是哪個 provider。
 * Android WebView 沒有 speechSynthesis，原生 provider 走
 * @capacitor-community/text-to-speech（系統 TTS 引擎的 ja-JP 聲音）。
 */

import { Capacitor } from '@capacitor/core'
import { apiUrl, ttsCacheKey, probeHealth } from '../lib/sidecar'
import { getCachedTTS, putCachedTTS } from './ttsCache'

/** 朗讀選項：onBoundary 回報正在唸的字元範圍（cleaned 索引），供逐字上色。 */
export interface SpeakOpts {
  onBoundary?: (start: number, end: number) => void
}

export interface TTSProvider {
  name: string
  speak(text: string, rate: number, opts?: SpeakOpts): Promise<void>
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
  speak(text: string, rate: number, opts?: SpeakOpts): Promise<void> {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) return resolve()
      speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(clean(text))
      u.lang = 'ja-JP'
      if (this.voice) u.voice = this.voice
      u.rate = rate
      if (opts?.onBoundary) {
        u.onboundary = (e) => {
          const len = (e as SpeechSynthesisEvent & { charLength?: number }).charLength || 0
          opts.onBoundary!(e.charIndex, len ? e.charIndex + len : e.charIndex)
        }
      }
      u.onend = () => resolve()
      u.onerror = () => resolve()
      speechSynthesis.speak(u)
    })
  }
}

// ---------- 原生 TTS（Capacitor；Android WebView 無 Web Speech 的替代） ----------
class NativeTTS implements TTSProvider {
  name = 'native'
  async available() {
    if (!Capacitor.isNativePlatform()) return false
    try {
      const { TextToSpeech } = await import('@capacitor-community/text-to-speech')
      const { languages } = await TextToSpeech.getSupportedLanguages()
      return languages.some((l) => l.toLowerCase().startsWith('ja'))
    } catch {
      return false
    }
  }
  async speak(text: string, rate: number, opts?: SpeakOpts): Promise<void> {
    let handle: { remove: () => Promise<void> } | undefined
    try {
      const { TextToSpeech } = await import('@capacitor-community/text-to-speech')
      await TextToSpeech.stop().catch(() => {})
      if (opts?.onBoundary) {
        // Android UtteranceProgressListener.onRangeStart：逐詞回報字元範圍
        handle = await TextToSpeech.addListener('onRangeStart', (info) =>
          opts.onBoundary!(info.start, info.end),
        )
      }
      // rate 刻度與 Web Speech 未必等感，真機聽感校準見 tests/MANUAL_QA-ANDROID.md
      await TextToSpeech.speak({ text: clean(text), lang: 'ja-JP', rate, category: 'playback' })
    } catch {
      /* 與其他 provider 一致：播放失敗不拋錯 */
    } finally {
      await handle?.remove().catch(() => {})
    }
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
  async speak(text: string, rate: number, _opts?: SpeakOpts): Promise<void> {
    // VOICEVOX 播放 WAV blob，無逐字邊界事件；卡拉OK上色在此 provider 下不移動。
    void _opts
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
const voicevox = new VoicevoxTTS()
const native = new NativeTTS()
let active: TTSProvider = new WebSpeechTTS()
let probed = false

async function pickProvider(): Promise<TTSProvider> {
  if (await voicevox.available()) return voicevox
  if (await native.available()) return native
  return new WebSpeechTTS()
}

export async function initTTS() {
  if (probed) return active.name
  probed = true
  active = await pickProvider()
  return active.name
}

/** 重新探測（sidecar 在 app 啟動後才開時可手動觸發切換） */
export async function reprobeTTS() {
  active = await pickProvider()
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

export async function speak(text: string, rate = 0.85, opts?: SpeakOpts) {
  return active.speak(text, rate, opts)
}
