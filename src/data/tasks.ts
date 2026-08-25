/**
 * 每日五項修行的定義（驅動今日頁的任務列、蓋章判定與動線提示）。
 *
 * 從 `db/repo.ts` 抽出來獨立成純資料檔：repo 依賴 Dexie，Node 測試 import 不了，
 * 而 `lib/taskFlow.ts` 的動線邏輯應該對**真正在跑的這份定義**做測試，不是對副本。
 * `db/repo.ts` 仍 re-export `TASKS`，呼叫端 import 路徑不變。
 *
 * ⚠ 改動任務門檻＝改動「每日 10 分鐘」的核心約定，須刻意為之並補測試。
 */
export const TASKS = [
  { id: 'kana', name: '字の修行（五十音 SRS）', target: 10, tab: 'kana' },
  { id: 'vocab', name: 'ことば（今日的 5 語）', target: 5, tab: 'read' },
  { id: 'listen', name: '耳の修行（辨音 5 題）', target: 5, tab: 'listen' },
  { id: 'speak', name: '口の修行（跟讀 3 句）', target: 3, tab: 'speak' },
  { id: 'read', name: '読む修行（短文 1 篇）', target: 1, tab: 'read' },
] as const
