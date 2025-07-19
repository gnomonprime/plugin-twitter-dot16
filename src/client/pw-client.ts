import { logger, type IAgentRuntime } from "@elizaos/core";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import {
  parseTweet,
  parseInterceptedTweets,
  parseTwitterProfile,
} from "./pw-tweets"; // Your parsers (expanded for profiles)
import type { Tweet, TwitterProfile } from "../pw-types"; // Reused (matches official Tweet/Profile)
import type { SearchMode } from "./index"; // From existing (for mode)
import fs from "fs/promises";
import path from "path";

// From official: Pagination response (keep for fetchSearchTweets etc.; yes, needed for cursor/next in paginated calls)
export interface QueryTweetsResponse {
  tweets: Tweet[];
  next?: string;
}

// Media for postTweet (matches official options)
interface MediaData {
  path: string;
  type: "image" | "video";
  alt?: string;
}

// Interface mirroring official client.ts for upstream compatibility
export interface TwitterClientInterface {
  init(): Promise<void>; // Official: Setup auth
  login(runtime: IAgentRuntime): Promise<void>; // Your existing
  isLoggedIn(): Promise<boolean>; // Your existing
  getProfile(username: string): Promise<TwitterProfile>; // Official: User fetch
  getTweet(tweetId: string): Promise<Tweet>; // Official: Single tweet
  fetchHomeTimeline(count: number, following?: boolean): Promise<Tweet[]>; // Official: Feed (Tweet[] no pagination)
  fetchSearchTweets(
    query: string,
    maxTweets: number,
    mode: SearchMode,
    cursor?: string,
  ): Promise<QueryTweetsResponse>; // Official: Paginated search
  postTweet(
    text: string,
    media?: MediaData[],
    inReplyTo?: string,
  ): Promise<Tweet>; // Equivalent to official tweet() + reply
  likeTweet(tweetId: string): Promise<void>; // Official: Like action
  retweet(tweetId: string): Promise<Tweet>; // Official: Retweet
  quoteTweet(
    tweetId: string,
    text: string,
    media?: MediaData[],
  ): Promise<Tweet>; // Official: Quote
  getUserTweets(userId: string, count: number): Promise<Tweet[]>; // Official: User timeline (add as equiv to getTweetsByUserId)
  // TODO: Add more like fetchListTweets: Promise<QueryTweetsResponse> if needed
}

export class PwClient implements TwitterClientInterface {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private storagePath: string = path.join(
    process.cwd(),
    "twitter-storage.json",
  ); // Matches test output
  private isHeadless: boolean = process.env.PW_HEADLESS !== "false"; // Env-configurable
  private username: string | null = null;

  constructor() {
    // Lazy init on first use
  }

  /**
   * Initializes browser if not ready, loads storage state, and logs in if necessary.
   * Prioritizes existing state; falls back to performLogin if not authenticated.
   * @param runtime - The agent runtime for accessing settings in login.
   */
  async login(runtime: IAgentRuntime): Promise<void> {
    await this.initBrowser();

    if (await this.isLoggedIn()) {
      logger.info("Reused existing login storage state from prior run.");
      return;
    }

    // Fallback to UI login
    await this.performLogin(runtime);

    // Refresh storage state after successful login
    await this.context!.storageState({ path: this.storagePath });
    logger.info("Performed fresh login and updated storage state");
  }

  private async performLogin(runtime: IAgentRuntime): Promise<void> {
    const username = runtime.getSetting("TWITTER_USERNAME");
    const password = runtime.getSetting("TWITTER_PASSWORD");

    if (!username || !password) {
      throw new Error(
        "TWITTER_USERNAME and TWITTER_PASSWORD must be set in environment variables",
      );
    }

    // Navigate to login page
    await this.page!.goto("https://x.com/i/flow/login");

    // Fill username field
    const usernameInput = this.page!.locator('input[name="text"]');
    await usernameInput.waitFor({ state: "visible" });
    await usernameInput.fill(username);

    // Click Next button
    const nextButton = this.page!.locator('button[role="button"]').filter({
      hasText: "Next",
    });
    await nextButton.click();

    // Fill password field
    const passwordInput = this.page!.locator('input[name="password"]');
    await passwordInput.waitFor({ state: "visible" });
    await passwordInput.fill(password);

    // Click Log in button
    const loginButton = this.page!.locator(
      'button[data-testid="LoginForm_Login_Button"]',
    );
    await loginButton.click();

    // Wait for successful login by checking for home page elements
    await this.page!.waitForURL("**/home", { timeout: 30000 });

    // Additional verification that login was successful
    const homeTab = this.page!.locator('[data-testid="AppTabBar_Home_Link"]');
    await homeTab.waitFor({ state: "visible", timeout: 10000 });
  }

  async isLoggedIn(): Promise<boolean> {
    await this.initBrowser();
    await this.page!.goto("https://x.com/home");
    return await this.page!.locator('[data-testid="AppTabBar_Home_Link"]')
      .isVisible({ timeout: 5000 })
      .catch(() => false);
  }

  async getTweet(tweetId: string): Promise<Tweet> {
    await this.ensureReady();
    const intercepted: any[] = [];
    this.page!.on(
      "response",
      this.interceptGraphQL(intercepted, "/TweetDetail"),
    );
    await this.page!.goto(`https://x.com/any/status/${tweetId}`);
    await this.randomDelay(2000, 4000);
    // TODO: Parse from intercepted (e.g., data.data.threaded_conversation_with_injections_v2.instructions)
    const rawTweet =
      intercepted[0]?.data?.threaded_conversation_with_injections_v2
        ?.instructions?.[0]?.entries?.[0]?.content?.itemContent?.tweet_results
        ?.result;
    return parseTweet(rawTweet); // Delegate to tweets-pw.ts
  }

  async fetchHomeTimeline(
    count: number,
    _following: boolean = false,
  ): Promise<Tweet[]> {
    // Ignore following for now; can add filter later
    await this.ensureReady();
    const intercepted: any[] = [];
    this.page!.on(
      "response",
      this.interceptGraphQL(intercepted, "/HomeTimeline"),
    ); // Or /HomeLatestTimeline for latest
    await this.page!.goto("https://x.com/home");
    await this.scrollWithPauses(3); // Scroll 3 times to load ~count tweets
    // TODO: Extract tweets from all intercepted instructions/entries
    const tweets: Tweet[] = [];
    for (const resp of intercepted) {
      const instructions =
        resp?.data?.home?.home_timeline_urt?.instructions || [];
      for (const instr of instructions) {
        if (instr.type === "TimelineAddEntries") {
          for (const entry of instr.entries || []) {
            const raw = entry?.content?.itemContent?.tweet_results?.result;
            if (raw) tweets.push(parseTweet(raw));
          }
        }
      }
    }
    return tweets.slice(0, count);
  }

  async fetchSearchTweets(
    query: string,
    maxTweets: number,
    mode: SearchMode,
    cursor?: string,
  ): Promise<QueryTweetsResponse> {
    await this.ensureReady();
    const searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=${mode.toLowerCase()}`;
    const intercepted: any[] = [];
    this.page!.on(
      "response",
      this.interceptGraphQL(intercepted, "/SearchTimeline"),
    );
    await this.page!.goto(searchUrl);
    await this.scrollWithPauses(3); // Adjust based on maxTweets
    // TODO: Handle cursor for pagination (e.g., load more if cursor provided)
    const tweets: Tweet[] = [];
    // Similar parsing as fetchHomeTimeline...
    // Extract cursor from last response if needed
    return { tweets, next: "TODO: extract cursor" }; // Match QueryTweetsResponse type
  }

  // TODO: Implement other methods like getProfile(username), getUserTweets(userId, count), me(), etc.
  // Example stub for getProfile:
  async getProfile(username: string): Promise<TwitterProfile> {
    // Changed to TwitterProfile from your stub's object
    await this.ensureReady();
    // Goto https://x.com/${username}, intercept /UserByScreenName, parse...
    const intercepted: any[] = [];
    this.page!.on(
      "response",
      this.interceptGraphQL(intercepted, "/UserByScreenName"),
    );
    await this.page!.goto(`https://x.com/${username}`);
    await this.randomDelay(2000, 4000);
    const rawUser = intercepted[0]?.data?.user?.result;
    return (
      parseTwitterProfile(rawUser) ?? {
        id: "",
        username: "",
        name: "",
        biography: "",
      }
    ); // Use your parser
  }

  // Action stubs (e.g., for interactions)
  async likeTweet(tweetId: string): Promise<void> {
    await this.ensureReady();
    // Goto tweet page, locate like button [data-testid="like"], click
  }

  async sendTweet(text: string, inReplyTo?: string): Promise<any> {
    await this.ensureReady();
    // Locate compose button, type text, submit
  }

  // Helper: Ensure browser/page is ready
  private async ensureReady(): Promise<void> {
    if (!this.page)
      throw new Error("Client not initialized. Call login() first.");
  }

  // Helper: Intercept GraphQL responses
  private interceptGraphQL(intercepted: any[], endpoint: string) {
    return async (response: any) => {
      if (response.url().includes(`/graphql/${endpoint}`)) {
        try {
          const data = await response.json();
          intercepted.push(data);
        } catch (err) {
          logger.error("Failed to parse GraphQL response", err);
        }
      }
    };
  }

  // Helper: Human-like scrolling (from timeline.spec.ts)
  private async scrollWithPauses(scrolls: number): Promise<void> {
    for (let i = 0; i < scrolls; i++) {
      await this.page!.evaluate(() =>
        window.scrollBy(0, window.innerHeight * (Math.random() * 0.3 + 0.7)),
      );
      await this.randomDelay(2000, 5000);
    }
  }

  // Helper: Random delay for human-like behavior
  private async randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min)) + min;
    await this.page!.waitForTimeout(delay);
  }

  // Helper: Lazy browser init with storage state
  private async initBrowser(): Promise<void> {
    if (this.page) return;

    this.browser = await chromium.launch({ headless: this.isHeadless });
    let storageState;
    try {
      storageState = JSON.parse(await fs.readFile(this.storagePath, "utf-8"));
      logger.debug("Loaded existing storage state");
    } catch {
      storageState = undefined;
      logger.warn("No storage state found; will need login");
    }

    this.context = await this.browser.newContext({ storageState });
    this.page = await this.context.newPage();
  }

  // Cleanup
  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.page = null;
    this.context = null;
    this.browser = null;
  }

  // --- Added Stubs for Official Equivalents (below your code; no removals) ---

  async init(): Promise<void> {
    // Official: Setup (auth verify); PW: Browser init + profile check
    await this.initBrowser();
    // TODO: Set this.username via getProfile('me') or intercept
  }

  async postTweet(
    text: string,
    media: MediaData[] = [],
    inReplyTo?: string,
  ): Promise<Tweet> {
    // Equivalent to official sendTweet/sendNoteTweet/createQuoteTweetRequest (handles long/quote/reply)
    // Enhances your sendTweet: Add media via file input; reply/quote via navigation
    await this.ensureReady();
    const intercepted: any[] = []; // Intercept /CreateTweet
    this.page!.on(
      "response",
      this.interceptGraphQL(intercepted, "/CreateTweet"),
    );

    if (inReplyTo) {
      await this.page!.goto(`https://x.com/i/status/${inReplyTo}`);
      const replyBtn = this.page!.locator('[data-testid="reply"]');
      await replyBtn.click();
    } else {
      await this.page!.goto("https://x.com/compose/post");
    }

    const compose = this.page!.locator('[data-testid="tweetTextarea_0"]');
    await compose.fill(text);

    if (media.length) {
      const fileInput = this.page!.locator('input[type="file"]');
      await fileInput.setInputFiles(media.map((m) => m.path));
    }

    const postBtn = this.page!.locator('[data-testid="tweetButtonInline"]');
    await postBtn.click();
    await this.randomDelay(3000, 5000);

    const rawTweet = intercepted[0]?.data?.create_tweet?.tweet_results?.result;
    return parseTweet(rawTweet); // TODO: Handle long tweets (note_tweet), quotes (quoted_status_id)
  }

  async retweet(tweetId: string): Promise<Tweet> {
    // Official: retweet(); PW: Click retweet button
    await this.ensureReady();
    await this.page!.goto(`https://x.com/any/status/${tweetId}`);
    const retweetBtn = this.page!.locator('[data-testid="retweet"]');
    await retweetBtn.click();
    const confirm = this.page!.locator('[data-testid="retweetConfirm"]');
    await confirm.click();
    // TODO: Intercept /CreateRetweet, parse/return
    return {} as Tweet; // Stub
  }

  async quoteTweet(
    tweetId: string,
    text: string,
    media?: MediaData[],
  ): Promise<Tweet> {
    // Official: createQuoteTweetRequest(); PW: Use postTweet with inReplyTo + quote flag?
    // Or simulate quote button
    await this.ensureReady();
    await this.page!.goto(`https://x.com/any/status/${tweetId}`);
    const quoteBtn = this.page!.locator('[data-testid="quote"]'); // May need menu navigation
    await quoteBtn.click();
    // Then fill as in postTweet
    return await this.postTweet(text, media, tweetId); // Reuse
  }

  async getUserTweets(userId: string, count: number): Promise<Tweet[]> {
    // Official: getTweetsByUserId (generator to array); PW: Goto user profile, intercept /UserTweets, scroll/parse
    await this.ensureReady();
    const intercepted: any[] = [];
    this.page!.on(
      "response",
      this.interceptGraphQL(intercepted, "/UserTweets"),
    );
    const username = "TODO: get from userId"; // Need reverse lookup or param
    await this.page!.goto(`https://x.com/${username}`);
    await this.scrollWithPauses(Math.ceil(count / 20)); // ~20 per load
    return parseInterceptedTweets(intercepted).slice(0, count); // Use your multi-parser
  }
}
