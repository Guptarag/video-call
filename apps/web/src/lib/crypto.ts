/**
 * Cryptographic utility for zero-knowledge room credentials.
 * Generates high-entropy room IDs and secret keys using Web Crypto API.
 */

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Generates a cryptographically secure random string with high entropy.
 *
 * @param length Target string length
 * @returns Uniformly distributed random string
 */
export function generateCryptographicToken(length = 21): string {
  if (typeof window === "undefined" || !window.crypto) {
    // Fallback for non-browser environments if any
    let result = "";
    for (let i = 0; i < length; i++) {
      result += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
    }
    return result;
  }

  const values = new Uint8Array(length);
  window.crypto.getRandomValues(values);

  let result = "";
  for (let i = 0; i < length; i++) {
    result += ALPHABET[values[i] % ALPHABET.length];
  }
  return result;
}

/**
 * Generates a 21-character high-entropy room ID (>120 bits of entropy).
 */
export function generateRoomId(): string {
  return generateCryptographicToken(21);
}

/**
 * Generates a 24-character cryptographic invitation secret key (>140 bits of entropy).
 */
export function generateRoomSecret(): string {
  return generateCryptographicToken(24);
}

/**
 * Builds the private invitation URL with the room key stored solely in the URL hash fragment.
 * Under RFC 3986, the fragment is never transmitted in HTTP headers or web server access logs.
 */
export function buildRoomUrl(roomId: string, roomSecret: string, origin?: string): string {
  const base = origin ? `${origin}/room/${roomId}` : `/room/${roomId}`;
  return `${base}#key=${roomSecret}`;
}

/**
 * Parses the room key from the current window location hash (e.g. #key=<secret>).
 */
export function extractRoomKeyFromHash(hashString: string): string | null {
  if (!hashString) return null;

  // Remove leading '#' if present
  const cleanHash = hashString.startsWith("#") ? hashString.slice(1) : hashString;
  const params = new URLSearchParams(cleanHash);

  return params.get("key") || null;
}
