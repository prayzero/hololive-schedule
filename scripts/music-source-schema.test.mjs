import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMusicHeaders, assertMusicCoverage } from "./lib/music-source-schema.mjs";

test("original music headers accept both source versions without losing members", () => {
  const expected = ["title", "members_romaji", "release_date"];
  for (const headers of [["Title", "Members_Romaji", "Release_date"], expected]) {
    assert.deepEqual(normalizeMusicHeaders(headers, expected), expected);
  }
  assert.throws(() => normalizeMusicHeaders(["title", "members"], expected), /missing required column/);
  assert.throws(() => normalizeMusicHeaders(["Title", "title"], ["title"]), /duplicate/);
});

test("a partial source cannot replace the complete music archive", () => {
  const baseline = ["solo", "collaboration", "cover"].flatMap((category) => Array.from({ length: 10 }, () => ({ category })));
  assert.doesNotThrow(() => assertMusicCoverage(baseline, baseline));
  assert.throws(() => assertMusicCoverage(baseline.filter((track) => track.category === "cover"), baseline), /solo count dropped/);
  assert.throws(() => assertMusicCoverage(baseline.slice(3), baseline), /count dropped/);
});
