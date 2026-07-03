// 拍（mora）切分：拗音小假名與前一拍合併，其餘每字一拍（含 っ ん ー）
const SMALL = 'ゃゅょぁぃぅぇぉゎャュョァィゥェォ'

export function splitMora(kana: string): string[] {
  const out: string[] = []
  for (const ch of kana) {
    if (SMALL.includes(ch) && out.length) out[out.length - 1] += ch
    else out.push(ch)
  }
  return out
}

/**
 * 東京式高低型：給 accent 型（0=平板, 1=頭高, k=第k拍後下降）與拍數，
 * 回傳每一拍是否為「高」。規則：
 *   0 型：第1拍低、其餘高（平板，助詞維持高）
 *   1 型：第1拍高、其餘低（頭高）
 *   k≥2：第1拍低、第2..k拍高、其後低（中高／尾高）
 */
export function pitchPattern(moraCount: number, accent: number): boolean[] {
  return Array.from({ length: moraCount }, (_, i) => {
    const pos = i + 1
    if (accent === 0) return pos !== 1
    if (accent === 1) return pos === 1
    return pos >= 2 && pos <= accent
  })
}

export function accentTypeName(accent: number, moraCount: number): string {
  if (accent === 0) return '平板型'
  if (accent === 1) return '頭高型'
  if (accent === moraCount) return '尾高型'
  return '中高型'
}
