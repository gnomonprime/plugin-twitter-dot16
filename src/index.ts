import { type IAgentRuntime, logger, type Plugin } from "@elizaos/core";
import { TwitterService } from "./services/twitter.service";
import { postTweetAction } from "./actions/postTweet";
import fs from "fs/promises";
import path from "path";

export const TwitterPlugin: Plugin = {
  name: "twitter",
  description:
    "Twitter client with posting, interactions, and timeline actions",
  actions: [postTweetAction],
  services: [TwitterService],
  init: async (_config: Record<string, string>, runtime: IAgentRuntime) => {
    // Only do validation in init, don't start services
    logger.log("🔧 Initializing Twitter plugin...");

    // Check if we can access settings
    const hasGetSetting = runtime && typeof runtime.getSetting === "function";

    // Basic validation of required settings
    const username = hasGetSetting
      ? runtime.getSetting("TWITTER_USERNAME")
      : process.env.TWITTER_USERNAME;
    const password = hasGetSetting
      ? runtime.getSetting("TWITTER_PASSWORD")
      : process.env.TWITTER_PASSWORD;

    const storagePath = path.join(process.cwd(), "storageState.json");
    let hasStorage = true;
    try {
      await fs.access(storagePath);
    } catch {
      hasStorage = false;
      logger.warn(
        "To enable Twitter functionality, a session storage state is required.",
      );
      logger.warn(
        "storageState.json not found - run the login.spec.ts test to create it.",
      );
    }

    if (!username || !password || !hasStorage) {
      const missing = [];
      if (!username) missing.push("TWITTER_USERNAME");
      if (!password) missing.push("TWITTER_PASSWORD");
      if (!hasStorage) missing.push("storageState.json");

      logger.warn(
        `Twitter credentials not configured. Missing: ${missing.join(", ")}`,
      );
    } else {
      logger.log("✅ Twitter credentials found");
    }
  },
};

export default TwitterPlugin;
