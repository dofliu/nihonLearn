import type { CapacitorConfig } from '@capacitor/cli'

// appId 一旦上架 Google Play 便不可更改，改動前務必三思。
const config: CapacitorConfig = {
  appId: 'com.dof.nihongomichi',
  appName: '日本語の道',
  webDir: 'dist',
  android: {
    // 上架版不允許 cleartext；LAN http:// 除錯請自行暫開並勿提交
    allowMixedContent: false,
  },
}

export default config
