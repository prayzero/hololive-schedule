import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const researchDirectory = resolve(projectRoot, "research");
const publicDataDirectory = resolve(projectRoot, "public", "data");
const outputPath = resolve(researchDirectory, "youtube-metadata.json");
const REQUEST_TIMEOUT_MS = 20_000;
const CONCURRENCY = 6;

const [
  talentPayload,
  previousPayload,
  jpPayload,
  globalPayload,
  alumniPayload,
] = await Promise.all([
    readJson(resolve(publicDataDirectory, "talents.json")),
    readJson(resolve(publicDataDirectory, "youtube-lives.json")).catch(() => ({
      lives: [],
    })),
    readJson(resolve(researchDirectory, "youtube-jp.json")),
    readJson(resolve(researchDirectory, "youtube-global.json")),
    readJson(resolve(researchDirectory, "youtube-alumni.json")),
  ]);

const talentsById = new Map(
  talentPayload.talents.map((talent) => [talent.id, talent]),
);
const recordsByVideoId = new Map();

for (const record of [
  ...jpPayload.records,
  ...globalPayload.records,
  ...alumniPayload.records,
]) {
  const talent = talentsById.get(record.memberId);

  if (!talent) {
    throw new Error(`Unknown talent id: ${record.memberId}`);
  }

  const existing = recordsByVideoId.get(record.videoId) ?? {
    videoId: record.videoId,
    expectedChannelIds: new Set(),
  };
  existing.expectedChannelIds.add(talent.channelId);
  recordsByVideoId.set(record.videoId, existing);
}

const previousByVideoId = new Map(
  (previousPayload.lives ?? []).map((live) => [live.videoId, live]),
);
const seedTalent = talentPayload.talents.find(
  (talent) => talent.channelId && talent.status !== "alumni",
);

if (!seedTalent) {
  throw new Error("No official YouTube channel is available for configuration.");
}

const searchHtml = await fetchText(
  `https://www.youtube.com/channel/${seedTalent.channelId}/search?query=3D%20LIVE`,
);
const apiKey = searchHtml.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
const clientVersion = searchHtml.match(
  /"INNERTUBE_CLIENT_VERSION":"([^"]+)"/,
)?.[1];

if (!apiKey || !clientVersion) {
  throw new Error("YouTube client configuration was not found.");
}

const videos = await mapWithConcurrency(
  Array.from(recordsByVideoId.values()),
  CONCURRENCY,
  async ({ videoId, expectedChannelIds }) => {
    const previous = previousByVideoId.get(videoId);

    if (previous?.publishedAt && previous?.durationSeconds) {
      return {
        videoId,
        channelId: previous.channelId,
        publishedAt: previous.publishedAt,
        durationSeconds: previous.durationSeconds,
      };
    }

    try {
      const player = await fetchJson(
        `https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          body: JSON.stringify({
            context: {
              client: {
                clientName: "WEB",
                clientVersion,
                hl: "en",
                gl: "US",
              },
            },
            videoId,
            contentCheckOk: true,
            racyCheckOk: true,
          }),
        },
      );
      const details = player.videoDetails;
      const microformat = player.microformat?.playerMicroformatRenderer;
      const publishedAt =
        microformat?.liveBroadcastDetails?.startTimestamp ??
        microformat?.publishDate ??
        microformat?.uploadDate ??
        null;
      const durationSeconds = Number(details?.lengthSeconds);

      if (
        !details?.channelId ||
        !expectedChannelIds.has(details.channelId) ||
        !publishedAt ||
        !Number.isFinite(durationSeconds)
      ) {
        console.warn(`Metadata validation failed for ${videoId}.`);
        return {
          videoId,
          channelId: details?.channelId ?? null,
          publishedAt: null,
          durationSeconds: null,
        };
      }

      return {
        videoId,
        channelId: details.channelId,
        publishedAt:
          /^\d{4}-\d{2}-\d{2}$/.test(publishedAt)
            ? `${publishedAt}T00:00:00Z`
            : publishedAt,
        durationSeconds,
      };
    } catch (error) {
      console.warn(
        `Metadata request failed for ${videoId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        videoId,
        channelId: null,
        publishedAt: null,
        durationSeconds: null,
      };
    }
  },
);

const payload = {
  checkedAt: new Date().toISOString(),
  sourceUrl: "https://www.youtube.com/",
  sourceNote:
    "큐레이션된 공식 채널 영상의 게시 시각·영상 길이를 YouTube player metadata로 교차 확인한 캐시입니다.",
  videos: videos.sort((left, right) =>
    left.videoId.localeCompare(right.videoId),
  ),
};

await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

const complete = videos.filter(
  (video) => video.publishedAt && video.durationSeconds,
).length;
console.log(`Verified YouTube metadata for ${complete}/${videos.length} videos.`);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function fetchText(url) {
  const response = await request(url);
  return response.text();
}

async function fetchJson(url, options) {
  const response = await request(url, options);
  return response.json();
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": "en-US,en;q=0.9,ja;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
        ...(options.headers ?? {}),
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(items.length, 1)) },
      runWorker,
    ),
  );

  return results;
}
