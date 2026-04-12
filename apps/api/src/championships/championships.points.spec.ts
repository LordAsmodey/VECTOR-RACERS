import {
  basePointsForFinishPosition,
  totalPointsByUserId,
} from './championships.points';

describe('basePointsForFinishPosition', () => {
  it('matches F1 scale for top 10', () => {
    expect(basePointsForFinishPosition(1)).toBe(25);
    expect(basePointsForFinishPosition(2)).toBe(18);
    expect(basePointsForFinishPosition(10)).toBe(1);
  });

  it('returns 0 outside top 10', () => {
    expect(basePointsForFinishPosition(0)).toBe(0);
    expect(basePointsForFinishPosition(11)).toBe(0);
  });
});

describe('totalPointsByUserId', () => {
  it('adds fastest lap bonus to fastest among top 10', () => {
    const rows = [
      { userId: 'a', finishPosition: 1, fastestLapMs: 90000 },
      { userId: 'b', finishPosition: 2, fastestLapMs: 88000 },
    ];
    const m = totalPointsByUserId(rows);
    expect(m.get('a')).toBe(25);
    expect(m.get('b')).toBe(18 + 1);
  });

  it('breaks fastest lap ties by userId', () => {
    const rows = [
      { userId: 'z', finishPosition: 1, fastestLapMs: 80000 },
      { userId: 'm', finishPosition: 2, fastestLapMs: 80000 },
    ];
    const m = totalPointsByUserId(rows);
    expect(m.get('m')).toBe(18 + 1);
    expect(m.get('z')).toBe(25);
  });

  it('does not award FL bonus when no top-10 finishers', () => {
    const rows = [
      { userId: 'a', finishPosition: 11, fastestLapMs: 1000 },
      { userId: 'b', finishPosition: 12, fastestLapMs: 900 },
    ];
    const m = totalPointsByUserId(rows);
    expect(m.get('a')).toBe(0);
    expect(m.get('b')).toBe(0);
  });
});
