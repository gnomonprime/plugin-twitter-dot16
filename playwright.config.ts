import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

export default defineConfig({
  testDir: "./src/playwright-tests/",
  outputDir: "./src/playwright-tests/test-output",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { outputFolder: "./src/playwright-tests/playwright-report" }],
    ["list"]
  ],
  timeout: 210000,

  use: {
    baseURL: "https://x.com",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: true,
    // Add stealth settings
    launchOptions: {
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-infobars",
        "--window-size=1280,800"
      ]
    }
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ]

  // Optionally run a local server before tests
  // webServer: {
  //   command: 'npm run start',
  //   port: 3000,
  // },
});
