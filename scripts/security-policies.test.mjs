import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { approvedMusicHttpsUrl } from "./lib/music-url-policy.mjs";
import {
  resolveContainedPath,
  validateExternalArchiveRoot,
} from "./lib/secure-io.mjs";
import { validateUrl } from "./lib/safe-fetch.mjs";

test("request URL policy is HTTPS-only and fail-closed", () => {
  const policy = { allowedOrigins: ["https://www.youtube.com"] };
  assert.equal(
    validateUrl("https://www.youtube.com/watch?v=abcdefghijk", policy).origin,
    "https://www.youtube.com",
  );
  assert.throws(() => validateUrl("http://www.youtube.com/watch", policy));
  assert.throws(() =>
    validateUrl("https://user:pass@www.youtube.com/watch", policy),
  );
  assert.throws(() =>
    validateUrl("https://www.youtube.com:8443/watch", policy),
  );
  assert.throws(() =>
    validateUrl("https://www.youtube.com.example.test/watch", policy),
  );
});

test("hostname suffix policy requires a DNS label boundary", () => {
  const policy = { allowedHostnameSuffixes: ["lnk.to"] };
  assert.equal(
    validateUrl("https://artist.lnk.to/release", policy).hostname,
    "artist.lnk.to",
  );
  assert.throws(() => validateUrl("https://artist.lnk.to.example.test", policy));
  assert.throws(() => validateUrl("https://notlnk.to", policy));
});

test("music links reject deceptive or credentialed URLs", () => {
  assert.equal(
    approvedMusicHttpsUrl("https://artist.lnk.to/release"),
    "https://artist.lnk.to/release",
  );
  assert.equal(approvedMusicHttpsUrl("https://artist.lnk.to.example.test"), null);
  assert.equal(approvedMusicHttpsUrl("https://user:pass@open.spotify.com/x"), null);
  assert.equal(approvedMusicHttpsUrl("javascript:alert(1)"), null);
});

test("contained paths cannot traverse outside their root", () => {
  const root = resolve(tmpdir(), "holo-now-contained-root");
  assert.equal(resolveContainedPath(root, "data", "archive.json"), resolve(root, "data", "archive.json"));
  assert.throws(() => resolveContainedPath(root, "..", "outside.json"));
});

test("GitHub Actions archive roots must stay below RUNNER_TEMP", {
  concurrency: false,
}, () => {
  const previousActions = process.env.GITHUB_ACTIONS;
  const previousRunnerTemp = process.env.RUNNER_TEMP;
  const runnerTemp = resolve(tmpdir(), "holo-now-runner-temp");
  const archiveRoot = resolve(runnerTemp, "schedule-archive");

  try {
    process.env.GITHUB_ACTIONS = "true";
    process.env.RUNNER_TEMP = runnerTemp;
    assert.equal(
      validateExternalArchiveRoot(archiveRoot, {
        workspaceRoot: process.cwd(),
      }),
      archiveRoot,
    );
    assert.throws(() =>
      validateExternalArchiveRoot(runnerTemp, {
        workspaceRoot: process.cwd(),
      }),
    );
    assert.throws(() =>
      validateExternalArchiveRoot(resolve(tmpdir(), "outside-runner-temp"), {
        workspaceRoot: process.cwd(),
      }),
    );
    delete process.env.RUNNER_TEMP;
    assert.throws(() =>
      validateExternalArchiveRoot(archiveRoot, {
        workspaceRoot: process.cwd(),
      }),
    );
  } finally {
    if (previousActions === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = previousActions;
    if (previousRunnerTemp === undefined) delete process.env.RUNNER_TEMP;
    else process.env.RUNNER_TEMP = previousRunnerTemp;
  }
});
