import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchJsonWithPolicy,
  fetchTextWithPolicy,
} from "./lib/safe-fetch.mjs";
import {
  readJsonFileStrict,
  writeFileAtomically,
} from "./lib/secure-io.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const researchDirectory = resolve(projectRoot, "research");
const publicDataDirectory = resolve(projectRoot, "public", "data");
const outputPath = resolve(researchDirectory, "youtube-metadata.json");
const YOUTUBE_ORIGIN = "https://www.youtube.com";
const REQUEST_TIMEOUT_MS = 20_000;
const CONCURRENCY = 6;
const MAXIMUM_RECORDS = 20_000;
const YOUTUBE_REQUEST_POLICY = {
  allowedOrigins: [YOUTUBE_ORIGIN],
  timeoutMs: REQUEST_TIMEOUT_MS,
  maxBytes: 8 * 1024 * 1024,
  maxRedirects: 2,
};

const [
  talentPayload,
  previousPayload,
  jpPayload,
  globalPayload,
  alumniPayload,
] = await Promise.all([
    readJsonFileStrict(resolve(publicDataDirectory, "talents.json")),
    readJsonFileStrict(resolve(publicDataDirectory, "youtube-lives.json"), {
      allowMissing: true,
      missingValue: { lives: [] },
      label: "existing public YouTube live archive",
    }),
    readJsonFileStrict(resolve(researchDirectory, "youtube-jp.json")),
    readJsonFileStrict(resolve(researchDirectory, "youtube-global.json")),
    readJsonFileStrict(resolve(researchDirectory, "youtube-alumni.json")),
  ]);

if (!Array.isArray(talentPayload.talents)) {
  throw new Error("Talent data must contain a talents array.");
}
if (talentPayload.talents.length > 500) {
  throw new Error("Talent data exceeds the 500-item safety limit.");
}
for (const [label, payload] of [
  ["JP", jpPayload],
  ["global", globalPayload],
  ["alumni", alumniPayload],
]) {
  if (!Array.isArray(payload.records) || payload.records.length > MAXIMUM_RECORDS) {
    throw new Error(`${label} research data has an invalid records array.`);
  }
}
const validatedTalents = talentPayload.talents.map((talent) => ({
  ...talent,
  id: requiredTalentId(talent.id),
  channelId: requiredYouTubeChannelId(talent.channelId),
}));
const talentsById = new Map(
  validatedTalents.map((talent) => [talent.id, talent]),
);
const recordsByVideoId = new Map();

for (const record of [
  ...jpPayload.records,
  ...globalPayload.records,
  ...alumniPayload.records,
]) {
  const memberId = requiredTalentId(record.memberId);
  const videoId = requiredYouTubeVideoId(record.videoId);
  const talent = talentsById.get(memberId);

  if (!talent) {
    throw new Error(`Unknown talent id: ${memberId}`);
  }

  const existing = recordsByVideoId.get(videoId) ?? {
    videoId,
    expectedChannelIds: new Set(),
  };
  existing.expectedChannelIds.add(talent.channelId);
  recordsByVideoId.set(videoId, existing);
  if (recordsByVideoId.size > MAXIMUM_RECORDS) {
    throw new Error(
      `Metadata workload exceeds the ${MAXIMUM_RECORDS}-video safety limit.`,
    );
  }
}

const previousByVideoId = new Map(
  (previousPayload.lives ?? []).map((live) => [live.videoId, live]),
);
const seedTalent = validatedTalents.find(
  (talent) => talent.channelId && talent.status !== "alumni",
);

if (!seedTalent) {
  throw new Error("No official YouTube channel is available for configuration.");
}

const searchUrl = new URL(
  `/channel/${encodeURIComponent(seedTalent.channelId)}/search`,
  YOUTUBE_ORIGIN,
);
searchUrl.searchParams.set("query", "3D LIVE");
const searchHtml = await fetchText(searchUrl.toString());
const apiKey = requiredYouTubeApiKey(
  searchHtml.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1],
);
const clientVersion = requiredYouTubeClientVersion(
  searchHtml.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1],
);
const playerUrl = new URL("/youtubei/v1/player", YOUTUBE_ORIGIN);
playerUrl.searchParams.set("key", apiKey);

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
        playerUrl.toString(),
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
        typeof publishedAt !== "string" ||
        !Number.isFinite(Date.parse(publishedAt)) ||
        Date.parse(publishedAt) > Date.now() + 24 * 60 * 60 * 1_000 ||
        !Number.isSafeInteger(durationSeconds) ||
        durationSeconds < 20 * 60 ||
        durationSeconds > 7 * 24 * 60 * 60
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

await writeFileAtomically(
  outputPath,
  `${JSON.stringify(payload, null, 2)}\n`,
);

const complete = videos.filter(
  (video) => video.publishedAt && video.durationSeconds,
).length;
console.log(`Verified YouTube metadata for ${complete}/${videos.length} videos.`);

async function fetchText(url) {
  const response = await fetchTextWithPolicy(
    url,
    { headers: requestHeaders() },
    YOUTUBE_REQUEST_POLICY,
  );
  return response.text;
}

async function fetchJson(url, options) {
  const response = await fetchJsonWithPolicy(
    url,
    {
      ...options,
      headers: requestHeaders(options?.headers),
    },
    YOUTUBE_REQUEST_POLICY,
  );
  return response.json;
}

function requestHeaders(headers = {}) {
  return {
    "Content-Type": "application/json",
    "Accept-Language": "en-US,en;q=0.9,ja;q=0.8",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
    ...headers,
  };
}

function requiredTalentId(value) {
  const talentId = String(value ?? "");
  if (
    talentId.length > 80 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(talentId)
  ) {
    throw new Error(`Invalid talent id: ${talentId}`);
  }
  return talentId;
}

function requiredYouTubeChannelId(value) {
  const channelId = String(value ?? "");
  if (!/^UC[A-Za-z0-9_-]{22}$/.test(channelId)) {
    throw new Error(`Invalid official YouTube channel id: ${channelId}`);
  }
  return channelId;
}

function requiredYouTubeVideoId(value) {
  const videoId = String(value ?? "");
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new Error(`Invalid YouTube video id: ${videoId}`);
  }
  return videoId;
}

function requiredYouTubeApiKey(value) {
  const apiKey = String(value ?? "");
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(apiKey)) {
    throw new Error("YouTube client API key was missing or malformed.");
  }
  return apiKey;
}

function requiredYouTubeClientVersion(value) {
  const clientVersion = String(value ?? "");
  if (!/^\d+(?:\.\d+){2,5}$/.test(clientVersion)) {
    throw new Error("YouTube client version was missing or malformed.");
  }
  return clientVersion;
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
