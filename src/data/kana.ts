export type Script = 'hiragana' | 'katakana'
export interface Kana {
  id: string
  ch: string
  ro: string
  script: Script
  /** 基礎清音 46 音之一（用於進度地圖與新卡排序優先級） */
  seion: boolean
}

const HIRA =
  'あa いi うu えe おo かka きki くku けke こko さsa しshi すsu せse そso ' +
  'たta ちchi つtsu てte とto なna にni ぬnu ねne のno はha ひhi ふfu へhe ほho ' +
  'まma みmi むmu めme もmo やya ゆyu よyo らra りri るru れre ろro わwa をwo んn ' +
  'がga ぎgi ぐgu げge ごgo ざza じji ずzu ぜze ぞzo だda ぢji づzu でde どdo ' +
  'ばba びbi ぶbu べbe ぼbo ぱpa ぴpi ぷpu ぺpe ぽpo'

const KATA =
  'アa イi ウu エe オo カka キki クku ケke コko サsa シshi スsu セse ソso ' +
  'タta チchi ツtsu テte トto ナna ニni ヌnu ネne ノno ハha ヒhi フfu ヘhe ホho ' +
  'マma ミmi ムmu メme モmo ヤya ユyu ヨyo ラra リri ルru レre ロro ワwa ヲwo ンn ' +
  'ガga ギgi グgu ゲge ゴgo ザza ジji ズzu ゼze ゾzo ダda ヂji ヅzu デde ドdo ' +
  'バba ビbi ブbu ベbe ボbo パpa ピpi プpu ペpe ポpo'

function parse(str: string, prefix: string, script: Script): Kana[] {
  return str
    .trim()
    .split(/\s+/)
    .map((t, i) => ({
      id: prefix + i,
      ch: t[0],
      ro: t.slice(1),
      script,
      seion: i < 46,
    }))
}

export const KANA: Kana[] = [
  ...parse(HIRA, 'h', 'hiragana'),
  ...parse(KATA, 'k', 'katakana'),
]

export const KANA_BY_ID: Record<string, Kana> = Object.fromEntries(
  KANA.map((k) => [k.id, k]),
)
