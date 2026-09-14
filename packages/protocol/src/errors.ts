/**
 * Standard protocol error codes defined in the signaling specification.
 */
export const PROTOCOL_ERROR_CODES = {
  UNAUTHORIZED: "UNAUTHORIZED",
  ROOM_FULL: "ROOM_FULL",
  INVALID_MESSAGE: "INVALID_MESSAGE",
  ROOM_NOT_FOUND: "ROOM_NOT_FOUND",
  PEER_NOT_FOUND: "PEER_NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ProtocolErrorCode = (typeof PROTOCOL_ERROR_CODES)[keyof typeof PROTOCOL_ERROR_CODES];

/**
 * WebSocket custom close codes adhering to RFC 6455 4xxx private use range.
 */
export const WS_CLOSE_CODES = {
  NORMAL_CLOSURE: 1000,
  INTERNAL_ERROR: 1011,
  UNAUTHORIZED: 4401,
  ROOM_FULL: 4403,
  REQUEST_TIMEOUT: 4408,
  CONNECTION_REPLACED: 4409,
  RATE_LIMITED: 4429,
} as const;

export type WsCloseCode = (typeof WS_CLOSE_CODES)[keyof typeof WS_CLOSE_CODES];

/**
 * Maps protocol error codes to corresponding WebSocket close codes when applicable.
 */
export const ERROR_TO_CLOSE_CODE: Record<ProtocolErrorCode, number | undefined> = {
  [PROTOCOL_ERROR_CODES.UNAUTHORIZED]: WS_CLOSE_CODES.UNAUTHORIZED,
  [PROTOCOL_ERROR_CODES.ROOM_FULL]: WS_CLOSE_CODES.ROOM_FULL,
  [PROTOCOL_ERROR_CODES.INVALID_MESSAGE]: undefined, // Keep socket open by default
  [PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND]: undefined,
  [PROTOCOL_ERROR_CODES.PEER_NOT_FOUND]: undefined,
  [PROTOCOL_ERROR_CODES.RATE_LIMITED]: WS_CLOSE_CODES.RATE_LIMITED,
  [PROTOCOL_ERROR_CODES.INTERNAL_ERROR]: WS_CLOSE_CODES.INTERNAL_ERROR,
};

/**
 * Custom error class for signaling protocol violations.
 */
export class SignalingProtocolError extends Error {
  public readonly code: ProtocolErrorCode;
  public readonly closeCode?: number;

  constructor(code: ProtocolErrorCode, message: string, closeCode?: number) {
    super(message);
    this.name = "SignalingProtocolError";
    this.code = code;
    this.closeCode = closeCode ?? ERROR_TO_CLOSE_CODE[code];
    Object.setPrototypeOf(this, SignalingProtocolError.prototype);
  }
}
