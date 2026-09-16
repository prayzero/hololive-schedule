import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  EVENT_CATEGORIES,
  EVENT_COUNTRY_REGIONS,
  EVENT_REGIONS,
  validateCuratedEvents,
} from "./lib/event-schema.mjs";

const baseEvent = {
  id: "example-event-2026",
  title: "Example Event 2026",
  titleKo: "예시 이벤트 2026",
  categories: ["collaboration", "exhibition"],
  region: "JP",
  city: "도쿄",
  venue: "Example Hall",
  startsAt: "2026-09-16T10:00:00+09:00",
  endsAt: "2026-09-16T18:00:00+09:00",
  dateLabel: "2026. 09. 16",
  timeLabel: "10:00–18:00",
  format: "현장 이벤트",
  participants: ["Tokino Sora"],
  participantIds: ["tokino-sora"],
  description: "검증 테스트를 위한 공식 이벤트 예시입니다.",
  imageUrl: "https://example.com/event.webp",
  sourceUrl: "https://example.com/event",
};

function event(overrides = {}) {
  return structuredClone({ ...baseEvent, ...overrides });
}

test("event enums stay aligned with the UI region and category contract", () => {
  assert.deepEqual(EVENT_COUNTRY_REGIONS, ["JP", "KR", "US", "TW", "CN"]);
  assert.deepEqual(EVENT_REGIONS, ["JP", "KR", "US", "TW", "CN", "GLOBAL"]);
  assert.deepEqual(EVENT_CATEGORIES, [
    "concert",
    "solo",
    "collaboration",
    "festival",
    "exhibition",
  ]);
});

test("current curated events satisfy the event schema", async () => {
  const payload = JSON.parse(
    await readFile(new URL("../public/data/events.json", import.meta.url), "utf8"),
  );
  assert.doesNotThrow(() => validateCuratedEvents(payload.events));
});

test("US, TW and GLOBAL events enforce region metadata and offsets", () => {
  assert.doesNotThrow(() =>
    validateCuratedEvents([
      event({
        id: "us-event-2026",
        region: "US",
        city: "뉴욕",
        startsAt: "2026-09-16T10:00:00-04:00",
        endsAt: "2026-09-16T18:00:00-04:00",
      }),
      event({
        id: "tw-event-2026",
        region: "TW",
        city: "타이베이",
        startsAt: "2026-09-16T10:00:00+08:00",
        endsAt: "2026-09-16T18:00:00+08:00",
      }),
      event({
        id: "global-event-2026",
        region: "GLOBAL",
        city: "글로벌",
        supportedRegions: ["JP", "KR", "US", "TW", "CN"],
      }),
    ]),
  );

  assert.throws(
    () => validateCuratedEvents([event({ region: "US" })]),
    /offset \+09:00 does not match region US/,
  );
  assert.throws(
    () =>
      validateCuratedEvents([
        event({
          region: "TW",
          startsAt: "2026-09-16T10:00:00-04:00",
          endsAt: "2026-09-16T18:00:00-04:00",
        }),
      ]),
    /offset -04:00 does not match region TW/,
  );
  assert.throws(
    () => validateCuratedEvents([event({ supportedRegions: ["JP"] })]),
    /only use supportedRegions with region GLOBAL/,
  );
  assert.throws(
    () =>
      validateCuratedEvents([
        event({ region: "GLOBAL", supportedRegions: ["JP", "JP"] }),
      ]),
    /invalid or duplicate supportedRegions/,
  );
  assert.throws(
    () =>
      validateCuratedEvents([
        event({ region: "GLOBAL", supportedRegions: ["JP", "GLOBAL"] }),
      ]),
    /invalid or duplicate supportedRegions/,
  );
});

test("event ids, categories, regions and dates fail closed", () => {
  assert.throws(
    () => validateCuratedEvents([event({ id: "Bad_Event" })]),
    /lowercase kebab-case id/,
  );
  assert.throws(
    () => validateCuratedEvents([event(), event()]),
    /duplicate lowercase kebab-case id/,
  );
  assert.throws(
    () => validateCuratedEvents([event({ categories: ["concert", "concert"] })]),
    /invalid or duplicate categories/,
  );
  assert.throws(
    () => validateCuratedEvents([event({ categories: ["meetup"] })]),
    /invalid or duplicate categories/,
  );
  assert.throws(
    () => validateCuratedEvents([event({ categories: ["solo"] })]),
    /solo without concert/,
  );
  assert.throws(
    () => validateCuratedEvents([event({ region: "EU" })]),
    /invalid region "EU"/,
  );
  assert.throws(
    () => validateCuratedEvents([event({ startsAt: "2026-02-30T10:00:00+09:00" })]),
    /invalid calendar date or time/,
  );
  assert.throws(
    () =>
      validateCuratedEvents([
        event({
          startsAt: "2026-09-17T10:00:00+09:00",
          endsAt: "2026-09-16T18:00:00+09:00",
        }),
      ]),
    /endsAt precedes startsAt/,
  );
  assert.throws(
    () => validateCuratedEvents([event({ startsAt: "2026-09-16" })]),
    /explicit offset/,
  );
});
