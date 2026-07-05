/**
 * VOICEVOX 音檔的 Dexie 快取（cache-first）。
 * 取代 v2 的 service worker CacheFirst：SW 在 Capacitor 自訂 scheme 上不可靠，
 * 且 sidecar base URL 可設定後 workbox pattern 也對不上。Web 版同樣走這裡。
 * 依賴 Dexie —— 勿從 tests/integration.ts import（Node 跑不動，見已知陷阱）。
 */
import { db } from '../db/schema'

const MAX_ENTRIES = 500 // 對齊原 workbox 設定

export async function getCachedTTS(key: string): Promise<Blob | null> {
  try {
    const hit = await db.ttsCache.get(key)
    if (!hit) return null
    void db.ttsCache.update(key, { lastUsed: Date.now() })
    return hit.blob
  } catch {
    return null
  }
}

export async function putCachedTTS(key: string, blob: Blob): Promise<void> {
  try {
    await db.ttsCache.put({ key, blob, lastUsed: Date.now() })
    const n = await db.ttsCache.count()
    if (n > MAX_ENTRIES) {
      const evict = await db.ttsCache.orderBy('lastUsed').limit(n - MAX_ENTRIES).primaryKeys()
      await db.ttsCache.bulkDelete(evict)
    }
  } catch {
    /* 快取失敗不影響播放 */
  }
}
