import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const compileDirectory = mkdtempSync(join(tmpdir(), "holo-data-loading-"));
let loading;
try {
  execFileSync(process.execPath, [resolve("node_modules/typescript/bin/tsc"),
    resolve("src/dataLoading.ts"), "--ignoreConfig", "--target", "ES2022",
    "--module", "ESNext", "--moduleResolution", "Bundler", "--skipLibCheck",
    "--outDir", compileDirectory], { stdio: "pipe" });
  loading = await import(pathToFileURL(join(compileDirectory, "dataLoading.js")).href);
} finally {
  rmSync(compileDirectory, { recursive: true, force: true });
}

const files = {
  schedule: "schedule.json", scheduleIndex: "schedule-index.json", events: "events.json",
  talents: "talents.json", solos: "solo-lives.json", youtubeLives: "youtube-lives.json",
  hololiveDreams: "hololive-dreams.json",
};
const payloads = Object.fromEntries(Object.entries(files).map(([key, file]) =>
  [key, JSON.parse(readFileSync(resolve("public/data", file), "utf8"))]));
const urls = Object.fromEntries(loading.RESOURCE_KEYS.map((key) => [key, key]));
const ok = (value) => new Response(JSON.stringify(value), { status: 200 });

test("a failed auxiliary resource does not block other resources or overwrite previous data", async () => {
  const data = { hololiveDreams: payloads.hololiveDreams };
  const errors = {};
  await loading.loadSiteResources(urls, new AbortController().signal,
    (key, value) => { data[key] = value; }, (key, message) => { errors[key] = message; },
    async (key) => key === "hololiveDreams" ? new Response("unavailable", { status: 503 }) : ok(payloads[key]));
  assert.equal(data.schedule.entries.length, payloads.schedule.entries.length);
  assert.equal(data.events.events.length, payloads.events.events.length);
  assert.equal(data.hololiveDreams, payloads.hololiveDreams);
  assert.deepEqual(Object.keys(errors), ["hololiveDreams"]);
  assert.equal(loading.resourceErrorForView("schedule", errors), null);
  assert.match(loading.resourceErrorForView("dream", errors), /홀로도리/);
});

test("healthy resources render before a slow auxiliary feed finishes", async () => {
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  const loaded = new Set();
  const pending = loading.loadSiteResources(urls, new AbortController().signal,
    (key) => loaded.add(key), () => {},
    async (key) => key === "hololiveDreams" ? slow : ok(payloads[key]));
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(loaded.has("schedule"));
  assert.ok(loaded.has("events"));
  assert.ok(!loaded.has("hololiveDreams"));
  release(ok(payloads.hololiveDreams));
  await pending;
  assert.equal(loaded.size, loading.RESOURCE_KEYS.length);
});

test("invalid JSON shapes and timed-out requests fail only their resource", async () => {
  await assert.rejects(loading.loadSiteResource("schedule", "schedule", new AbortController().signal,
    async () => ok({ entries: null })), /방송 일정/);
  await assert.rejects(loading.loadSiteResource("events", "events", new AbortController().signal,
    (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })), 5), /행사/);
});

test("aborted loads do not publish stale results or errors", async () => {
  const controller = new AbortController();
  controller.abort();
  const updates = [];
  await loading.loadSiteResources(urls, controller.signal,
    (...args) => updates.push(args), (...args) => updates.push(args), async (key) => ok(payloads[key]));
  assert.equal(updates.length, 0);
});

test("archive errors belong only to their selected month on the schedule page", () => {
  const error = { month: "2026-08", message: "archive failure" };
  assert.equal(loading.archiveErrorForView("schedule", "2026-08-24", error), error.message);
  assert.equal(loading.archiveErrorForView("schedule", "2026-09-16", error), null);
  assert.equal(loading.archiveErrorForView("dream", "2026-08-24", error), null);
  assert.equal(loading.archiveErrorForView("cards", "2026-08-24", error), null);
});

test("date fallback unhides past broadcasts without changing an existing selection", () => {
  assert.deepEqual(loading.fallbackScheduleDate(["2026-09-15"], "2026-09-16", "2026-09-16"),
    { date: "2026-09-15", hideEnded: false });
  assert.deepEqual(loading.fallbackScheduleDate(["2026-09-17"], "2026-09-16", "2026-09-16"),
    { date: "2026-09-17", hideEnded: true });
  assert.equal(loading.fallbackScheduleDate(["2026-08-24"], "2026-08-24", "2026-09-16"), null);
  assert.equal(loading.fallbackScheduleDate([], "2026-09-16", "2026-09-16"), null);
});
