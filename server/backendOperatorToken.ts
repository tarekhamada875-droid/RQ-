import crypto from 'crypto';

/** Compare the dedicated operator credential without a timing-sensitive string comparison. */
export function isValidBackendOperatorToken(
  candidate: unknown,
  configuredToken = process.env.BACKEND_OPERATOR_TOKEN
): boolean {
  if (typeof candidate !== 'string' || !configuredToken || candidate.length !== configuredToken.length) {
    return false;
  }
  const candidateBuffer = Buffer.from(candidate);
  const configuredBuffer = Buffer.from(configuredToken);
  return candidateBuffer.length === configuredBuffer.length && crypto.timingSafeEqual(candidateBuffer, configuredBuffer);
}
