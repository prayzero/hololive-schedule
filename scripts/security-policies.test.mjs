import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { approvedMusicHttpsUrl } from "./lib/music-url-policy.mjs";
import {
  resolveContainedPath,
  validateExternalArchiveRoot,
} from "./lib/secure-io.mjs";
import {
  fetchTextWithPolicy,
  validateUrl,
} from "./lib/safe-fetch.mjs";

async function withMockFetch(mock, operation) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;

  try {
    return await operation();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

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

test("safe fetch retries a bounded number of transient transport failures", {
  concurrency: false,
}, async () => {
  let calls = 0;

  await withMockFetch(
    async () => {
      calls += 1;
      if (calls < 3) {
        throw new TypeError("fetch failed", {
          cause: Object.assign(new Error("connection reset"), {
            code: "ECONNRESET",
          }),
        });
      }
      return new Response("ok");
    },
    async () => {
      const result = await fetchTextWithPolicy(
        "https://schedule.example.test/lives",
        {},
        {
          allowedOrigins: ["https://schedule.example.test"],
          maxRetries: 2,
          retryBaseDelayMs: 0,
        },
      );

      assert.equal(result.text, "ok");
    },
  );

  assert.equal(calls, 3);

  calls = 0;
  await withMockFetch(
    async () => {
      calls += 1;
      throw new TypeError("fetch failed", {
        cause: Object.assign(new Error("connection reset"), {
          code: "ECONNRESET",
        }),
      });
    },
    async () => {
      await assert.rejects(
        fetchTextWithPolicy(
          "https://schedule.example.test/lives",
          {},
          {
            allowedOrigins: ["https://schedule.example.test"],
            maxRetries: 2,
            retryBaseDelayMs: 0,
          },
        ),
        /fetch failed/,
      );
    },
  );
  assert.equal(calls, 3);
});

test("safe fetch retries transient HTTP status but not authorization failure", {
  concurrency: false,
}, async () => {
  let transientCalls = 0;
  await withMockFetch(
    async () => {
      transientCalls += 1;
      return transientCalls === 1
        ? new Response("", {
            status: 503,
            statusText: "Service Unavailable",
            headers: { "Retry-After": "0" },
          })
        : new Response("recovered");
    },
    async () => {
      const result = await fetchTextWithPolicy(
        "https://schedule.example.test/lives",
        {},
        {
          allowedOrigins: ["https://schedule.example.test"],
          maxRetries: 1,
          retryBaseDelayMs: 0,
        },
      );
      assert.equal(result.text, "recovered");
    },
  );
  assert.equal(transientCalls, 2);

  let forbiddenCalls = 0;
  await withMockFetch(
    async () => {
      forbiddenCalls += 1;
      return new Response("", { status: 403, statusText: "Forbidden" });
    },
    async () => {
      await assert.rejects(
        fetchTextWithPolicy(
          "https://schedule.example.test/lives",
          {},
          {
            allowedOrigins: ["https://schedule.example.test"],
            maxRetries: 3,
            retryBaseDelayMs: 0,
          },
        ),
        /responded with 403 Forbidden/,
      );
    },
  );
  assert.equal(forbiddenCalls, 1);
});

test("safe fetch rejects disallowed origins before any retry or request", {
  concurrency: false,
}, async () => {
  let calls = 0;

  await withMockFetch(
    async () => {
      calls += 1;
      return new Response("unexpected");
    },
    async () => {
      await assert.rejects(
        fetchTextWithPolicy(
          "https://attacker.example.test/lives",
          {},
          {
            allowedOrigins: ["https://schedule.example.test"],
            maxRetries: 3,
            retryBaseDelayMs: 0,
          },
        ),
        /not allowlisted/,
      );
    },
  );

  assert.equal(calls, 0);
});

test("safe fetch revalidates every redirect without retrying policy failures", {
  concurrency: false,
}, async () => {
  let calls = 0;

  await withMockFetch(
    async () => {
      calls += 1;
      return new Response("", {
        status: 302,
        headers: { Location: "https://attacker.example.test/redirected" },
      });
    },
    async () => {
      await assert.rejects(
        fetchTextWithPolicy(
          "https://schedule.example.test/lives",
          {},
          {
            allowedOrigins: ["https://schedule.example.test"],
            maxRetries: 3,
            retryBaseDelayMs: 0,
          },
        ),
        /not allowlisted/,
      );
    },
  );

  assert.equal(calls, 1);

  calls = 0;
  await withMockFetch(
    async () => {
      calls += 1;
      return new Response("", {
        status: 302,
        headers: { Location: "/again" },
      });
    },
    async () => {
      await assert.rejects(
        fetchTextWithPolicy(
          "https://schedule.example.test/lives",
          {},
          {
            allowedOrigins: ["https://schedule.example.test"],
            maxRedirects: 0,
            maxRetries: 3,
            retryBaseDelayMs: 0,
          },
        ),
        /Too many redirects while requesting https:\/\/schedule\.example\.test\/lives/,
      );
    },
  );
  assert.equal(calls, 1);
});

test("safe fetch does not retry response-size violations or unsafe methods", {
  concurrency: false,
}, async () => {
  let oversizedCalls = 0;
  await withMockFetch(
    async () => {
      oversizedCalls += 1;
      return new Response("oversized", {
        headers: { "Content-Length": "9" },
      });
    },
    async () => {
      await assert.rejects(
        fetchTextWithPolicy(
          "https://schedule.example.test/lives",
          {},
          {
            allowedOrigins: ["https://schedule.example.test"],
            maxBytes: 4,
            maxRetries: 3,
            retryBaseDelayMs: 0,
          },
        ),
        /exceeds 4 bytes/,
      );
    },
  );
  assert.equal(oversizedCalls, 1);

  let postCalls = 0;
  await withMockFetch(
    async () => {
      postCalls += 1;
      throw new TypeError("fetch failed", {
        cause: Object.assign(new Error("connection reset"), {
          code: "ECONNRESET",
        }),
      });
    },
    async () => {
      await assert.rejects(
        fetchTextWithPolicy(
          "https://schedule.example.test/lives",
          { method: "POST", body: "payload" },
          {
            allowedOrigins: ["https://schedule.example.test"],
            maxRetries: 3,
            retryBaseDelayMs: 0,
          },
        ),
        /fetch failed/,
      );
    },
  );
  assert.equal(postCalls, 1);
});

test("safe fetch retries its own timeout but never retries caller cancellation", {
  concurrency: false,
}, async () => {
  let timeoutCalls = 0;
  await withMockFetch(
    async (_url, { signal }) => {
      timeoutCalls += 1;
      return await new Promise((resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(signal.reason ?? new Error("aborted")),
          { once: true },
        );
      });
    },
    async () => {
      await assert.rejects(
        fetchTextWithPolicy(
          "https://schedule.example.test/lives",
          {},
          {
            allowedOrigins: ["https://schedule.example.test"],
            timeoutMs: 5,
            maxRetries: 1,
            retryBaseDelayMs: 0,
          },
        ),
        /timed out after 5ms/,
      );
    },
  );
  assert.equal(timeoutCalls, 2);

  const caller = new AbortController();
  let cancelledCalls = 0;
  await withMockFetch(
    async (_url, { signal }) => {
      cancelledCalls += 1;
      return await new Promise((resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(signal.reason ?? new Error("aborted")),
          { once: true },
        );
      });
    },
    async () => {
      const request = fetchTextWithPolicy(
        "https://schedule.example.test/lives",
        { signal: caller.signal },
        {
          allowedOrigins: ["https://schedule.example.test"],
          maxRetries: 3,
          retryBaseDelayMs: 0,
        },
      );
      caller.abort(new Error("caller cancelled"));
      await assert.rejects(request, /caller cancelled/);
    },
  );
  assert.equal(cancelledCalls, 1);
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
