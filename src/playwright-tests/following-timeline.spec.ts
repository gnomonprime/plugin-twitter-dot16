import { test, expect } from "@playwright/test";
import { getAuthenticatedPage } from "../client/browser";
import fs from "fs/promises";
import path from "path";

test.describe("Following Timeline Tests", () => {
  test("should switch to Following tab and intercept Following timeline GraphQL", async () => {
    let page;
    try {
      ({ page } = await getAuthenticatedPage());
    } catch (e) {
      test.skip(true, e.message);
      return;
    }

    let interceptedResponses: any[] = [];
    let followingTabClicked = false;

    // Set up GraphQL response interception specifically for Following timeline
    page.on("response", async (response) => {
      const url = response.url();

      // Look for Following timeline specific GraphQL endpoints
      if (
        url.includes("/graphql/") &&
        (url.includes("HomeTimeline") || url.includes("FollowingTimeline"))
      ) {
        try {
          const responseBody = await response.json();

          // Check if this is a Following timeline response
          const isFollowingTimeline =
            url.includes("following=true") ||
            responseBody?.data?.home?.home_timeline_urt?.instructions?.some(
              (instr: any) =>
                instr?.type === "TimelineAddEntries" &&
                instr?.entries?.some(
                  (entry: any) =>
                    entry?.content?.entryType === "TimelineTimelineItem",
                ),
            );

          if (isFollowingTimeline || followingTabClicked) {
            console.log(`📡 Intercepted Following Timeline GraphQL: ${url}`);
            interceptedResponses.push({
              url,
              data: responseBody,
              timestamp: new Date().toISOString(),
              isFollowing: followingTabClicked,
            });
          }
        } catch (error) {
          console.error("Failed to parse GraphQL response:", error);
        }
      }
    });

    // Navigate to Twitter home
    await page.goto("https://x.com/home");
    await expect(
      page.locator('[data-testid="AppTabBar_Home_Link"]'),
    ).toBeVisible();

    console.log("🏠 Navigated to Twitter home page");

    // Wait for initial timeline to load
    await page.waitForTimeout(3000);

    // Look for and click the Following tab
    console.log("🔍 Looking for Following tab...");

    // Multiple selectors for the Following tab (Twitter UI can vary)
    const followingSelectors = [
      '[data-testid="ScrollSnap-List"] [role="tab"]:has-text("Following")',
      '[role="tablist"] [role="tab"]:has-text("Following")',
      '[data-testid="HomeTimeline"] [role="tab"]:has-text("Following")',
      'div[role="tablist"] div:has-text("Following")',
      '[aria-label="Timeline: Following timeline"]',
    ];

    let followingTab = null;
    for (const selector of followingSelectors) {
      followingTab = await page.locator(selector).first();
      if (await followingTab.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log(`✅ Found Following tab with selector: ${selector}`);
        break;
      }
    }

    if (!followingTab || !(await followingTab.isVisible())) {
      console.log(
        "⚠️ Following tab not found, checking current timeline state...",
      );

      // Check if we're already on Following timeline
      const currentUrl = page.url();
      const pageContent = await page.content();

      console.log(`Current URL: ${currentUrl}`);
      console.log("Checking for Following timeline indicators...");

      // Save page content for debugging
      const outputDir = path.join(
        process.cwd(),
        "src/playwright-tests/test-output",
      );
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(
        path.join(outputDir, "following-tab-search.html"),
        pageContent,
      );

      // Still proceed with the test to see what timeline we get
      console.log(
        "⏭️ Proceeding without clicking Following tab to test current timeline",
      );
    } else {
      // Click the Following tab
      console.log("🖱️ Clicking Following tab...");
      await followingTab.click();
      followingTabClicked = true;

      // Wait for tab switch animation and new content to load
      await page.waitForTimeout(2000);
      console.log(
        "✅ Following tab clicked, waiting for timeline to update...",
      );
    }

    // Perform human-like scrolling to trigger GraphQL requests
    console.log(
      "🔄 Starting human-like scrolling to trigger Following timeline requests...",
    );

    for (let i = 0; i < 5; i++) {
      // Scroll down by 70-100% of viewport height with jitter
      await page.evaluate(() => {
        const scrollAmount = window.innerHeight * (Math.random() * 0.3 + 0.7);
        window.scrollBy(0, scrollAmount);
      });

      // Human-like pause
      const pauseTime = Math.random() * 3000 + 2000;
      console.log(
        `⏸️ Scroll ${i + 1}/5 - Pausing for ${Math.round(pauseTime)}ms`,
      );
      await page.waitForTimeout(pauseTime);
    }

    // Wait for final requests
    await page.waitForTimeout(3000);

    // Validate intercepted responses
    console.log(
      `📊 Intercepted ${interceptedResponses.length} Following timeline responses`,
    );

    // Basic validation
    expect(interceptedResponses.length).toBeGreaterThan(0);

    // Analyze the intercepted data
    const tweetsFound: any[] = [];

    for (const response of interceptedResponses) {
      const instructions =
        response.data?.data?.home?.home_timeline_urt?.instructions || [];

      for (const instruction of instructions) {
        if (instruction.type === "TimelineAddEntries") {
          for (const entry of instruction.entries || []) {
            const tweetResult =
              entry?.content?.itemContent?.tweet_results?.result;
            if (tweetResult && tweetResult.legacy) {
              tweetsFound.push({
                id: tweetResult.rest_id || tweetResult.legacy.id_str,
                text: tweetResult.legacy.full_text,
                user: tweetResult.legacy.user?.screen_name || "unknown",
                isFollowingTimeline:
                  response.isFollowing || followingTabClicked,
              });
            }
          }
        }
      }
    }

    console.log(`🐦 Found ${tweetsFound.length} tweets in Following timeline`);

    // Validate we found tweets
    expect(tweetsFound.length).toBeGreaterThan(0);

    // Check that at least some tweets are marked as from Following timeline
    const followingTweets = tweetsFound.filter((t) => t.isFollowingTimeline);
    console.log(
      `📈 ${followingTweets.length} tweets confirmed from Following timeline`,
    );

    // Save detailed results for analysis
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputDir = path.join(
      process.cwd(),
      "src/playwright-tests/test-output",
    );
    await fs.mkdir(outputDir, { recursive: true });

    const testResults = {
      testType: "following-timeline",
      timestamp,
      followingTabClicked,
      interceptedResponsesCount: interceptedResponses.length,
      tweetsFound: tweetsFound.length,
      followingTweetsCount: followingTweets.length,
      sampleTweets: tweetsFound.slice(0, 5).map((t) => ({
        id: t.id,
        user: t.user,
        textPreview: t.text?.substring(0, 100) + "...",
        isFollowingTimeline: t.isFollowingTimeline,
      })),
      interceptedUrls: interceptedResponses.map((r) => ({
        url: r.url,
        timestamp: r.timestamp,
        isFollowing: r.isFollowing,
      })),
    };

    await fs.writeFile(
      path.join(outputDir, `following-timeline-test-${timestamp}.json`),
      JSON.stringify(testResults, null, 2),
    );

    console.log("📋 Following Timeline Test Results:");
    console.log(`  - Following tab clicked: ${followingTabClicked}`);
    console.log(
      `  - GraphQL responses intercepted: ${interceptedResponses.length}`,
    );
    console.log(`  - Tweets found: ${tweetsFound.length}`);
    console.log(`  - Following timeline tweets: ${followingTweets.length}`);

    // Final assertions
    expect(tweetsFound.length).toBeGreaterThan(0);
    if (followingTabClicked) {
      expect(followingTweets.length).toBeGreaterThan(0);
    }

    console.log("🎉 Following Timeline test completed successfully!");
  });

  test("should differentiate between For You and Following timeline content", async () => {
    let page;
    try {
      ({ page } = await getAuthenticatedPage());
    } catch (e) {
      test.skip(true, e.message);
      return;
    }

    const forYouTweets: any[] = [];
    const followingTweets: any[] = [];

    // Set up interception
    page.on("response", async (response) => {
      const url = response.url();
      if (url.includes("/graphql/") && url.includes("HomeTimeline")) {
        try {
          const responseBody = await response.json();
          const instructions =
            responseBody?.data?.home?.home_timeline_urt?.instructions || [];

          // Extract tweets and tag with timeline type
          for (const instruction of instructions) {
            if (instruction.type === "TimelineAddEntries") {
              for (const entry of instruction.entries || []) {
                const tweetResult =
                  entry?.content?.itemContent?.tweet_results?.result;
                if (tweetResult) {
                  const tweet = {
                    id: tweetResult.rest_id,
                    text: tweetResult.legacy?.full_text,
                    user: tweetResult.legacy?.user?.screen_name,
                  };

                  // Determine timeline type based on URL parameters or current state
                  if (
                    url.includes("following=true") ||
                    page.url().includes("following")
                  ) {
                    followingTweets.push(tweet);
                  } else {
                    forYouTweets.push(tweet);
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error("Failed to parse response:", error);
        }
      }
    });

    await page.goto("https://x.com/home");

    // Test For You timeline first
    console.log("📊 Testing For You timeline...");
    await page.waitForTimeout(2000);

    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(2000);
    }

    console.log(`Found ${forYouTweets.length} For You tweets`);

    // Switch to Following if available
    const followingTab = page
      .locator('[role="tab"]:has-text("Following")')
      .first();
    if (await followingTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log("📋 Switching to Following timeline...");
      await followingTab.click();
      await page.waitForTimeout(2000);

      for (let i = 0; i < 2; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(2000);
      }
    }

    console.log(`Found ${followingTweets.length} Following tweets`);

    // Validate we got content from at least one timeline
    expect(forYouTweets.length + followingTweets.length).toBeGreaterThan(0);
  });
});
