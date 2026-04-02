import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // For AES, this is always 16 bytes

/**
 * Encrypts a plaintext string using AES-256-CBC.
 * The encryption key is derived from the ENCRYPTION_SECRET environment variable.
 * The output is a base64-encoded string in the format "ciphertext:iv".
 *
 * @param text The plaintext string to encrypt.
 * @returns The encrypted string in "ciphertext:iv" format (base64-encoded).
 * @throws Error if ENCRYPTION_SECRET is not set.
 */
export function encrypt(text: string): string {
  const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET;
  if (!ENCRYPTION_SECRET) {
    throw new Error('ENCRYPTION_SECRET environment variable is not set.');
  }

  // Use a consistent key length for AES-256 (32 bytes)
  const key = crypto.scryptSync(ENCRYPTION_SECRET, 'salt', 32);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return `${encrypted}:${iv.toString('hex')}`;
}

/**
 * Decrypts an encrypted string (in "ciphertext:iv" format) using AES-256-CBC.
 * The encryption key is derived from the ENCRYPTION_SECRET environment variable.
 *
 * @param encryptedText The encrypted string in "ciphertext:iv" format (base64-encoded).
 * @returns The decrypted plaintext string.
 * @throws Error if ENCRYPTION_SECRET is not set or if the format is invalid.
 */
export function decrypt(encryptedText: string): string {
  const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET;
  if (!ENCRYPTION_SECRET) {
    throw new Error('ENCRYPTION_SECRET environment variable is not set.');
  }

  const parts = encryptedText.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted text format. Expected "ciphertext:iv".');
  }

  const encrypted = parts[0];
  const iv = Buffer.from(parts[1], 'hex');

  // Use a consistent key length for AES-256 (32 bytes)
  const key = crypto.scryptSync(ENCRYPTION_SECRET, 'salt', 32);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
