/**
 * 發音評分。
 * v2 保留兩條路：
 *  1) 瀏覽器 SpeechRecognition（即時、免費，但 Chrome 限定且送雲端）
 *  2) sidecar /api/score：錄音上傳 → faster-whisper 轉寫 → 假名對齊相似度
 *     （跑在 5090，離線、可做到音素級 GOP，是 v2 的差異化天花板）
 * 目前實作 (1) 與相似度計算；(2) 的介面已備好，sidecar 完成後切換即可。
 * 注意：本檔被 tests/integration.ts 在 Node 直接 import，模組層不得碰瀏覽器 API。
 */
import { apiUrl, probeHealth } from '../lib/sidecar.ts'

// ---------- 假名正規化 + 相似度 ----------
function kataToHira(s: string): string {
  return s.replace(/[\u30a1-\u30f6]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0x60),
  )
}
export function normKana(s: string): string {
  return kataToHira((s || '').replace(/[。、！？!?.,\s「」]/g, ''))
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  let cur = new Array<number>(n + 1)
  for (let i = 1; i <= m; i++) {
    cur[0] = i
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    ;[prev, cur] = [cur, prev]
  }
  return prev[n]
}

/** 0-100 相似度；target 可傳多個（如 假名版 + 漢字版），取最高 */
export function similarity(heard: string, targets: string[]): number {
  const h = normKana(heard)
  if (!h) return 0
  let best = 0
  for (const t of targets) {
    const nt = normKana(t)
    if (!nt) continue
    const score = 1 - levenshtein(h, nt) / Math.max(h.length, nt.length)
    best = Math.max(best, score)
  }
  return Math.round(best * 100)
}

// ---------- Web Speech ASR ----------
export interface MoraDiff {
  mora: string
  status: 'ok' | 'sub' | 'del'
}
export interface ScoreResult {
  score: number
  transcript: string
  source: 'asr' | 'self'
  moraDiff?: MoraDiff[]
}

type SR = SpeechRecognitionCtor
function getSR(): SR | undefined {
  return window.SpeechRecognition || window.webkitSpeechRecognition
}

export function asrAvailable(): boolean {
  return Boolean(getSR())
}

/** 錄一次音並評分。無 ASR / 拒絕權限時 reject，呼叫端 fallback 到自評。 */
export function recognizeAndScore(targets: string[]): Promise<ScoreResult> {
  return new Promise((resolve, reject) => {
    const SRCls = getSR()
    if (!SRCls) return reject(new Error('no-asr'))
    const rec = new SRCls()
    rec.lang = 'ja-JP'
    rec.interimResults = false
    rec.maxAlternatives = 3
    rec.onresult = (e: SpeechRecognitionEvent) => {
      let best = 0
      let bestTxt = ''
      const alts = e.results[0]
      for (let i = 0; i < alts.length; i++) {
        const sc = similarity(alts[i].transcript, targets)
        if (sc >= best) {
          best = sc
          bestTxt = alts[i].transcript
        }
      }
      resolve({ score: best, transcript: bestTxt, source: 'asr' })
    }
    rec.onerror = (e: Event & { error?: string }) =>
      reject(new Error(e.error || 'asr-error'))
    try {
      rec.start()
    } catch {
      reject(new Error('start-failed'))
    }
  })
}

// ---------- sidecar whisper（跑在 5090，離線、可音素級） ----------
export type ScoreEngine = 'whisper' | 'asr' | 'none'

/** 偵測最佳評分引擎：whisper > 瀏覽器 ASR > 無（自評） */
export async function detectScoreEngine(): Promise<ScoreEngine> {
  if ((await probeHealth(1500)).whisper) return 'whisper'
  return asrAvailable() ? 'asr' : 'none'
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onloadend = () => resolve(r.result as string)
    r.onerror = () => reject(new Error('read-fail'))
    r.readAsDataURL(blob)
  })
}

/**
 * 錄音 → sidecar /score（faster-whisper）。
 * 用法：const rec = new SidecarRecorder(); await rec.start(); ...; const res = await rec.stopAndScore(targets)
 * 與瀏覽器 ASR 不同，這是「手動開始/停止」模式（whisper 不會自動偵測語尾）。
 */
export class SidecarRecorder {
  private mr: MediaRecorder | null = null
  private chunks: Blob[] = []
  private stream: MediaStream | null = null

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.chunks = []
    this.mr = new MediaRecorder(this.stream)
    this.mr.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.mr.start()
  }

  async stopAndScore(targets: string[]): Promise<ScoreResult> {
    if (!this.mr) throw new Error('not-recording')
    const done = new Promise<Blob>((resolve) => {
      this.mr!.onstop = () => resolve(new Blob(this.chunks, { type: 'audio/webm' }))
    })
    this.mr.stop()
    const blob = await done
    this.stream?.getTracks().forEach((t) => t.stop())
    const b64 = await blobToBase64(blob)
    const r = await fetch(apiUrl('/api/score'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio_base64: b64, targets }),
    })
    if (!r.ok) throw new Error('score-http-' + r.status)
    const j = (await r.json()) as {
      transcript: string
      score: number
      mora_diff?: MoraDiff[]
    }
    return { score: j.score, transcript: j.transcript, source: 'asr', moraDiff: j.mora_diff }
  }

  cancel() {
    try {
      this.mr?.stop()
    } catch {
      /* noop */
    }
    this.stream?.getTracks().forEach((t) => t.stop())
  }
}
