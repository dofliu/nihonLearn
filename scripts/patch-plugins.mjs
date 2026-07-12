// postinstall：修補 Capacitor community plugin 的 Android 模組以相容 AGP 9。
//
// @capacitor-community/{speech-recognition,text-to-speech} 的 android/build.gradle
// 用了 getDefaultProguardFile('proguard-android.txt')，AGP 9 已把它從警告改為
// 「硬性錯誤」（該檔含 -dontoptimize，會擋 R8 最佳化）。這些檔在 node_modules 內、
// 由 npm 安裝，無法直接提交修改，故在 postinstall 就地補成 optimize 版。
//
// idempotent：已是 optimize 版就跳過；找不到檔案也不失敗（exit 0）。
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const OLD = "proguard-android.txt"
const NEW = "proguard-android-optimize.txt"

const targets = [
  'node_modules/@capacitor-community/speech-recognition/android/build.gradle',
  'node_modules/@capacitor-community/text-to-speech/android/build.gradle',
]

let patched = 0
for (const file of targets) {
  try {
    if (!existsSync(file)) continue
    const src = readFileSync(file, 'utf8')
    if (!src.includes(OLD)) continue // 已 optimize（OLD 不是 NEW 的子字串）→ 跳過
    writeFileSync(file, src.replaceAll(OLD, NEW))
    patched++
    console.log('patched (AGP9 proguard):', file)
  } catch (e) {
    console.warn('patch-plugins skip', file, e.message)
  }
}
console.log(`patch-plugins: ${patched} file(s) updated`)
