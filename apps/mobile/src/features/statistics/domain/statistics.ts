import { summarizeReadingTime, type ReadingSession } from '@/features/reader';

export interface StatisticsBook {
  id: string;
  title: string;
  author: string | null;
  coverUri: string | null;
  progress: number;
  milliseconds: number;
}

export function buildStatistics(books: readonly StatisticsBook[], sessions: readonly ReadingSession[]) {
  const byBook = new Map<string, ReadingSession[]>();
  for (const session of sessions) {
    const recorded = byBook.get(session.bookId) ?? [];
    recorded.push(session);
    byBook.set(session.bookId, recorded);
  }
  const dayBooks: Record<string, StatisticsBook[]> = {};
  for (const book of books) {
    for (const day of summarizeReadingTime(byBook.get(book.id) ?? [])) {
      (dayBooks[day.date] ??= []).push({ ...book, milliseconds: day.milliseconds });
    }
  }
  for (const rows of Object.values(dayBooks))
    rows.sort((a, b) => b.milliseconds - a.milliseconds || a.id.localeCompare(b.id));
  const daily = Object.entries(dayBooks)
    .map(([date, rows]) => ({ date, milliseconds: rows.reduce((sum, book) => sum + book.milliseconds, 0) }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const total = daily.reduce((sum, day) => sum + day.milliseconds, 0);
  return {
    books,
    daily,
    dayBooks,
    total,
    completed: books.filter((book) => book.progress >= 1).length,
    average: daily.length ? total / daily.length : 0,
  };
}

/** UTC is used only for calendar arithmetic; keys already represent recorded local dates. */
export function buildHeatmap(today: string, daily: readonly { date: string; milliseconds: number }[]) {
  const end = new Date(`${today}T00:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - end.getUTCDay() - 12 * 7);
  const totals = new Map(daily.map((day) => [day.date, day.milliseconds]));
  return Array.from({ length: 13 }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + week * 7 + weekday);
      const key = date.toISOString().slice(0, 10);
      const milliseconds = totals.get(key) ?? 0;
      return {
        date: key,
        milliseconds,
        future: key > today,
        level:
          milliseconds <= 0
            ? 0
            : milliseconds < 600_000
              ? 1
              : milliseconds < 1_800_000
                ? 2
                : milliseconds < 3_600_000
                  ? 3
                  : 4,
      };
    }),
  );
}

export function durationParts(milliseconds: number) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return { hours: Math.floor(seconds / 3600), minutes: Math.floor(seconds / 60) % 60, seconds: seconds % 60 };
}
