/** Formula 1 style: P1..P10. Positions outside top 10 earn 0 base points. */
export const POSITION_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const;

export function basePointsForFinishPosition(position: number): number {
  if (position < 1 || position > 10) {
    return 0;
  }
  return POSITION_POINTS[position - 1];
}

export type FinishRowInput = {
  userId: string;
  finishPosition: number;
  fastestLapMs: number;
};

/**
 * Applies fastest lap bonus (+1) to a single driver among top-10 finishers
 * with the lowest fastestLapMs; ties broken by lexicographic userId.
 */
export function totalPointsByUserId(
  rows: FinishRowInput[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const r of rows) {
    totals.set(r.userId, basePointsForFinishPosition(r.finishPosition));
  }

  const top10 = rows.filter(
    (r) => r.finishPosition >= 1 && r.finishPosition <= 10,
  );
  if (top10.length === 0) {
    return totals;
  }

  let fastest = top10[0];
  for (const r of top10) {
    if (r.fastestLapMs < fastest.fastestLapMs) {
      fastest = r;
    } else if (
      r.fastestLapMs === fastest.fastestLapMs &&
      r.userId < fastest.userId
    ) {
      fastest = r;
    }
  }

  totals.set(fastest.userId, (totals.get(fastest.userId) ?? 0) + 1);
  return totals;
}
