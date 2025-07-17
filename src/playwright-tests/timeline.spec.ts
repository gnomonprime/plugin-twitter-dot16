// filename: timeline.spec.ts
import { test, expect } from "@playwright/test";
import { parseTweet } from "../client/tweets-pw";
import { getAuthenticatedPage } from "../client/browser";
import fs from "fs/promises";
import path from "path";

test.describe("Twitter Timeline E2E Tests", () => {
  test("should intercept GraphQL timeline data while scrolling", async () => {
    let page;
    try {
      ({ page } = await getAuthenticatedPage());
    } catch (e) {
      test.skip(true, e.message);
      return;
    }

    const interceptedTweets: any[] = [];

    // Set up GraphQL response interception
    page.on("response", async (response) => {
      const url = response.url();

      if (
        url.includes("/graphql/") &&
        (url.includes("HomeTimeline") || url.includes("UserTweets"))
      ) {
        try {
          const responseBody = await response.json();

          const instructions =
            responseBody?.data?.home?.home_timeline_urt?.instructions ||
            responseBody?.data?.user?.result?.timeline_v2?.timeline
              ?.instructions;

          if (instructions) {
            console.log(`📡 Intercepted GraphQL response: ${url}`);

            for (const instruction of instructions) {
              if (instruction.type === "TimelineAddEntries") {
                for (const entry of instruction.entries || []) {
                  const tweetResult =
                    entry?.content?.itemContent?.tweet_results?.result;
                  if (tweetResult) {
                    const parsedTweet = parseTweet(tweetResult);
                    interceptedTweets.push({
                      ...parsedTweet,
                      intercepted_at: new Date().toISOString(),
                    });
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error("Failed to parse GraphQL response:", error);
        }
      }
    });

    await page.goto("https://x.com/home");

    await expect(
      page.locator('[data-testid="AppTabBar_Home_Link"]'),
    ).toBeVisible();

    console.log("🔄 Starting human-like scrolling...");

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const scrollAmount = window.innerHeight * (Math.random() * 0.3 + 0.7);
        window.scrollBy(0, scrollAmount);
      });

      const pauseTime = Math.random() * 3000 + 2000;
      console.log(
        `⏸️  Pausing for ${Math.round(pauseTime)}ms (simulating reading)`,
      );
      await page.waitForTimeout(pauseTime);
    }

    await page.waitForTimeout(2000);

    console.log(`📊 Intercepted ${interceptedTweets.length} tweets`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputDir = path.join(
      process.cwd(),
      "src/playwright-tests/test-output",
    );
    const outputFile = path.join(
      outputDir,
      `intercepted-tweets-${timestamp}.json`,
    );

    try {
      await fs.mkdir(outputDir, { recursive: true });

      const output = {
        metadata: {
          timestamp: new Date().toISOString(),
          total_tweets: interceptedTweets.length,
          test_run: "timeline-interception",
          browser: "chromium",
        },
        tweets: interceptedTweets,
      };

      await fs.writeFile(outputFile, JSON.stringify(output, null, 2), "utf-8");
      console.log(
        `💾 Saved ${interceptedTweets.length} tweets to: ${outputFile}`,
      );

      const simplifiedFile = path.join(
        outputDir,
        `simplified-tweets-${timestamp}.json`,
      );
      const simplifiedTweets = interceptedTweets.map((tweet) => ({
        id: tweet.id,
        text: tweet.text,
        name: tweet.name,
        username: tweet.username,
        likes: tweet.likes,
        retweets: tweet.retweets,
        replies: tweet.replies,
        timestamp: tweet.timestamp,
        intercepted_at: tweet.intercepted_at,
      }));

      await fs.writeFile(
        simplifiedFile,
        JSON.stringify(simplifiedTweets, null, 2),
        "utf-8",
      );
      console.log(`📄 Saved simplified version to: ${simplifiedFile}`);
    } catch (error) {
      console.error("❌ Failed to save tweets to file:", error);
    }

    expect(interceptedTweets.length).toBeGreaterThan(0);

    if (interceptedTweets.length > 0) {
      const firstTweet = interceptedTweets[0];
      console.log("First Parsed Tweet:", JSON.stringify(firstTweet, null, 2));

      expect(firstTweet).toHaveProperty("id");
      expect(typeof firstTweet.id).toBe("string");
      expect(firstTweet).toHaveProperty("text");
      expect(typeof firstTweet.text).toBe("string");

      if (firstTweet.username) {
        expect(typeof firstTweet.username).toBe("string");
      }

      if (firstTweet.likes !== undefined) {
        expect(typeof firstTweet.likes).toBe("number");
      }
    }

    const quotedTweet = interceptedTweets.find((tweet) => tweet.quotedStatus);
    if (quotedTweet) {
      console.log(
        "Parsed Quoted Tweet:",
        JSON.stringify(quotedTweet, null, 2),
      );

      expect(quotedTweet).toHaveProperty("quotedStatus");
      expect(quotedTweet.quotedStatus).toBeDefined();
      expect(quotedTweet.quotedStatus).toHaveProperty("id");
      expect(typeof quotedTweet.quotedStatus.id).toBe("string");
      expect(quotedTweet.quotedStatus).toHaveProperty("text");
      expect(typeof quotedTweet.quotedStatus.text).toBe("string");
    } else {
      console.log("No quoted tweet found in this interception batch");
    }

    for (const tweet of interceptedTweets.slice(0, 3)) {
      expect(tweet).toHaveProperty("id");
      expect(tweet).toHaveProperty("text");
      expect(tweet).toHaveProperty("name");
      expect(tweet).toHaveProperty("username");
      expect(tweet.id).toBeTruthy();
      expect(tweet.text).toBeTruthy();

      console.log(`✅ Tweet ${tweet.id}: ${tweet.text.substring(0, 50)}...`);
    }

    console.log("🎉 GraphQL interception test completed successfully!");
  });

  test("should handle timeline loading errors gracefully", async () => {
    let page;
    try {
      ({ page } = await getAuthenticatedPage());
    } catch (e) {
      test.skip(true, e.message);
      return;
    }

    await page.route("**/graphql/**", (route) => {
      if (Math.random() < 0.3) {
        route.abort("failed");
      } else {
        route.continue();
      }
    });

    await page.goto("https://x.com/home");

    await expect(
      page.locator('[data-testid="AppTabBar_Home_Link"]'),
    ).toBeVisible();

    console.log("✅ Timeline error handling test completed");
  });
});
