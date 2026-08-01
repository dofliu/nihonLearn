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
