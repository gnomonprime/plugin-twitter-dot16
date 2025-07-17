import { Tweet, TwitterProfile } from "./types";

/**
 * Parse Twitter poll data from card binding values
 */
export function parsePoll(card: any): any | null {
  if (!card?.legacy?.binding_values) return null;

  const bindings = card.legacy.binding_values;
  const poll: any = {};

  // Extract poll choices
  const choices: any[] = [];
  let choiceIndex = 1;

  while (true) {
    const labelKey = `choice${choiceIndex}_label`;
    const countKey = `choice${choiceIndex}_count`;

    const label = bindings.find((b: any) => b.key === labelKey);
    const count = bindings.find((b: any) => b.key === countKey);

    if (!label) break;

    choices.push({
      label: label.value?.string_value || "",
      count: count?.value?.string_value ? parseInt(count.value.string_value) : 0,
    });

    choiceIndex++;
  }

  if (choices.length === 0) return null;

  // Extract poll metadata
  const endTime = bindings.find((b: any) => b.key === "end_datetime_utc");
  const totalVotes = bindings.find((b: any) => b.key === "counts_are_final");

  poll.choices = choices;
  poll.end_datetime = endTime?.value?.string_value;
  poll.total_votes = choices.reduce((sum, choice) => sum + choice.count, 0);
  poll.is_final = totalVotes?.value?.boolean_value || false;

  return poll;
}

/**
 * Detect if a tweet is part of a self-thread (user replying to themselves)
 */
export function detectSelfThread(raw: any): boolean {
  // A tweet is part of a self-thread if:
  // 1. It's a reply (has inReplyToStatusId)
  // 2. The user is replying to their own tweet (same user ID)
  const currentUserId = raw.legacy?.user_id_str || raw.userId;
  const replyToUserId = raw.legacy?.in_reply_to_user_id_str;

  return !!(
    raw.legacy?.in_reply_to_status_id_str &&
    currentUserId &&
    replyToUserId &&
    currentUserId === replyToUserId
  );
}

/**
 * Parse Twitter user profile from various GraphQL response formats
 */
export function parseTwitterProfile(raw: any): TwitterProfile | undefined {
  // Extract user data from various possible locations in the GraphQL response
  const userResult =
    raw.core?.user_results?.result || raw.user_results?.result || raw.legacy?.user || raw.user;

  if (!userResult) return undefined;

  const userLegacy = userResult.legacy || userResult;
  const userCore = userResult.core || userResult;

  // Helper function to get original size avatar URL (matching official plugin)
  const getAvatarOriginalSizeUrl = (avatarUrl: string | undefined) => {
    if (!avatarUrl) return undefined;
    return avatarUrl.replace("_normal", "");
  };

  const profile: TwitterProfile = {
    id: userResult.rest_id || userLegacy.id_str || userCore.id_str,
    username: userCore.screen_name || userLegacy.screen_name,
    name: userCore.name || userLegacy.name,
    biography: userLegacy.description,
    avatar: getAvatarOriginalSizeUrl(
      userLegacy.profile_image_url_https || userLegacy.profile_image_url,
    ),
    followersCount: userLegacy.followers_count,
    followingCount: userLegacy.friends_count,
    tweetsCount: userLegacy.statuses_count,
    isBlueVerified: userLegacy.is_blue_verified || false,
    isVerified: userLegacy.verified || false,
    isPrivate: userLegacy.protected || false,
    location: userLegacy.location || "",
    url: userLegacy.screen_name ? `https://x.com/${userLegacy.screen_name}` : undefined,
  };

  // Parse created_at to joined Date (matching official plugin)
  if (userLegacy.created_at) {
    profile.joined = new Date(Date.parse(userLegacy.created_at));
  }

  // Extract website URL from entities (matching official plugin)
  const urls = userLegacy.entities?.url?.urls;
  if (urls?.length > 0) {
    profile.website = urls[0].expanded_url;
  }

  return profile;
}

/**
 * Parse a complete Tweet object from raw GraphQL data with recursive support for quoted/retweeted content
 * @param raw - Raw tweet data from GraphQL response
 * @param depth - Current recursion depth (internal use)
 * @param maxDepth - Maximum recursion depth to prevent infinite loops
 */
export function parseTweet(raw: any, depth = 0, maxDepth = 3): Tweet {
  // If we've reached maxDepth, don't parse nested quotes/retweets further
  const canRecurse = depth < maxDepth;

  const quotedStatus =
    raw.quoted_status_result?.result && canRecurse
      ? parseTweet(raw.quoted_status_result.result, depth + 1, maxDepth)
      : undefined;

  const retweetedStatus =
    raw.retweeted_status_result?.result && canRecurse
      ? parseTweet(raw.retweeted_status_result.result, depth + 1, maxDepth)
      : raw.legacy?.retweeted_status_result?.result && canRecurse
        ? parseTweet(raw.legacy.retweeted_status_result.result, depth + 1, maxDepth)
        : raw.legacy?.retweeted_status && canRecurse
          ? parseTweet(raw.legacy.retweeted_status, depth + 1, maxDepth)
          : undefined;

  const t: Tweet = {
    bookmarkCount: raw.bookmarkCount ?? raw.legacy?.bookmark_count ?? undefined,
    conversationId: raw.conversationId ?? raw.legacy?.conversation_id_str,
    hashtags: raw.hashtags ?? [
      ...(raw.legacy?.entities?.hashtags ?? []),
      ...(raw.legacy?.entities?.symbols ?? []),
    ],
    id: raw.id ?? raw.rest_id ?? raw.legacy?.id_str ?? raw.id_str ?? undefined,
    inReplyToStatus: raw.inReplyToStatus,
    inReplyToStatusId:
      raw.inReplyToStatusId ?? raw.legacy?.in_reply_to_status_id_str ?? undefined,
    isQuoted: raw.legacy?.is_quote_status === true,
    isPin:
      raw.isPin ??
      raw.isPinDetected ??
      raw.isPinCandidate ??
      (raw.content?.entryType === "TimelineTimelineItem" &&
        raw.content?.itemContent?.itemType === "TimelineTweet" &&
        raw.content?.itemContent?.promotedMetadata?.impressionId) ??
      (raw.legacy?.pinned_tweet_ids_str &&
        raw.legacy?.pinned_tweet_ids_str.includes(raw.rest_id)) ??
      false,
    isReply: raw.isReply ?? (raw.legacy?.in_reply_to_status_id_str ? true : false),
    isRetweet: raw.legacy?.retweeted === true,
    isSelfThread: raw.isSelfThread ?? detectSelfThread(raw),
    language: raw.legacy?.lang,
    likes: raw.legacy?.favorite_count ?? 0,
    name:
      raw.name ??
      raw.core?.user_results?.result?.core?.name ??
      raw.core?.user_results?.result?.legacy?.name ??
      raw?.user_results?.result?.core?.name ??
      raw?.user_results?.result?.legacy?.name ??
      raw.legacy?.user?.name ??
      raw.user?.legacy?.name ??
      raw.user?.name,
    mentions: raw.mentions ?? raw.legacy?.entities?.user_mentions ?? [],
    permanentUrl:
      raw.permanentUrl ??
      ((raw.core?.user_results?.result?.core?.screen_name ||
        raw.core?.user_results?.result?.legacy?.screen_name) &&
      raw.rest_id
        ? `https://x.com/${raw.core?.user_results?.result?.core?.screen_name || raw.core?.user_results?.result?.legacy?.screen_name}/status/${raw.rest_id}`
        : undefined),
    photos:
      raw.photos ??
      (raw.legacy?.entities?.media
        ?.filter((media: any) => media.type === "photo")
        .map((media: any) => ({
          id: media.id_str || media.rest_id || media.legacy?.id_str,
          url: media.media_url_https,
          alt_text: media.alt_text,
        })) ||
        []),
    poll: raw.poll ?? parsePoll(raw.card) ?? null,
    quotedStatus,
    quotedStatusId: raw.quotedStatusId ?? raw.legacy?.quoted_status_id_str ?? undefined,
    quotes: raw.legacy?.quote_count ?? 0,
    replies: raw.legacy?.reply_count ?? 0,
    retweets: raw.legacy?.retweet_count ?? 0,
    retweetedStatus,
    retweetedStatusId:
      raw.legacy?.retweeted_status_id_str ??
      raw.legacy?.retweeted_status?.id_str ??
      raw.legacy?.retweeted_status?.rest_id ??
      retweetedStatus?.id ??
      undefined,
    text: raw.text ?? raw.legacy?.full_text ?? undefined,
    thread: raw.thread || [],
    timeParsed: raw.timeParsed
      ? new Date(raw.timeParsed)
      : raw.legacy?.created_at
        ? new Date(raw.legacy?.created_at)
        : undefined,
    timestamp:
      raw.timestamp ??
      (raw.legacy?.created_at ? new Date(raw.legacy?.created_at).getTime() / 1000 : undefined),
    urls: raw.urls ?? raw.legacy?.entities?.urls ?? [],
    userId: raw.userId ?? raw.legacy?.user_id_str ?? undefined,
    username:
      raw.username ??
      raw.core?.user_results?.result?.core?.screen_name ??
      raw.core?.user_results?.result?.legacy?.screen_name ??
      raw?.user_results?.result?.core?.screen_name ??
      raw?.user_results?.result?.legacy?.screen_name ??
      raw.legacy?.user?.screen_name ??
      raw.user?.legacy?.screen_name ??
      raw.user?.screen_name ??
      undefined,
    videos:
      raw.videos ??
      raw.legacy?.entities?.media?.filter((media: any) => media.type === "video") ??
      [],
    views: raw.views?.count ? Number(raw.views?.count) : 0,
    sensitiveContent: raw.sensitiveContent ?? raw.legacy?.possibly_sensitive ?? false,

    // Enhanced user information for better agent decision-making
    author: parseTwitterProfile(raw),
  };

  return t;
}

/**
 * Parse multiple tweets from intercepted GraphQL timeline data
 */
export function parseInterceptedTweets(intercepted: any[]): Tweet[] {
  const tweets: Tweet[] = [];
  const rawTweets: any[] = [];

  // First pass: collect all raw tweets and check for pinned status
  for (const instr of intercepted) {
    if (instr?.type === "TimelineAddEntries") {
      for (const entry of instr.entries) {
        if (entry.content?.itemContent?.tweet_results) {
          const result = entry.content.itemContent.tweet_results.result;

          // Skip tombstones and unavailable tweets
          if (
            result?.__typename === "TweetTombstone" ||
            result?.__typename === "TweetUnavailable"
          ) {
            console.log(`Skipping tombstone/unavailable tweet: ${result?.__typename}`);
            continue;
          }

          // Handle note_tweet format (longer tweets)
          if (result?.note_tweet) {
            console.log("Processing note_tweet format");
            // Merge note_tweet data with legacy format
            result.legacy = {
              ...result.legacy,
              full_text:
                result.note_tweet.note_tweet_results?.result?.text || result.legacy?.full_text,
            };
          }

          // Check if this tweet is pinned based on timeline entry type
          if (
            entry.content?.itemContent?.tweetDisplayType === "Tweet" &&
            entry.entryId?.includes("tweet-") &&
            entry.content?.itemContent?.promotedMetadata
          ) {
            result.isPinDetected = true;
          }

          // Check for pinned tweet in user timeline context
          if (
            entry.entryId?.includes("profile-conversation-") ||
            entry.content?.itemContent?.tweetDisplayType === "SelfThread"
          ) {
            result.isPinCandidate = true;
          }

          rawTweets.push(result);
        }
      }
    }
  }

  // Second pass: parse all tweets
  for (const raw of rawTweets) {
    try {
      const tweet = parseTweet(raw);
      if (tweet.id) {
        // Only add tweets with valid IDs
        tweets.push(tweet);
      }
    } catch (error) {
      console.warn("Failed to parse tweet:", error);
    }
  }

  // Third pass: link replies to parent tweets
  linkRepliesToParents(tweets);

  console.log(`Parsed ${tweets.length} tweets from ${rawTweets.length} raw tweets`);
  return tweets;
}

/**
 * Link reply tweets to their parent tweets for conversation threading
 */
export function linkRepliesToParents(tweets: Tweet[]): void {
  // Create a map for quick parent lookup
  const tweetMap = new Map<string, Tweet>();
  tweets.forEach((tweet) => {
    if (tweet.id) {
      tweetMap.set(tweet.id, tweet);
    }
  });

  // Link replies to their parents
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
