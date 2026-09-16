import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const compileDirectory = mkdtempSync(join(tmpdir(), "holo-discovery-"));
let eventRegions;
let scheduleSearch;
let search;

try {
  execFileSync(
    process.execPath,
    [
      resolve("node_modules/typescript/bin/tsc"),
      resolve("src/eventRegions.ts"),
      resolve("src/scheduleSearch.ts"),
      resolve("src/search.ts"),
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

  const compiledFiles = readdirSync(compileDirectory, {
    recursive: true,
    withFileTypes: true,
  }).filter((entry) => entry.isFile());
  const importCompiled = async (fileName) => {
    const compiled = compiledFiles.find(
      (entry) => basename(entry.name) === fileName,
    );
    assert.ok(compiled, `${fileName} should be emitted`);
    return import(
      pathToFileURL(resolve(compiled.parentPath, compiled.name)).href
    );
  };

  [eventRegions, scheduleSearch, search] = await Promise.all([
    importCompiled("eventRegions.js"),
    importCompiled("scheduleSearch.js"),
    importCompiled("search.js"),
  ]);
} finally {
  rmSync(compileDirectory, { recursive: true, force: true });
}

test("regional event discovery includes every supported direct region", () => {
  assert.deepEqual([...eventRegions.LOCAL_EVENT_FILTERS], [
    "ALL",
    "JP",
    "KR",
    "US",
    "TW",
    "CN",
    "GLOBAL",
    "ENDED",
  ]);

  for (const region of ["JP", "KR", "US", "TW", "CN"]) {
    const event = { region, categories: ["collaboration"] };
    assert.equal(eventRegions.isDiscoverableLocalEvent(event), true);
    assert.equal(eventRegions.eventMatchesRegionFilter(event, "ALL"), true);
    assert.equal(eventRegions.eventMatchesRegionFilter(event, region), true);
    assert.equal(
      eventRegions.eventMatchesRegionFilter(event, "GLOBAL"),
      false,
    );
  }
});

test("a global event appears in country tabs only through explicit metadata", () => {
  const photoism = {
    region: "GLOBAL",
    supportedRegions: ["JP", "KR"],
    categories: ["collaboration"],
  };

  assert.equal(eventRegions.eventMatchesRegionFilter(photoism, "GLOBAL"), true);
  assert.equal(eventRegions.eventMatchesRegionFilter(photoism, "JP"), true);
  assert.equal(eventRegions.eventMatchesRegionFilter(photoism, "KR"), true);
  assert.equal(eventRegions.eventMatchesRegionFilter(photoism, "US"), false);
  assert.equal(
    eventRegions.eventMatchesRegionFilter(
      { ...photoism, supportedRegions: undefined },
      "JP",
    ),
    false,
  );
});

test("schedule search uses the displayed roster identity and actual branch", () => {
  const entry = { name: "Elizabeth", title: null, branch: "JP" };
  const talent = {
    name: "Elizabeth Rose Bloodflame",
    nameKo: "엘리자베스 로즈 블러드플레임",
    nativeName: "エリザベス・ローズ・ブラッドフレイム",
    branch: "EN",
    generation: "Justice",
    aliases: ["Elizabeth", "ERB", "Liz"],
  };
  const values = scheduleSearch.broadcastSearchValues(entry, talent);

  assert.equal(
    search.includesSearch(values, search.normalizeSearch("엘리자베스")),
    true,
  );
  assert.equal(
    search.includesSearch(values, search.normalizeSearch("ERB")),
    true,
  );
  assert.equal(
    search.includesSearch(values, search.normalizeSearch("EN")),
    true,
  );
  assert.equal(
    search.includesSearch(values, search.normalizeSearch("JP")),
    false,
  );
});
