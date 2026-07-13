const GENERATING_MAGAZINE_STATUSES = new Set([
  "queued",
  "ranking",
  "generating",
  "validating"
]);

export function isMagazineGeneratingStatus(status?: string | null) {
  return Boolean(status && GENERATING_MAGAZINE_STATUSES.has(status));
}
