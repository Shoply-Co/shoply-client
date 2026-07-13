const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function nextMagazineBoundary(now = new Date()) {
  const local = new Date(now.getTime() + KST_OFFSET_MS);
  const daysUntilNextMonday = (8 - local.getUTCDay()) % 7 || 7;
  const nextMonday = new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + daysUntilNextMonday
    ) - KST_OFFSET_MS
  );
  const nextMonth = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - KST_OFFSET_MS
  );

  return new Date(Math.min(nextMonday.getTime(), nextMonth.getTime()));
}

export function millisecondsUntilNextMagazineBoundary(now = new Date()) {
  return Math.max(1, nextMagazineBoundary(now).getTime() - now.getTime());
}
