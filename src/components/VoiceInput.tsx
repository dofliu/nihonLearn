import { useEffect, useState } from 'react'
import { speechInputAvailable, recognizeSpeech } from '../audio/scorer'
import { voiceErrorMessage } from '../lib/voiceInput'
import { toast } from './ui'

/**
 * 共用的「用說的」麥克風鈕：錄一次音 → 辨識 → 把文字交給呼叫端（通常是填進輸入框）。
 *
 * 誠實定位：辨識**會聽錯**，所以這顆鈕不會代替使用者送出，只負責把聽到的字填進去，
 * 使用者確認／修改後才送。**降級不中斷**：偵測不到語音辨識能力時整顆鈕不顯示，
 * 打字路徑完全不受影響。
 */
export function VoiceInput({
  onText,
  disabled,
  hint = '辨識結果會先填進輸入框，可以改完再送出',
}: {
  onText: (text: string) => void
  disabled?: boolean
  hint?: string
}) {
  const [ok, setOk] = useState(false)
  const [listening, setListening] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      const v = await speechInputAvailable()
      if (alive) setOk(v)
    })()
    return () => {
      alive = false
    }
  }, [])

  if (!ok) return null

  async function listen() {
    if (listening || disabled) return
    setListening(true)
    try {
      onText(await recognizeSpeech())
    } catch (e) {
      toast(voiceErrorMessage((e as Error).message))
    } finally {
      setListening(false)
    }
  }

  return (
    <div className="row center" style={{ marginTop: 6, gap: 8 }}>
      <button
        className="btn small ghost"
        onClick={() => void listen()}
        disabled={disabled || listening}
      >
        {listening ? '🎙 聞いています…' : '🎤 用說的'}
      </button>
      <span className="sub" style={{ fontSize: 12 }}>
        {hint}
      </span>
    </div>
  )
}
