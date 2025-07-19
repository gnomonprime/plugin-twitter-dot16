// Twitter-specific event types
export enum TwitterEventTypes {
  WORLD_JOINED = 'TWITTER_WORLD_JOINED',
  // Add more as we implement: MESSAGE_RECEIVED, POST_SENT, etc.
}

// Enhanced user information for better agent decision-making
// Aligned with official plugin's Profile interface structure
export interface TwitterProfile {
  id: string;
  username: string;
  name: string;
  biography?: string;
  avatar?: string;
  followersCount?: number;
  followingCount?: number;
  tweetsCount?: number;
  isBlueVerified?: boolean;
  isVerified?: boolean;
  isPrivate?: boolean;
  joined?: Date;
  location?: string;
  url?: string;
  website?: string;
}

// Specific type interfaces for better type safety
export interface TwitterPoll {
  choices: Array<{
    label: string;
    count: number;
  }>;
  end_datetime: string;
  total_votes: number;
  is_final: boolean;
}

export interface TwitterMedia {
  id: string;
  url: string;
  alt_text?: string;
  type?: string;
  // Enhanced video support
  duration_ms?: number;
  height?: number;
  width?: number;
  variants?: Array<{
    bit_rate?: number;
    content_type: string;
    url: string;
  }>;
}

export interface TwitterEntity {
  hashtags: Array<{
    text: string;
    indices: number[];
  }>;
  mentions: Array<{
    id_str: string;
    name: string;
    screen_name: string;
    indices: number[];
  }>;
  urls: Array<{
    url: string;
    expanded_url: string;
    display_url: string;
    indices: number[];
  }>;
}

export interface Tweet {
  // Core identification
  id: string;
  conversationId: string;
  userId: string | undefined;
  username: string | undefined;
  name: string;

  // Content
  text: string | undefined;
  language: string;

  // Enhanced user info for better agent decisions
  author?: TwitterProfile;

  // Engagement metrics
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  views: number;
  bookmarkCount: number | undefined;

  // Timestamps
  timestamp: number | undefined;
  timeParsed: Date | undefined;

  // Tweet types and states
  isReply: boolean;
  isRetweet: boolean;
  isQuoted: boolean;
  isSelfThread: boolean;
  isPin: boolean;
  sensitiveContent: boolean;

  // Conversation threading
  inReplyToStatusId: string | undefined;
  inReplyToStatus: Tweet | undefined;
  thread: Tweet[];

  // Nested tweets
  quotedStatus: Tweet | undefined;
  quotedStatusId: string | undefined;
  retweetedStatus: Tweet | undefined;
  retweetedStatusId: string | undefined;

  // Media and entities
  photos: TwitterMedia[];
  videos: TwitterMedia[];
  hashtags: Array<{ text: string; indices: number[] }>;
  mentions: Array<{ id_str: string; name: string; screen_name: string; indices: number[] }>;
  urls: Array<{ url: string; expanded_url: string; display_url: string; indices: number[] }>;

  // Special content
  poll: TwitterPoll | null;

  // Metadata
  permanentUrl: string | undefined;
}
