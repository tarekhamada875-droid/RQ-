const PUBLIC_VIEWS = new Set(['login', 'admin_login', 'delegate_login']);

/**
 * Protected dashboard views must not render from persisted client state until
 * the authoritative session coordinator has completed.
 */
export function shouldWaitForSessionReady(view: string, isSessionReady: boolean): boolean {
  return !PUBLIC_VIEWS.has(view) && !isSessionReady;
}
