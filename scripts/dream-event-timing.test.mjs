import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const compileDirectory = mkdtempSync(join(tmpdir(), "holo-event-timing-"));
let timing;
try {
  const helperPath = resolve("src/dream/eventTiming.ts");
  execFileSync(
    process.execPath,
    [
      resolve("node_modules/typescript/bin/tsc"),
      helperPath,
      "--ignoreConfig",
      "--target",
      "ES2022",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      "--skipLibCheck",
      "--outDir",
      compileDirectory,
    ],
    { stdio: "pipe" },
  );
  const compiledPath = readdirSync(compileDirectory, {
    recursive: true,
    withFileTypes: true,
  }).find(
    (entry) => entry.isFile() && basename(entry.name) === "eventTiming.js",
  );
  assert.ok(compiledPath, "eventTiming.js should be emitted");
  timing = await import(
    pathToFileURL(resolve(compiledPath.parentPath, compiledPath.name)).href,
  );
} finally {
  rmSync(compileDirectory, { recursive: true, force: true });
}

function eventFixture(chapterStarts, overrides = {}) {
  return {
    id: "event-a",
    startsAt: chapterStarts[0],
    endsAt: null,
    chapters: chapterStarts.map((startsAt, index) => ({
      talentId: `talent-${index}`,
      startsAt,
      endsAt: null,
    })),
    ...overrides,
  };
}

test("an unconfirmed final chapter expires promotion without claiming an official end", () => {
  const event = eventFixture([
    "2026-08-23T20:00:00+09:00",
    "2026-08-25T20:00:00+09:00",
  ]);
  const finalIndex = event.chapters.length - 1;
  const finalStart = Date.parse(event.chapters[finalIndex].startsAt);
  const previousStart = Date.parse(event.chapters[finalIndex - 1].startsAt);
  const expectedDisplayExpiry = finalStart + (finalStart - previousStart) - 1;
  const septemberNow = Date.parse("2026-09-16T12:00:00+09:00");

  assert.equal(
    timing.dreamEventChapterConfirmedEndTime(event, finalIndex),
    null,
  );
  assert.equal(
    timing.dreamEventChapterDisplayExpiryTime(event, finalIndex),
    expectedDisplayExpiry,
  );
  assert.equal(
    timing.dreamEventChapterTimingStatus(event, finalIndex, septemberNow),
    "unknown",
  );
  assert.equal(timing.dreamEventTimingStatus(event, septemberNow), "unknown");
});

test("a next chapter confirms its predecessor while a next event only expires promotion", () => {
  const event = eventFixture([
    "2026-08-23T20:00:00+09:00",
    "2026-08-25T20:00:00+09:00",
  ]);
  const nextEvent = eventFixture(["2026-08-26T20:00:00+09:00"], {
    id: "event-b",
  });

  assert.equal(
    timing.dreamEventChapterConfirmedEndTime(event, 0),
    Date.parse(event.chapters[1].startsAt) - 1,
  );
  assert.equal(
    timing.dreamEventConfirmedEndTime(event),
    null,
  );
  assert.equal(
    timing.dreamEventDisplayExpiryTime(event, nextEvent),
    Date.parse(nextEvent.startsAt) - 1,
  );
  assert.equal(
    timing.dreamEventTimingStatus(
      event,
      Date.parse("2026-09-01T00:00:00+09:00"),
      nextEvent,
    ),
    "unknown",
  );
});

test("an unconfirmed event remains live only inside its bounded display window", () => {
  const event = eventFixture([
    "2026-08-23T20:00:00+09:00",
    "2026-08-25T20:00:00+09:00",
  ]);

  assert.equal(
    timing.dreamEventTimingStatus(
      event,
      Date.parse("2026-08-26T12:00:00+09:00"),
    ),
    "live",
  );
});

test("an explicit event end works even when the event has no chapters", () => {
  const event = eventFixture([], {
    startsAt: "2026-09-10T10:00:00+09:00",
    endsAt: "2026-09-10T18:00:00+09:00",
  });

  assert.equal(
    timing.dreamEventConfirmedEndTime(event),
    Date.parse(event.endsAt),
  );
  assert.equal(
    timing.dreamEventDisplayExpiryTime(event),
    Date.parse(event.endsAt),
  );
  assert.equal(
    timing.dreamEventTimingStatus(
      event,
      Date.parse("2026-09-10T12:00:00+09:00"),
    ),
    "live",
  );
  assert.equal(
    timing.dreamEventTimingStatus(
      event,
      Date.parse("2026-09-10T19:00:00+09:00"),
    ),
    "ended",
  );
});
