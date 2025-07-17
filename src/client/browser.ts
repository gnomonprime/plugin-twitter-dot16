import { IAgentRuntime, logger } from "@elizaos/core";
import { Page } from "playwright";
import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs/promises";
import path from "path";

export async function getAuthenticatedPage() {
  const storagePath = path.join(process.cwd(), "storageState.json");
  let storageState;
  try {
    await fs.access(storagePath);
    storageState = JSON.parse(await fs.readFile(storagePath, "utf-8"));
  } catch {
    logger.warn("storageState.json not found - Run login test to create it.");
    throw new Error("No storage state available");
  }

  chromium.use(stealthPlugin());
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();

  const cleanup = async () => {
    await context.close();
    await browser.close();
  };

  return { page, cleanup };
}

export async function login(
  page: Page,
  runtime: IAgentRuntime,
): Promise<void> {
  const username = runtime.getSetting("TWITTER_USERNAME");
  const password = runtime.getSetting("TWITTER_PASSWORD");

  if (!username || !password) {
    throw new Error(
      "TWITTER_USERNAME and TWITTER_PASSWORD must be set in environment variables",
    );
  }

  // Navigate to login page
  await page.goto("https://x.com/i/flow/login");

  // Fill username field
  const usernameInput = page.locator('input[name="text"]');
  await usernameInput.waitFor({ state: "visible" });
  await usernameInput.fill(username);

  // Click Next button
  const nextButton = page
    .locator('button[role="button"]')
    .filter({ hasText: "Next" });
  await nextButton.click();

  // Fill password field
  const passwordInput = page.locator('input[name="password"]');
  await passwordInput.waitFor({ state: "visible" });
  await passwordInput.fill(password);

  // Click Log in button
  const loginButton = page.locator(
    'button[data-testid="LoginForm_Login_Button"]',
  );
  await loginButton.click();

  // Wait for successful login by checking for home page elements
  await page.waitForURL("**/home", { timeout: 30000 });

  // Additional verification that login was successful
  const homeTab = page.locator('[data-testid="AppTabBar_Home_Link"]');
  await homeTab.waitFor({ state: "visible", timeout: 10000 });
}
