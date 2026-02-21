/**
 * Generate a cryptographically secure API key using rejection sampling.
 * This avoids modulo bias that would favor certain characters.
 * @returns 32-character alphanumeric string
 */
export function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charsLength = chars.length; // 62
  // 256 / 62 = 4.12..., so max unbiased value is 62 * 4 - 1 = 247
  const maxUnbiased = Math.floor(256 / charsLength) * charsLength - 1;

  const result: string[] = [];
  const buffer = new Uint8Array(64); // Over-provision for rejection sampling

  while (result.length < 32) {
    crypto.getRandomValues(buffer);
    for (let i = 0; i < buffer.length && result.length < 32; i++) {
      // Rejection sampling: discard values that would cause bias
      if (buffer[i] <= maxUnbiased) {
        result.push(chars[buffer[i] % charsLength]);
      }
    }
  }

  return result.join('');
}
