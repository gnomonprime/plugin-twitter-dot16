import { test, expect } from "@playwright/test";
import { login } from "../client/browser";
import fs from "fs/promises";
import path from "path";

// Mock runtime object for testing
const mockRuntime = {
  getSetting: (key: string) => {
    if (key === "TWITTER_USERNAME") return process.env.TWITTER_USERNAME;
    if (key === "TWITTER_PASSWORD") return process.env.TWITTER_PASSWORD;
    return null;
  },
  setSetting: (key: string, value: string) => {
    // Mock implementation for saving cookies
    console.log(`Setting ${key} = ${value}`);
  },
};

test.describe("Twitter Login E2E Tests", () => {
  test("should login and create storage state", async ({ browser }) => {
    const storagePath = path.join(process.cwd(), "storageState.json");

    // Create a fresh context (no existing storage state)
    const context = await browser.newContext();
    const page = await context.newPage();

    // Perform login using our browser helper
    await login(page, mockRuntime as any);

    // Verify login was successful by checking for Twitter home elements
    await expect(
      page.locator('[data-testid="AppTabBar_Home_Link"]'),
    ).toBeVisible({
      timeout: 30000,
    });

    // Save storage state after successful login
    const storageState = await context.storageState();
    await fs.writeFile(storagePath, JSON.stringify(storageState, null, 2));
    console.log("Saved storage state for future use");

    await context.close();
  });

  test("should reuse existing storage state for faster login", async ({
    browser,
  }) => {
    const storagePath = path.join(process.cwd(), "storageState.json");

    // Skip if no storage state exists
    try {
      await fs.access(storagePath);
    } catch {
      test.skip(true, "No storage state available, run the login test first");
    }

    // Load storage state
    const storageState = JSON.parse(await fs.readFile(storagePath, "utf-8"));
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    // Navigate to Twitter and verify we're logged in
    await page.goto("https://x.com/home");
    await expect(
      page.locator('[data-testid="AppTabBar_Home_Link"]'),
    ).toBeVisible({
      timeout: 10000,
    });

    console.log("Successfully reused storage state - no login required!");

    await context.close();
  });
});
