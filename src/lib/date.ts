/** 本地時區的 YYYY-MM-DD */
export function todayStr(d = new Date()): string {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  )
}

export function dateStr(d: Date): string {
  return todayStr(d)
}

/** 從 today 往回數連續蓋章天數 */
export function computeStreak(stampDates: Set<string>): number {
  let n = 0
  const d = new Date()
  if (!stampDates.has(todayStr(d))) d.setDate(d.getDate() - 1)
  while (stampDates.has(todayStr(d))) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

/** 最近 n 天的日期字串（舊 → 新） */
export function lastNDays(n: number): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    out.push(todayStr(d))
  }
  return out
}
