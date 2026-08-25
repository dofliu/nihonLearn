import { create } from 'zustand'
import {
  TASKS,
  getToday,
  allStampDates,
  bumpTask,
  getSetting,
  setSetting,
  attemptStats,
  todayActivityFeatures,
} from '../db/repo'
import { computeStreak } from '../lib/date'
import { hasExtraFeature } from '../lib/activity'
import { buildNextUp, type NextUp } from '../lib/taskFlow'
import { initTTS, reprobeTTS, ttsProviderName, setSpeaker } from '../audio/tts'

interface AppState {
  ready: boolean
  streak: number
  counts: Record<string, number>
  newIntro: number
  rate: number
  ttsName: string
  asrAvg: number | null
  showKanji: boolean
  lastStamped: string | null // 觸發蓋章動畫用
  lastStampGold: boolean // 蓋章當下是否已做過加練（大印同步升金）
  nextUp: NextUp | null // 某項修行剛達標 → 提示下一項（動線提示條）
  refresh: () => Promise<void>
  bump: (taskId: string, n?: number) => Promise<void>
  setRate: (r: number) => Promise<void>
  toggleKanji: () => Promise<void>
  reprobe: () => Promise<void>
  clearStampFlag: () => void
  clearNextUp: () => void
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  streak: 0,
  counts: {},
  newIntro: 0,
  rate: 0.85,
  ttsName: 'web-speech',
  asrAvg: null,
  showKanji: false,
  lastStamped: null,
  lastStampGold: false,
  nextUp: null,

  async refresh() {
    const [day, stamps, rate, stats, showKanji] = await Promise.all([
      getToday(),
      allStampDates(),
      getSetting<number>('rate', 0.85),
      attemptStats(),
      getSetting<boolean>('showKanji', false),
    ])
    set({
      ready: true,
      counts: day.counts,
      newIntro: day.newIntro,
      streak: computeStreak(stamps),
      rate,
      asrAvg: stats.asrAvg,
      ttsName: ttsProviderName(),
      showKanji,
    })
  },

  async bump(taskId, n = 1) {
    const before = get().counts
    const { day, stamped } = await bumpTask(taskId, n)
    // 這一次計數是否讓某項修行剛好達標 → 算出接下來該去哪一項（純函式）
    const up = buildNextUp(TASKS, before, day.counts)
    await get().refresh()
    if (stamped) {
      // 核心全達標的當下若已做過任一加練 → 大印同步升金印（與蓋章格一致）
      const feats = await todayActivityFeatures()
      const gold = hasExtraFeature(feats)
      set({ lastStamped: new Date().toISOString(), lastStampGold: gold, nextUp: null })
    } else if (up) {
      set({ nextUp: up })
    }
  },

  async setRate(r) {
    await setSetting('rate', r)
    set({ rate: r })
  },

  async toggleKanji() {
    const next = !get().showKanji
    await setSetting('showKanji', next)
    set({ showKanji: next })
  },

  async reprobe() {
    const name = await reprobeTTS()
    const spk = await getSetting<number | null>('voicevoxSpeaker', null)
    if (spk != null) setSpeaker(spk)
    set({ ttsName: name })
  },

  clearStampFlag() {
    set({ lastStamped: null })
  },

  clearNextUp() {
    set({ nextUp: null })
  },
}))

export { TASKS }

/** app 啟動：探測 TTS provider，套用已存說話者，載入狀態 */
export async function bootstrap() {
  // 學習進度都在 IndexedDB——請求持久化儲存，降低被系統回收的風險
  void navigator.storage?.persist?.().catch(() => {})
  await initTTS()
  const spk = await getSetting<number | null>('voicevoxSpeaker', null)
  if (spk != null) setSpeaker(spk)
  await useApp.getState().refresh()
}
