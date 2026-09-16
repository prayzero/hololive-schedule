import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const compileDirectory = mkdtempSync(join(tmpdir(), "holo-data-validation-"));
let validation;
try {
  execFileSync(
    process.execPath,
    [
      resolve("node_modules/typescript/bin/tsc"),
      resolve("src/dataValidation.ts"),
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
  validation = await import(
    pathToFileURL(join(compileDirectory, "dataValidation.js")).href
  );
} finally {
  rmSync(compileDirectory, { recursive: true, force: true });
}

const resourceFiles = {
  schedule: "schedule.json",
  scheduleIndex: "schedule-index.json",
  events: "events.json",
  talents: "talents.json",
  solos: "solo-lives.json",
  youtubeLives: "youtube-lives.json",
  hololiveDreams: "hololive-dreams.json",
};

const payloads = Object.fromEntries(
  Object.entries(resourceFiles).map(([key, file]) => [
    key,
    JSON.parse(readFileSync(resolve("public/data", file), "utf8")),
  ]),
);

function corrupted(key, mutate) {
  const copy = structuredClone(payloads[key]);
  mutate(copy);
  return copy;
}

test("all seven current site resources pass bounded runtime validation", () => {
  for (const [key, payload] of Object.entries(payloads)) {
    assert.equal(
      validation.validateSiteResourcePayload(key, payload),
      true,
      `${key} should be valid`,
    );
  }
});

test("every shipped monthly archive passes the same schedule validator", () => {
  const directory = resolve("public/data/schedule-archive");
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".json"))) {
    const payload = JSON.parse(readFileSync(join(directory, file), "utf8"));
    assert.equal(validation.validateSiteResourcePayload("schedule", payload), true, file);
  }
});

test("corrupt required nested records fail closed for every resource", () => {
  const cases = [
    ["schedule", (payload) => { payload.entries[0] = {}; }],
    ["scheduleIndex", (payload) => { payload.dates[0].count = "1"; }],
    ["events", (payload) => { payload.events[0].participants = null; }],
    ["talents", (payload) => { payload.talents[0].aliases = null; }],
    ["solos", (payload) => { payload.lives[0].startsAt = "not-a-date"; }],
    ["youtubeLives", (payload) => { payload.lives[0].memberIds = null; }],
    ["hololiveDreams", (payload) => { payload.gachaRates.normalRates.star5 = Number.NaN; }],
  ];

  for (const [key, mutate] of cases) {
    assert.equal(
      validation.validateSiteResourcePayload(key, corrupted(key, mutate)),
      false,
      `${key} corruption should be rejected`,
    );
  }
});

test("nullable fields stay valid while invalid dates and unsafe numbers are rejected", () => {
  const schedule = structuredClone(payloads.schedule);
  schedule.entries[0].title = null;
  schedule.entries[0].startsAt = null;
  assert.equal(validation.validateSiteResourcePayload("schedule", schedule), true);

  assert.equal(
    validation.validateSiteResourcePayload(
      "youtubeLives",
      corrupted("youtubeLives", (payload) => {
        payload.lives[0].durationSeconds = Number.POSITIVE_INFINITY;
      }),
    ),
    false,
  );
  assert.equal(
    validation.validateSiteResourcePayload(
      "hololiveDreams",
      corrupted("hololiveDreams", (payload) => {
        payload.events[0].chapters[0].startsAt = "invalid";
      }),
    ),
    false,
  );
});

test("unknown resources, sparse arrays and oversized strings fail closed", () => {
  assert.equal(validation.validateSiteResourcePayload("unknown", {}), false);
  assert.equal(validation.validateSiteResourcePayload("schedule", null), false);

  const sparse = structuredClone(payloads.schedule);
  sparse.entries = new Array(1);
  assert.equal(validation.validateSiteResourcePayload("schedule", sparse), false);

  const oversized = structuredClone(payloads.events);
  oversized.events[0].description = "x".repeat(16_385);
  assert.equal(validation.validateSiteResourcePayload("events", oversized), false);
});
