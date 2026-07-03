import { defineConfig, devices } from '@playwright/test'

// 預裝的 Chromium 版本可能與 @playwright/test 期望的 revision 不同，
// 因此優先用 PW_CHROMIUM_PATH（CI/容器）指定執行檔；本機沒設就走預設下載版。
const executablePath = process.env.PW_CHROMIUM_PATH

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  timeout: 120_000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
