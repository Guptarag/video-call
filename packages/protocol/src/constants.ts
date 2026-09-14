/**
 * Protocol, network, and application constants.
 */
export const PROTOCOL_CONSTANTS = {
  /** Default port for standalone Node.js signaling server */
  DEFAULT_SIGNALING_PORT: 8080,

  /** Default port for Next.js web application */
  DEFAULT_WEB_PORT: 3000,

  /** Interval in milliseconds at which clients send heartbeat ping frames (30 seconds) */
  HEARTBEAT_INTERVAL_MS: 30_000,

  /** Inactivity duration in milliseconds after which the server terminates a silent socket (60 seconds) */
  HEARTBEAT_TIMEOUT_MS: 60_000,

  /** Strict 1-to-1 room capacity limit */
  MAX_ROOM_CAPACITY: 2,

  /** Maximum allowed WebSocket frame size in bytes (64 KB) */
  MAX_MESSAGE_SIZE_BYTES: 64 * 1024,

  /** Expected notification dispatch window when a peer disconnects (50 ms) */
  PEER_LEFT_NOTIFICATION_DELAY_MS: 50,

  /** Rate limiting defaults */
  RATE_LIMIT: {
    /** Maximum new connections per IP per minute */
    MAX_CONNECTIONS_PER_MINUTE: 10,
    /** Maximum message frames per socket per minute */
    MAX_MESSAGES_PER_MINUTE: 60,
  },
} as const;
