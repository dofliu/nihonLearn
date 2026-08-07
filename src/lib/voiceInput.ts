/**
 * 語音輸入（口說回話）的純邏輯：辨識候選挑選、文字正規化、與輸入框合併、錯誤訊息。
 *
 * 誠實定位：語音辨識**會聽錯**（尤其初學者的發音），所以辨識結果一律先填進輸入框、
 * 讓使用者確認／修改後才送出，不直接代替使用者發言。這也讓「說完發現辨識不準」時
 * 不會污染對話紀錄。
 *
 * 無依賴（不碰 window / Capacitor / Dexie），供 Node 測試 import。
 */

/** 空白正規化：全形空白也算空白，連續空白收成一個半形空白，去頭尾。 */
export function cleanSpoken(raw: string): string {
  return (raw || '').replace(/[\s　]+/g, ' ').trim()
}

/**
 * 從 ASR 的多個候選挑一句：取第一個非空的。
 * （web SpeechRecognition 與 Android SpeechRecognizer 都已按信心度排序，
 * 自由對話沒有目標句可比對，所以不像跟讀那樣用 similarity 挑最像的。）
 */
export function pickBestAlternative(alts: readonly string[]): string {
  for (const a of alts || []) {
    const c = cleanSpoken(a)
    if (c) return c
  }
  return ''
}

/**
 * 把辨識到的句子併進輸入框既有內容——讓使用者可以「先打一半、再用說的補」，
 * 或連續說兩次。既有內容為空時就是辨識結果本身。
 */
export function mergeSpoken(existing: string, spoken: string): string {
  const s = cleanSpoken(spoken)
  const e = cleanSpoken(existing)
  if (!s) return existing
  if (!e) return s
  return e + ' ' + s
}

/** 語音輸入的錯誤 → 使用者看得懂的繁體中文提示（一律附「可以改用打字」的退路）。 */
export function voiceErrorMessage(code: string): string {
  switch (code) {
    case 'no-asr':
      return '這個環境不支援語音輸入 — 用打字的也可以'
    case 'not-allowed':
    case 'service-not-allowed':
    case 'no-permission':
      return '沒有麥克風權限 — 請允許後再試，或改用打字'
    case 'audio-capture':
      return '找不到麥克風 — 用打字的也可以'
    case 'no-speech':
      return '沒聽到聲音 — 再按一次麥克風，或改用打字'
    case 'no-match':
      return '沒聽清楚 — 再說一次，或改用打字'
    case 'network':
      return '語音辨識連線失敗 — 用打字的也可以'
    case 'aborted':
      return '語音輸入取消了'
    default:
      return `語音輸入失敗（${code || 'unknown'}）— 用打字的也可以`
  }
}
