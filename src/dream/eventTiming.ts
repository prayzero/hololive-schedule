import type { DreamEvent } from "../types";

const DEFAULT_FINAL_CHAPTER_DISPLAY_MS = 24 * 60 * 60 * 1_000;
const MAX_INFERRED_FINAL_CHAPTER_DISPLAY_MS = 7 * 24 * 60 * 60 * 1_000;

export type DreamEventTimingStatus =
  | "upcoming"
  | "live"
  | "ended"
  | "unknown";

function finiteTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * Returns an inclusive end only when published data confirms it: an explicit
 * chapter/event end or the next chapter start.
 */
export function dreamEventChapterConfirmedEndTime(
  event: DreamEvent,
  chapterIndex: number,
): number | null {
  const chapter = event.chapters[chapterIndex];
  if (!chapter) return null;

  const startsAt = finiteTime(chapter.startsAt);
  if (startsAt === null) return null;

  const explicitChapterEnd = finiteTime(chapter.endsAt);
  if (explicitChapterEnd !== null && explicitChapterEnd >= startsAt) {
    return explicitChapterEnd;
  }

  const nextStartsAt = finiteTime(event.chapters[chapterIndex + 1]?.startsAt);
  if (nextStartsAt !== null && nextStartsAt > startsAt) {
    return nextStartsAt - 1;
  }

  const explicitEventEnd = finiteTime(event.endsAt);
  if (explicitEventEnd !== null && explicitEventEnd >= startsAt) {
    return explicitEventEnd;
  }

  return null;
}

/**
 * Returns when an unconfirmed final chapter should stop being promoted as
 * current. This is a presentation freshness limit, not an official end time.
 */
export function dreamEventChapterDisplayExpiryTime(
  event: DreamEvent,
  chapterIndex: number,
  nextEvent?: DreamEvent | null,
): number | null {
  const confirmedEnd = dreamEventChapterConfirmedEndTime(
    event,
    chapterIndex,
  );
  if (confirmedEnd !== null) return confirmedEnd;

  const chapter = event.chapters[chapterIndex];
  const startsAt = finiteTime(chapter?.startsAt);
  if (startsAt === null) return null;

  const previousStartsAt = finiteTime(
    event.chapters[chapterIndex - 1]?.startsAt,
  );
  const previousCadence =
    previousStartsAt === null ? null : startsAt - previousStartsAt;
  const displayDuration =
    previousCadence !== null &&
    previousCadence > 0 &&
    previousCadence <= MAX_INFERRED_FINAL_CHAPTER_DISPLAY_MS
      ? previousCadence
      : DEFAULT_FINAL_CHAPTER_DISPLAY_MS;

  const inferredExpiry = startsAt + displayDuration - 1;
  const nextEventStartsAt = finiteTime(nextEvent?.startsAt);
  return nextEventStartsAt !== null && nextEventStartsAt > startsAt
    ? Math.min(inferredExpiry, nextEventStartsAt - 1)
    : inferredExpiry;
}

export function dreamEventConfirmedEndTime(
  event: DreamEvent,
): number | null {
  const explicitEventEnd = finiteTime(event.endsAt);
  if (explicitEventEnd !== null) return explicitEventEnd;

  const lastChapter = event.chapters.at(-1);
  const lastChapterStartsAt = finiteTime(lastChapter?.startsAt);
  const lastChapterEnd = finiteTime(lastChapter?.endsAt);
  return lastChapterStartsAt !== null &&
    lastChapterEnd !== null &&
    lastChapterEnd >= lastChapterStartsAt
    ? lastChapterEnd
    : null;
}

export function dreamEventDisplayExpiryTime(
  event: DreamEvent,
  nextEvent?: DreamEvent | null,
): number | null {
  const confirmedEnd = dreamEventConfirmedEndTime(event);
  if (confirmedEnd !== null) return confirmedEnd;

  for (let index = event.chapters.length - 1; index >= 0; index -= 1) {
    const displayExpiry = dreamEventChapterDisplayExpiryTime(
      event,
      index,
      nextEvent,
    );
    if (displayExpiry !== null) return displayExpiry;
  }

  const startsAt = finiteTime(event.startsAt);
  return startsAt === null
    ? null
    : startsAt + DEFAULT_FINAL_CHAPTER_DISPLAY_MS - 1;
}

export function dreamEventTimingStatus(
  event: DreamEvent,
  nowTime: number,
  nextEvent?: DreamEvent | null,
): DreamEventTimingStatus {
  const startsAt = finiteTime(event.startsAt);
  if (startsAt === null) return "unknown";
  if (nowTime < startsAt) return "upcoming";

  const confirmedEnd = dreamEventConfirmedEndTime(event);
  if (confirmedEnd !== null && nowTime > confirmedEnd) return "ended";

  const displayExpiry = dreamEventDisplayExpiryTime(event, nextEvent);
  return displayExpiry !== null && nowTime > displayExpiry ? "unknown" : "live";
}

export function dreamEventChapterTimingStatus(
  event: DreamEvent,
  chapterIndex: number,
  nowTime: number,
  nextEvent?: DreamEvent | null,
): DreamEventTimingStatus {
  const startsAt = finiteTime(event.chapters[chapterIndex]?.startsAt);
  if (startsAt === null) return "unknown";
  if (nowTime < startsAt) return "upcoming";

  const confirmedEnd = dreamEventChapterConfirmedEndTime(
    event,
    chapterIndex,
  );
  if (confirmedEnd !== null && nowTime > confirmedEnd) return "ended";

  const displayExpiry = dreamEventChapterDisplayExpiryTime(
    event,
    chapterIndex,
    nextEvent,
  );
  return displayExpiry !== null && nowTime > displayExpiry ? "unknown" : "live";
}
