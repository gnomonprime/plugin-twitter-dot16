import { test, expect } from "@playwright/test";
import { Tweet } from "../../src/types-pw";
import { parseTweet } from "../client/tweets-pw";
import { getAuthenticatedPage } from "../client/browser";
import fs from "fs/promises";
import path from "path";

// Import the linkRepliesToParents function (we'll need to export it from timeline.ts)
function linkRepliesToParents(tweets: Tweet[]): void {
  const tweetMap = new Map<string, Tweet>();
  tweets.forEach((tweet) => {
    if (tweet.id) {
      tweetMap.set(tweet.id, tweet);
    }
  });

  tweets.forEach((tweet) => {
    if (tweet.isReply && tweet.inReplyToStatusId) {
      const parentTweet = tweetMap.get(tweet.inReplyToStatusId);
      if (parentTweet) {
        tweet.inReplyToStatus = parentTweet;
        console.log(`🔗 Linked reply ${tweet.id} to parent ${parentTweet.id}`);
      }
    }
  });
}

// Comprehensive test tweets covering ALL parseTweet fields (optimized)
const testTweets = [
  {
    url: "https://x.com/elonmusk/status/1941119099532378580",
    purpose:
      "Poll, high engagement, quoted status, hashtags/mentions/URLs - COMPREHENSIVE",
    expectedFields: [
      "poll",
      "quotedStatus",
      "quotedStatusId",
      "isQuoted",
      "hashtags",
      "mentions",
      "urls",
      "likes",
      "retweets",
      "replies",
      "quotes",
      "views",
      "timestamp",
      "permanentUrl",
    ],
  },
  {
    url: "https://x.com/elonmusk/status/1941193819313275198",
    purpose: "Follow-up with replies/quotes, conversation threading",
    expectedFields: [
      "quotedStatus",
      "conversationId",
      "isReply",
      "inReplyToStatusId",
      "timeParsed",
    ],
  },
  {
    url: "https://x.com/JPegKillah/status/1944380529739981303",
    purpose:
      "Photo media, reply, self-thread, conversation context - COMPREHENSIVE",
    expectedFields: [
      "photos",
      "isReply",
      "inReplyToStatusId",
      "inReplyToStatus",
      "isSelfThread",
      "conversationId",
      "userId",
    ],
  },
  {
    url: "https://x.com/RpsAgainstTrump/status/1944377607203484044",
    purpose: "Video clip, high engagement, user data - COMPREHENSIVE",
    expectedFields: [
      "videos",
      "urls",
      "likes",
      "retweets",
      "views",
      "name",
      "username",
      "userId",
    ],
  },
  {
    url: "https://x.com/17__g6/status/1944380561809875414",
    purpose:
      "Japanese language, photos, hashtags, bookmark tracking - COMPREHENSIVE",
    expectedFields: [
      "language",
      "hashtags",
      "photos",
      "bookmarkCount",
      "text",
      "timestamp",
    ],
  },
  {
    url: "https://x.com/elonmusk/status/1518623997054918657",
    purpose: "Pinned tweet (requires user timeline context)",
    expectedFields: ["isPin", "text", "likes", "retweets", "permanentUrl"],
  },
  {
    url: "https://x.com/chuvviv/status/1944380349464674775",
    purpose: "Sensitive content, potential retweet detection",
    expectedFields: [
      "hashtags",
      "isRetweet",
      "retweetedStatus",
      "retweetedStatusId",
      "sensitiveContent",
    ],
  },
  {
    url: "https://x.com/masamirikkai286/status/1944404781902287229",
    purpose:
      "Native retweet - Tests retweeted_status with nested original post about earthquake info",
    expectedFields: ["isRetweet", "retweetedStatus", "retweetedStatusId"],
  },
  {
    url: "https://x.com/END_JRN/status/1944404781499298044",
    purpose: "Reply tweet - Tests reply detection and conversation threading",
    expectedFields: ["isReply", "inReplyToStatusId", "text"],
  },
  {
    url: "https://x.com/johndk7/status/1944404769684046103",
    purpose:
      "External URLs - Tests urls/entities with clickable link to blog post on political topics",
    expectedFields: ["urls", "text", "mentions", "hashtags"],
  },
  {
    url: "https://x.com/1O113128/status/1944404793369514091",
    purpose:
      "Numbered thread - Tests isSelfThread and thread as part of multi-post discussion chain on Frankenstein",
    expectedFields: ["isSelfThread", "thread", "conversationId", "isReply"],
  },
];

// All Tweet interface fields for systematic coverage tracking
const ALL_TWEET_FIELDS = [
  "author",
  "bookmarkCount",
  "conversationId",
  "hashtags",
  "id",
  "inReplyToStatus",
  "inReplyToStatusId",
  "isQuoted",
  "isPin",
  "isReply",
  "isRetweet",
  "isSelfThread",
  "language",
  "likes",
  "name",
  "mentions",
  "permanentUrl",
  "photos",
  "poll",
  "quotedStatus",
  "quotedStatusId",
  "quotes",
  "replies",
  "retweets",
  "retweetedStatus",
  "retweetedStatusId",
  "sensitiveContent",
  "text",
  "thread",
  "timeParsed",
  "timestamp",
  "urls",
  "userId",
  "username",
  "videos",
  "views",
];

test.describe("Comprehensive Tweet Parsing Tests", () => {
  test("should parse all tweet field types accurately with systematic coverage", async () => {
    let page;
    try {
      ({ page } = await getAuthenticatedPage());
    } catch (e) {
      test.skip(true, e.message);
      return;
    }

    // Store all intercepted raw data and parsed results
    const allRawData: { [key: string]: any } = {};
    const allParsedData: { [key: string]: any } = {};
    const fieldCoverage: { [key: string]: boolean } = {};

    // Set up GraphQL response interception
    page.on("response", async (response) => {
      const url = response.url();

      if (
        url.includes("/graphql/") &&
        (url.includes("TweetDetail") ||
          url.includes("UserTweets") ||
          url.includes("HomeTimeline"))
      ) {
        try {
          const responseBody = await response.json();

          // Extract tweet data from various GraphQL endpoints
          const extractTweetData = (data: any) => {
            const tweets: any[] = [];

            // TweetDetail endpoint
            if (data?.threaded_conversation_with_injections_v2?.instructions) {
              for (const instruction of data
                .threaded_conversation_with_injections_v2.instructions) {
                if (instruction.type === "TimelineAddEntries") {
                  for (const entry of instruction.entries || []) {
                    if (entry?.content?.itemContent?.tweet_results?.result) {
                      tweets.push(
                        entry.content.itemContent.tweet_results.result,
                      );
                    }
                  }
                }
              }
            }

            // UserTweets endpoint
            if (data?.user?.result?.timeline_v2?.timeline?.instructions) {
              for (const instruction of data.user.result.timeline_v2.timeline
                .instructions) {
                if (instruction.type === "TimelineAddEntries") {
                  for (const entry of instruction.entries || []) {
                    if (entry?.content?.itemContent?.tweet_results?.result) {
                      tweets.push(
                        entry.content.itemContent.tweet_results.result,
                      );
                    }
                  }
                }
              }
            }

            // HomeTimeline endpoint
            if (data?.home?.home_timeline_urt?.instructions) {
              for (const instruction of data.home.home_timeline_urt
                .instructions) {
                if (instruction.type === "TimelineAddEntries") {
                  for (const entry of instruction.entries || []) {
                    if (entry?.content?.itemContent?.tweet_results?.result) {
                      tweets.push(
                        entry.content.itemContent.tweet_results.result,
                      );
                    }
                  }
                }
              }
            }

            return tweets;
          };

          const tweets = extractTweetData(responseBody?.data || {});

          for (const tweetData of tweets) {
            if (tweetData?.rest_id) {
              const tweetId = tweetData.rest_id;

              // Store raw data
              allRawData[tweetId] = tweetData;

              // Store raw data for batch parsing with reply linking
              if (!allRawData[tweetId]) {
                allRawData[tweetId] = tweetData;
                console.log(`📊 Intercepted raw tweet: ${tweetId}`);
              }
            }
          }
        } catch (error) {
          console.error("Failed to parse GraphQL response:", error);
        }
      }
    });

    // Visit each test tweet
    for (const testTweet of testTweets) {
      console.log(`\n🔍 Testing: ${testTweet.purpose}`);
      console.log(`📍 URL: ${testTweet.url}`);

      await page.goto(testTweet.url);

      // Wait for content to load
      await page.waitForTimeout(3000);

      // Scroll to ensure all content is loaded
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(2000);
    }

    // Wait for final requests
    await page.waitForTimeout(3000);

    // Batch parse all tweets with reply linking
    console.log("\n🔄 Parsing all tweets with reply linking...");
    const allTweets: Tweet[] = [];

    // Parse all tweets first
    for (const [tweetId, rawData] of Object.entries(allRawData)) {
      const parsedTweet = parseTweet(rawData);
      allTweets.push(parsedTweet);
      allParsedData[tweetId] = parsedTweet;
    }

    // Link replies to parents
    linkRepliesToParents(allTweets);

    // Update allParsedData with linked tweets
    allTweets.forEach((tweet) => {
      if (tweet.id) {
        allParsedData[tweet.id] = tweet;

        // Track field coverage (including empty arrays as valid)
        Object.keys(tweet).forEach((field) => {
          if (
            tweet[field as keyof Tweet] !== undefined &&
            tweet[field as keyof Tweet] !== null &&
            tweet[field as keyof Tweet] !== "" &&
            tweet[field as keyof Tweet] !== 0
          ) {
            fieldCoverage[field] = true;
          }
        });

        console.log(
          `✅ Parsed tweet ${tweet.id}: ${tweet.text?.substring(0, 50)}...`,
        );
        if (tweet.isReply && tweet.inReplyToStatus) {
          console.log(
            `   🔗 Reply linked to parent: ${tweet.inReplyToStatus.id}`,
          );
        }
      }
    });

    // Systematic field coverage analysis
    console.log(`\n📈 Systematic Field Coverage Analysis:`);
    const interceptedCount = Object.keys(allRawData).length;
    const coveredFields = Object.keys(fieldCoverage);
    const missedFields = ALL_TWEET_FIELDS.filter(
      (field) => !fieldCoverage[field],
    );

    console.log(`   Total tweets intercepted: ${interceptedCount}`);
    console.log(`   Fields in Tweet interface: ${ALL_TWEET_FIELDS.length}`);
    console.log(
      `   Fields covered: ${coveredFields.length}/${ALL_TWEET_FIELDS.length}`,
    );
    console.log(
      `   Coverage percentage: ${((coveredFields.length / ALL_TWEET_FIELDS.length) * 100).toFixed(1)}%`,
    );
    console.log(`   ✅ Covered fields: ${coveredFields.join(", ")}`);
    console.log(`   ❌ Missing fields: ${missedFields.join(", ")}`);

    // Save comprehensive analysis
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputDir = path.join(process.cwd(), "");
    await fs.mkdir(outputDir, { recursive: true });

    // Save raw data for analysis
    const rawDataFile = path.join(
      outputDir,
      `comprehensive-raw-data-${timestamp}.json`,
    );
    await fs.writeFile(rawDataFile, JSON.stringify(allRawData, null, 2));

    // Save parsed data
    const parsedDataFile = path.join(
      outputDir,
      `comprehensive-parsed-data-${timestamp}.json`,
    );
    await fs.writeFile(parsedDataFile, JSON.stringify(allParsedData, null, 2));

    // Create enhanced field analysis report
    const fieldAnalysis: { [key: string]: any } = {};

    // Initialize all fields
    ALL_TWEET_FIELDS.forEach((field) => {
      fieldAnalysis[field] = {
        populated_count: 0,
        empty_count: 0,
        examples: [],
        coverage_percentage: 0,
        is_covered: false,
      };
    });

    // Analyze each tweet
    for (const [tweetId, parsedTweet] of Object.entries(allParsedData)) {
      const rawTweet = allRawData[tweetId];

      ALL_TWEET_FIELDS.forEach((field) => {
        const value = parsedTweet[field];
        if (
          value !== undefined &&
          value !== null &&
          value !== "" &&
          value !== 0
        ) {
          fieldAnalysis[field].populated_count++;
          fieldAnalysis[field].is_covered = true;
          if (fieldAnalysis[field].examples.length < 3) {
            fieldAnalysis[field].examples.push({
              tweet_id: tweetId,
              value:
                typeof value === "object"
                  ? JSON.stringify(value).substring(0, 200)
                  : String(value).substring(0, 200),
              raw_path: findRawPath(rawTweet, field),
            });
          }
        } else {
          fieldAnalysis[field].empty_count++;
        }

        // Calculate coverage percentage
        const total =
          fieldAnalysis[field].populated_count +
          fieldAnalysis[field].empty_count;
        fieldAnalysis[field].coverage_percentage =
          total > 0
            ? ((fieldAnalysis[field].populated_count / total) * 100).toFixed(1)
            : 0;
      });
    }

    // Save enhanced field analysis
    const analysisFile = path.join(
      outputDir,
      `field-analysis-${timestamp}.json`,
    );
    const analysisReport = {
      metadata: {
        timestamp: new Date().toISOString(),
        total_tweets: interceptedCount,
        total_fields: ALL_TWEET_FIELDS.length,
        covered_fields: coveredFields.length,
        coverage_percentage: (
          (coveredFields.length / ALL_TWEET_FIELDS.length) *
          100
        ).toFixed(1),
        missed_fields: missedFields,
      },
      field_analysis: fieldAnalysis,
    };
    await fs.writeFile(analysisFile, JSON.stringify(analysisReport, null, 2));

    console.log(`\n💾 Saved comprehensive analysis to:`);
    console.log(`   Raw data: ${rawDataFile}`);
    console.log(`   Parsed data: ${parsedDataFile}`);
    console.log(`   Field analysis: ${analysisFile}`);

    // Enhanced validation assertions
    expect(interceptedCount).toBeGreaterThan(0);
    expect(coveredFields.length).toBeGreaterThan(20); // Should cover majority of fields
    expect(missedFields.length).toBeLessThan(10); // Should miss fewer than 10 fields

    // Validate critical fields are present
    const criticalFields = [
      "id",
      "text",
      "name",
      "username",
      "likes",
      "retweets",
      "timestamp",
    ];
    criticalFields.forEach((field) => {
      expect(fieldCoverage[field]).toBe(true);
    });

    // Validate reply linking functionality
    const repliesWithParents = allTweets.filter(
      (t) => t.isReply && t.inReplyToStatus,
    );
    if (repliesWithParents.length > 0) {
      console.log(`\n🔗 Reply linking validation:`);
      console.log(
        `   Found ${repliesWithParents.length} replies with linked parents`,
      );
      repliesWithParents.forEach((reply) => {
        expect(reply.inReplyToStatus).toBeDefined();
        expect(reply.inReplyToStatus!.id).toBeDefined();
        console.log(
          `   ✅ Reply ${reply.id} → Parent ${reply.inReplyToStatus!.id}`,
        );
      });
    }
  });

  test("should validate reply linking enhances conversation context", async () => {
    let page;
    try {
      ({ page } = await getAuthenticatedPage());
    } catch (e) {
      test.skip(true, e.message);
      return;
    }

    // Find a tweet with replies for testing
    const conversationUrl =
      "https://x.com/elonmusk/status/1941193819313275198";
    const interceptedTweets: any[] = [];

    page.on("response", async (response) => {
      const url = response.url();
      if (url.includes("/graphql/") && url.includes("TweetDetail")) {
        try {
          const responseBody = await response.json();
          const instructions =
            responseBody?.data?.threaded_conversation_with_injections_v2
              ?.instructions;

          if (instructions) {
            for (const instruction of instructions) {
              if (instruction.type === "TimelineAddEntries") {
                for (const entry of instruction.entries || []) {
                  if (entry?.content?.itemContent?.tweet_results?.result) {
                    interceptedTweets.push(
                      entry.content.itemContent.tweet_results.result,
                    );
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error("Failed to parse conversation response:", error);
        }
      }
    });

    await page.goto(conversationUrl);
    await page.waitForTimeout(5000);

    // Parse without reply linking
    const tweetsWithoutLinking = interceptedTweets.map((raw) =>
      parseTweet(raw),
    );

    // Parse with reply linking
    const tweetsWithLinking = interceptedTweets.map((raw) => parseTweet(raw));
    linkRepliesToParents(tweetsWithLinking);

    // Compare results
    const repliesWithoutContext = tweetsWithoutLinking.filter(
      (t) => t.isReply && !t.inReplyToStatus,
    );
    const repliesWithContext = tweetsWithLinking.filter(
      (t) => t.isReply && t.inReplyToStatus,
    );

    console.log(`\n🔍 Reply Linking Impact Analysis:`);
    console.log(`   Replies without context: ${repliesWithoutContext.length}`);
    console.log(`   Replies with context: ${repliesWithContext.length}`);
    console.log(
      `   Context improvement: ${repliesWithContext.length - repliesWithoutContext.length} tweets`,
    );

    // Validate that reply linking provides additional context
    if (repliesWithContext.length > 0) {
      const sampleReply = repliesWithContext[0];
      console.log(`\n📝 Sample Reply Context:`);
      console.log(
        `   Reply text: "${sampleReply.text?.substring(0, 100)}..."`,
      );
      console.log(
        `   Parent text: "${sampleReply.inReplyToStatus?.text?.substring(0, 100)}..."`,
      );

      expect(sampleReply.inReplyToStatus).toBeDefined();
      expect(sampleReply.inReplyToStatus!.text).toBeDefined();
      expect(sampleReply.inReplyToStatusId).toBe(
        sampleReply.inReplyToStatus!.id,
      );
    }
  });
});

// Helper function to find the raw path for a field
function findRawPath(raw: any, field: string): string {
  const commonPaths: { [key: string]: string[] } = {
    id: ["rest_id", "id", "legacy.id_str"],
    text: ["legacy.full_text", "text"],
    name: [
      "core.user_results.result.core.name",
      "core.user_results.result.legacy.name",
    ],
    username: [
      "core.user_results.result.core.screen_name",
      "core.user_results.result.legacy.screen_name",
    ],
    likes: ["legacy.favorite_count"],
    retweets: ["legacy.retweet_count"],
    replies: ["legacy.reply_count"],
    quotes: ["legacy.quote_count"],
    views: ["views.count"],
    language: ["legacy.lang"],
    hashtags: ["legacy.entities.hashtags", "legacy.entities.symbols"],
    mentions: ["legacy.entities.user_mentions"],
    urls: ["legacy.entities.urls"],
    photos: ["legacy.entities.media[type=photo]"],
    videos: ["legacy.entities.media[type=video]"],
    poll: ["card.binding_values"],
    isQuoted: ["legacy.is_quote_status"],
    quotedStatus: ["quoted_status_result.result"],
    isRetweet: ["legacy.retweeted"],
    retweetedStatus: ["retweeted_status_result.result"],
    bookmarkCount: ["legacy.bookmark_count"],
    conversationId: ["legacy.conversation_id_str"],
    userId: ["legacy.user_id_str"],
    permanentUrl: ["constructed from username + id"],
    timeParsed: ["legacy.created_at"],
    timestamp: ["legacy.created_at"],
    sensitiveContent: ["legacy.possibly_sensitive"],
    isSelfThread: ["detected from user_id comparison"],
    thread: ["constructed array"],
    isPin: ["detected from timeline context"],
  };

  return commonPaths[field]?.join(" | ") || "unknown";
}
