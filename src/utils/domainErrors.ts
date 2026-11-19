/**
 * getDomainErrorMessage — one implementation of the error-message mapping
 * pattern (whole-repo audit P2-4, owner-approved plan 2026-11-19).
 *
 * Previously implemented three times independently (credit-grant panel,
 * credit-rate section, garage-details actions): read `message`/`code` off
 * the cause, look both up in a code→Arabic-text table, pass through an
 * existing Arabic server message verbatim, otherwise show the fallback.
 */
export function getDomainErrorMessage(
  cause: unknown,
  messages: Record<string, string>,
  fallback: string,
): string {
  const error = cause as { message?: unknown; code?: unknown } | null;
  const message = typeof error?.message === 'string' ? error.message : '';
  const code = typeof error?.code === 'string' ? error.code : '';
  const knownMessage = messages[message] || messages[code];
  if (knownMessage) return knownMessage;
  if (/[\u0600-\u06FF]/.test(message)) return message;
  return fallback;
}
