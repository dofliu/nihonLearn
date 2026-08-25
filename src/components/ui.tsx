import { useEffect, useState } from 'react'
import { useApp } from '../state/store'

// ---------- 全域 toast ----------
let toastCb: ((msg: string) => void) | null = null
export function toast(msg: string) {
  toastCb?.(msg)
}

export function Toast() {
  const [msg, setMsg] = useState('')
  const [show, setShow] = useState(false)
  useEffect(() => {
    toastCb = (m: string) => {
      setMsg(m)
      setShow(true)
      window.setTimeout(() => setShow(false), 1800)
    }
    return () => {
      toastCb = null
    }
  }, [])
  return <div className={'toast' + (show ? ' show' : '')}>{msg}</div>
}

// ---------- 進度條（測驗／聞き取り／音→字 等多題流程共用） ----------
export function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0
  return (
    <div
      className="progressBar"
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={0}
      aria-valuemax={total}
    >
      <div className="progressBarFill" style={{ width: `${pct}%` }} />
    </div>
  )
}

// ---------- 蓋章大印（五項全完成時） ----------
export function BigStamp() {
  const lastStamped = useApp((s) => s.lastStamped)
  const gold = useApp((s) => s.lastStampGold)
  const clear = useApp((s) => s.clearStampFlag)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (lastStamped) {
      setVisible(true)
      const t = window.setTimeout(() => {
        setVisible(false)
        clear()
      }, 2600)
      return () => window.clearTimeout(t)
    }
  }, [lastStamped, clear])
  if (!visible) return null
  const d = new Date()
  const label = `${d.getMonth() + 1}／${d.getDate()}`
  return (
    <div className="bigStamp" onClick={() => setVisible(false)}>
      <div className={'inner' + (gold ? ' gold' : '')}>
        <div className="b1">済</div>
        <div className="b2">{gold ? `金印 ${label}` : label}</div>
      </div>
    </div>
  )
}

// ---------- 動線提示條（某項修行剛達標 → 直接前往下一項） ----------
/**
 * 核心五修行散在四個分頁，過去每完成一項都得自己回「今日」頁再點一次「前往」。
 * 這條提示只在「某項剛達標、且今天還有沒做完的項目」時出現（全部達標時走的是蓋章大印），
 * 點「次は…」直接導到下一項所在的分頁；可按 ✕ 收起，換分頁時也會自動收起。
 */
export function NextUpBar({ onNav }: { onNav: (tab: string) => void }) {
  const nextUp = useApp((s) => s.nextUp)
  const clear = useApp((s) => s.clearNextUp)
  if (!nextUp) return null
  return (
    <div className="nextUp" role="status">
      <div className="nextUpBody">
        <div className="nextUpDone">{nextUp.doneName} 完成 ✓</div>
        <div className="nextUpNote">{nextUp.note}</div>
      </div>
      <button className="btn small" onClick={() => onNav(nextUp.nextTab)}>
        次は{nextUp.nextName} →
      </button>
      <button className="nextUpClose" onClick={clear} aria-label="收起提示">
        ✕
      </button>
    </div>
  )
}
