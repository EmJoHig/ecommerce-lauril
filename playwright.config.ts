import { defineConfig, devices } from "@playwright/test";

const externalBaseURL = process.env.E2E_BASE_URL?.trim();
const localBaseURL = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  outputDir: "test-results",
  use: {
    baseURL: externalBaseURL || localBaseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(!externalBaseURL && {
    webServer: {
      command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
      url: localBaseURL,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  }),
});
