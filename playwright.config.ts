import { defineConfig, devices } from '@playwright/test'

// E2E_BASE_URL points the suite at an already-running deployment (e.g. the Firebase Hosting emulator or the live site).
const external = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // Headroom for busy machines and CI runners; assertions themselves are unchanged.
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: { baseURL: external ?? 'http://localhost:4173' },
  webServer: external ? undefined : { command: 'npm run build && npm run preview -- --port 4173', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
