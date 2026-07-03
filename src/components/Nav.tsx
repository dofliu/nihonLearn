export type Tab = 'today' | 'kana' | 'listen' | 'speak' | 'read'

const ITEMS: { v: Tab; ki: string; lb: string }[] = [
  { v: 'today', ki: '今', lb: '今日' },
  { v: 'kana', ki: '字', lb: 'かな' },
  { v: 'listen', ki: '耳', lb: '聴く' },
  { v: 'speak', ki: '口', lb: '話す' },
  { v: 'read', ki: '読', lb: '読む' },
]

export function Nav({
  tab,
  onChange,
}: {
  tab: Tab
  onChange: (t: Tab) => void
}) {
  return (
    <nav className="nav">
      {ITEMS.map((it) => (
        <button
          key={it.v}
          className={tab === it.v ? 'on' : ''}
          onClick={() => onChange(it.v)}
        >
          <span className="ki">{it.ki}</span>
          <span className="lb">{it.lb}</span>
        </button>
      ))}
    </nav>
  )
}
