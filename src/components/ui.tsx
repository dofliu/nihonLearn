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

// ---------- 蓋章大印（五項全完成時） ----------
export function BigStamp() {
  const lastStamped = useApp((s) => s.lastStamped)
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
      <div className="inner">
        <div className="b1">済</div>
        <div className="b2">{label}</div>
      </div>
    </div>
  )
}
