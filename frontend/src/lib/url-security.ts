const DEFAULT_SENSITIVE_QUERY_KEYS = ["token", "invite", "invitation", "reset", "password_reset"] as const;

export function scrubSensitiveQueryParams(keys: readonly string[] = DEFAULT_SENSITIVE_QUERY_KEYS): void {
  const url = new URL(window.location.href);
  let changed = false;

  for (const key of keys) {
    if (!url.searchParams.has(key)) {
      continue;
    }
    url.searchParams.delete(key);
    changed = true;
  }

  if (!changed) {
    return;
  }

  const nextSearch = url.searchParams.toString();
  const next = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash}`;
  window.history.replaceState({}, document.title, next);
}
