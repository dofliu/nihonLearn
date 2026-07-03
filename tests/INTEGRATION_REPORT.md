# 整合測試報告 — 日本語の道 v2

執行環境：Node 22.22 / Vite 5.4 / TypeScript 5.5（strict）/ Python 3.12 + FastAPI。
日期：收尾整合回合。

## 摘要

| 層級 | 方式 | 結果 |
|------|------|------|
| 建置 | `tsc -b && vite build`（strict） | ✅ 綠燈，75 模組，PWA sw 生成 |
| 前端邏輯 | `npm test`（Node 直跑真實 .ts 原始碼） | ✅ 31 / 31 |
| 後端端到端 | 真 sidecar + mock VOICEVOX + curl | ✅ health / speakers / tts / content |
| 後端評分 | `sidecar/test_score.py`（注入假 whisper） | ✅ 4 / 4 |
| 靜態服務 | `vite preview` + curl | ✅ index / sw.js / manifest 皆 200 |

自動化涵蓋不到的 UI 點按流程，見 `MANUAL_QA.md`。

## 前端邏輯（31 項，直接對原始碼執行）

- **FSRS 排程**：新卡狀態、good 增 reps、easy 到期晚於 good、連續 good 定著、Review 狀態 forgot 計 lapse、新卡即到期。
  - 附帶發現：lapse 只在 Review 狀態答錯才計（Learning 不計）——測試已據此修正，這是 FSRS 正確語義。
- **Pitch pattern**：あめ雨 HL／飴 LH、はし橋 LH、にほんご LHHH、拗音合併、四種型名。
- **發音相似度**：完全一致=100、片假名正規化、多 target 取最高、部分相符介於 0–100。
- **日期 / streak**：連續兩日=2、只今日=1、斷開舊章不計、lastNDays 長度。
- **覆蓋率檢核**：已知詞句高覆蓋且不 flag、超綱句 flagged 且標出未覆蓋段。
- **資料完整性**：假名 142 枚且 id 唯一、KANA_BY_ID 對應、詞彙 jp 唯一、每詞有中文/分類/級別。

## 後端 /score mora 診斷（4 項）

用假 whisper 注入模擬各種發音錯誤，驗證回傳的逐拍診斷：

| 目標 | 唸成 | 診斷 |
|------|------|------|
| これをください | （正確） | 全 ok，score 100 |
| きって | きて | **っ[del]**（促音漏發）, score 67 |
| でんき | てんき | **で[sub]**（濁音清化） |
| しゅぎょう | しゅぎょ | しゅ[ok]・**う[del]**（拗音正確合併、尾拍漏發） |

正是中文母語者的三大盲點，被逐拍精準標出。

## 後端端到端

- `/health` → `voicevox:true`（連 mock）、`whisper:false`、`content:false`，旗標正確反映能力。
- `/speakers` → 攤平回 4 個聲線 + default。
- `/tts?speaker=3&rate=0.85` → 合法 WAV 7200 frames（rate 影響音長）。
- `/content`（無 key）→ 3 個示範候選，`demo:true`、`needs_review:true`。

## 重構附帶收穫

覆蓋率檢核從 `content.ts`（依賴 Dexie）抽成獨立無依賴模組 `lib/coverage.ts`，
使其可被 Node 直接測試，生產程式碼也更乾淨（`content.ts` re-export，呼叫端不變）。

## 未由自動化涵蓋

- 瀏覽器 IndexedDB 實際讀寫、React 互動、MediaRecorder 錄音、Web Speech、PWA 安裝／離線 — 見 `MANUAL_QA.md`。
- 真 VOICEVOX 人聲、真 faster-whisper 轉寫、真 LLM 生成 — 需在 5090 上以真服務驗證（介面已用 mock／假模型證明相容）。
