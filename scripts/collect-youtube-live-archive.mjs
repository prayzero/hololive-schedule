import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchJsonWithPolicy,
  fetchTextWithPolicy,
} from "./lib/safe-fetch.mjs";
import { writeFileAtomically } from "./lib/secure-io.mjs";

const YOUTUBE_ROOT = "https://www.youtube.com";
const REQUEST_TIMEOUT_MS = 20_000;
const SEARCH_CONCURRENCY = 4;
const VIDEO_CONCURRENCY = 6;
const MINIMUM_DURATION_SECONDS = 20 * 60;
const COLLECTOR_VERSION = "1.0.0";
const MAX_SELECTED_TALENTS = 120;
const MAX_SEARCH_TASKS = 500;
const MAX_RENDERER_NODES = 200_000;
const MAX_VIDEO_CANDIDATES = 5_000;
const MAX_VIDEO_TITLE_LENGTH = 500;
const YOUTUBE_REQUEST_POLICY = {
  allowedOrigins: [YOUTUBE_ROOT],
  timeoutMs: REQUEST_TIMEOUT_MS,
  maxBytes: 8 * 1024 * 1024,
  maxRedirects: 2,
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const talentsPath = resolve(projectRoot, "public", "data", "talents.json");
const outputPath = resolve(
  projectRoot,
  "public",
  "data",
  "youtube-lives.json",
);

const cliMembers = process.argv
  .find((argument) => argument.startsWith("--members="))
  ?.slice("--members=".length)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const dryRun = process.argv.includes("--dry-run");
const debug = process.argv.includes("--debug");

const SEARCH_QUERIES = {
  JP: ["3D LIVE", "生誕祭", "誕生日 LIVE", "周年 LIVE"],
  DEV_IS: ["3D LIVE", "生誕祭", "誕生日 LIVE", "周年 LIVE"],
  EN: ["3D LIVE", "birthday live", "anniversary live", "solo concert"],
  ID: [
    "3D LIVE",
    "birthday live",
    "anniversary live",
    "ulang tahun live",
  ],
};

const QUALIFYING_PATTERNS = [
  /\b3d\s*(?:live|debut|showcase|concert)\b/i,
  /3d(?:ライブ|お披露目|生誕祭|記念)/i,
  /(?:birthday|b-?day).*(?:live|concert|3d|karaoke)/i,
  /(?:live|concert|3d|karaoke).*(?:birthday|b-?day)/i,
  /(?:誕生日|生誕).*(?:live|ライブ|3d|歌|祭)/i,
  /(?:live|ライブ|3d|歌).*(?:誕生日|生誕祭)/i,
  /(?:anniversary|debut).*(?:live|concert|3d|karaoke)/i,
  /(?:live|concert|3d|karaoke).*(?:anniversary|debut)/i,
  /周年.*(?:live|ライブ|3d|歌|祭)/i,
  /(?:live|ライブ|3d|歌).*周年/i,
  /(?:solo\s*live|sololive|solo\s*concert|one[- ]man)/i,
  /(?:ワンマン|ソロ)(?:ライブ|コンサート)/i,
  /ulang\s*tahun.*(?:live|concert|3d|karaoke)/i,
  /(?:live|concert|3d|karaoke).*ulang\s*tahun/i,
];

const EXCLUDED_PATTERNS = [
  /\b(?:trailer|teaser|digest|highlights?|clip|shorts?)\b/i,
  /(?:予告|告知枠|切り抜き|ダイジェスト|振り返り)/i,
  /(?:チラ見せ|無料パート)/i,
  /\b(?:watchalong|watch-along|reaction|after ?talk)\b/i,
  /(?:同時視聴|アフタートーク|感想会)/i,
  /\b(?:countdown|call-?in|free chat|waiting room)\b/i,
  /(?:カウントダウン|凸待ち|待機所)/i,
  /\b(?:merch|merchandise|goods)\b/i,
  /(?:グッズ|商品紹介)/i,
];

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function textFromRuns(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return normalizeText(value);
  }

  if (value.simpleText) {
    return normalizeText(value.simpleText);
  }

  if (Array.isArray(value.runs)) {
    return normalizeText(value.runs.map(({ text }) => text ?? "").join(""));
  }

  return "";
}

function parseDuration(value) {
  const parts = normalizeText(value)
    .split(":")
    .map(Number);

  if (
    parts.length < 2 ||
    parts.length > 3 ||
    parts.some((part) => !Number.isFinite(part))
  ) {
    return null;
  }

  return parts.reduce((total, part) => total * 60 + part, 0);
}

function classifyTitle(title) {
  const normalized = normalizeText(title);

  if (/(?:birthday|b-?day|誕生日|生誕|ulang\s*tahun)/i.test(normalized)) {
    return "birthday";
  }

  if (/(?:anniversary|周年|デビュー記念|debut.*anniversary)/i.test(normalized)) {
    return "anniversary";
  }

  if (
    /(?:solo\s*live|sololive|solo\s*concert|one[- ]man|ワンマン|ソロコンサート|コンサート)/i.test(
      normalized,
    )
  ) {
    return "concert";
  }

  if (/\b3d\b|3d(?:ライブ|お披露目|記念)/i.test(normalized)) {
    return "3d";
  }

  return "special";
}

function titleQualifies(title, durationSeconds) {
  const normalized = normalizeText(title);
  const qualificationTitle = normalized.replace(/ホロライブ/gi, "");

  return (
    durationSeconds >= MINIMUM_DURATION_SECONDS &&
    QUALIFYING_PATTERNS.some((pattern) => pattern.test(qualificationTitle)) &&
    !EXCLUDED_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

function extractInitialData(html) {
  const match = html.match(/var ytInitialData = (.*?);<\/script>/s);

  if (!match) {
    throw new Error("YouTube ytInitialData was not found.");
  }

  return JSON.parse(match[1]);
}

function extractClientConfig(html) {
  const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
  const clientVersion = html.match(
    /"INNERTUBE_CLIENT_VERSION":"([^"]+)"/,
  )?.[1];

  if (
    !/^[A-Za-z0-9_-]{20,128}$/.test(String(apiKey ?? "")) ||
    !/^\d+(?:\.\d+){2,5}$/.test(String(clientVersion ?? ""))
  ) {
    throw new Error("YouTube client configuration was not found.");
  }

  return { apiKey, clientVersion };
}

function collectVideoRenderers(value) {
  const results = [];
  const stack = [value];
  let visitedNodes = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    visitedNodes += 1;
    if (visitedNodes > MAX_RENDERER_NODES) {
      throw new Error("YouTube search response is too structurally complex.");
    }
    if (current.videoRenderer) {
      if (results.length >= MAX_VIDEO_CANDIDATES) {
        throw new Error("YouTube search response contains too many videos.");
      }
      results.push(current.videoRenderer);
    }
    const children = Object.values(current);
    if (visitedNodes + stack.length + children.length > MAX_RENDERER_NODES) {
      throw new Error("YouTube search response is too structurally complex.");
    }
    for (const child of children) {
      stack.push(child);
    }
  }

  return results;
}

function candidateFromRenderer(renderer, memberIds, channelId) {
  if (!isYouTubeVideoId(renderer.videoId)) {
    return null;
  }
  const videoId = String(renderer.videoId);
  const title = textFromRuns(renderer.title);
  const durationText = textFromRuns(renderer.lengthText);
  const durationSeconds = parseDuration(durationText);

  if (
    !title ||
    title.length > MAX_VIDEO_TITLE_LENGTH ||
    !durationSeconds ||
    !titleQualifies(title, durationSeconds)
  ) {
    return null;
  }

  return {
    id: videoId,
    videoId,
    memberIds,
    channelId,
    title,
    category: classifyTitle(title),
    publishedLabel: textFromRuns(renderer.publishedTimeText) || null,
    publishedAt: null,
    durationSeconds,
    videoUrl: `${YOUTUBE_ROOT}/watch?v=${videoId}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
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

function isYouTubeVideoId(value) {
  return /^[A-Za-z0-9_-]{11}$/.test(String(value ?? ""));
}

function requiredYouTubeVideoId(value) {
  const videoId = String(value ?? "");
  if (!isYouTubeVideoId(videoId)) {
    throw new Error(`Invalid YouTube video id: ${videoId}`);
  }
  return videoId;
}

async function fetchText(url, options = {}) {
  const response = await fetchTextWithPolicy(
    url,
    {
      ...options,
      headers: {
        "Accept-Language": "en-US,en;q=0.9,ja;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
        ...(options.headers ?? {}),
      },
    },
    YOUTUBE_REQUEST_POLICY,
  );
  return response.text;
}

async function fetchJson(url, options = {}) {
  const response = await fetchJsonWithPolicy(
    url,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": "en-US,en;q=0.9,ja;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
        ...(options.headers ?? {}),
      },
    },
    YOUTUBE_REQUEST_POLICY,
  );
  return response.json;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
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

async function collectSearchPage(task) {
  const channelId = requiredYouTubeChannelId(task.channelId);
  const searchUrl = new URL(
    `/channel/${encodeURIComponent(channelId)}/search`,
    YOUTUBE_ROOT,
  );
  searchUrl.searchParams.set("query", task.query);
  const html = await fetchText(searchUrl.toString());
  const initialData = extractInitialData(html);
  const candidates = collectVideoRenderers(initialData)
    .map((renderer) =>
      candidateFromRenderer(renderer, task.memberIds, task.channelId),
    )
    .filter(Boolean);

  return {
    candidates,
    clientConfig: extractClientConfig(html),
  };
}

async function enrichCandidate(candidate, clientConfig) {
  try {
    const videoId = requiredYouTubeVideoId(candidate.videoId);
    const playerUrl = new URL("/youtubei/v1/player", YOUTUBE_ROOT);
    playerUrl.searchParams.set("key", clientConfig.apiKey);
    const player = await fetchJson(
      playerUrl.toString(),
      {
        method: "POST",
        body: JSON.stringify({
          context: {
            client: {
              clientName: "WEB",
              clientVersion: clientConfig.clientVersion,
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
    const durationSeconds = Number(details?.lengthSeconds);

    const playable =
      Boolean(details?.title && details?.channelId) &&
      !["ERROR", "LOGIN_REQUIRED"].includes(
        player.playabilityStatus?.status ?? "",
      );
    const officialChannel = details?.channelId === candidate.channelId;
    const qualifying = titleQualifies(
      details?.title ?? candidate.title,
      durationSeconds,
    );

    if (!playable || !officialChannel || !qualifying) {
      if (debug) {
        console.warn("Rejected video", {
          videoId: candidate.videoId,
          status: player.playabilityStatus?.status,
          expectedChannelId: candidate.channelId,
          actualChannelId: details?.channelId,
          durationSeconds,
          title: details?.title ?? candidate.title,
          qualifying,
        });
      }
      return null;
    }

    const publishedDate =
      microformat?.liveBroadcastDetails?.startTimestamp ??
      microformat?.publishDate ??
      microformat?.uploadDate ??
      null;

    return {
      ...candidate,
      title: normalizeText(details.title ?? candidate.title),
      category: classifyTitle(details.title ?? candidate.title),
      publishedAt:
        publishedDate && /^\d{4}-\d{2}-\d{2}$/.test(publishedDate)
          ? `${publishedDate}T00:00:00Z`
          : publishedDate,
      durationSeconds,
    };
  } catch (error) {
    console.warn(
      `Skipping ${candidate.videoId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

async function main() {
  const talentPayload = JSON.parse(await readFile(talentsPath, "utf8"));
  const selectedTalents = talentPayload.talents.filter(
    (talent) => !cliMembers || cliMembers.includes(talent.id),
  );

  if (selectedTalents.length === 0) {
    throw new Error("No matching talents were selected.");
  }
  if (selectedTalents.length > MAX_SELECTED_TALENTS) {
    throw new Error(
      `Selected talent count exceeds the ${MAX_SELECTED_TALENTS}-talent safety limit.`,
    );
  }

  const channelGroups = new Map();
  selectedTalents.forEach((talent) => {
    const channelId = requiredYouTubeChannelId(talent.channelId);
    const memberId = requiredTalentId(talent.id);
    const existing = channelGroups.get(channelId) ?? {
      channelId,
      memberIds: [],
      branches: new Set(),
    };
    existing.memberIds.push(memberId);
    existing.branches.add(talent.branch);
    channelGroups.set(channelId, existing);
  });

  const searchTasks = [];
  channelGroups.forEach((group) => {
    const branch = Array.from(group.branches)[0];
    const queries = SEARCH_QUERIES[branch] ?? SEARCH_QUERIES.JP;
    queries.forEach((query) =>
      searchTasks.push({
        channelId: group.channelId,
        memberIds: group.memberIds,
        query,
      }),
    );
  });
  if (searchTasks.length > MAX_SEARCH_TASKS) {
    throw new Error(
      `Search task count exceeds the ${MAX_SEARCH_TASKS}-request safety limit.`,
    );
  }

  console.log(
    `Searching ${searchTasks.length} official-channel queries for ${selectedTalents.length} talents...`,
  );
  const searchResults = await mapWithConcurrency(
    searchTasks,
    SEARCH_CONCURRENCY,
    async (task) => {
      try {
        return await collectSearchPage(task);
      } catch (error) {
        console.warn(
          `Search failed for ${task.channelId} (${task.query}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return { candidates: [], clientConfig: null };
      }
    },
  );

  const clientConfig = searchResults.find(
    ({ clientConfig: config }) => config,
  )?.clientConfig;

  if (!clientConfig) {
    throw new Error("No YouTube client configuration could be collected.");
  }

  const candidatesById = new Map();
  searchResults
    .flatMap(({ candidates }) => candidates)
    .forEach((candidate) => {
      const existing = candidatesById.get(candidate.videoId);

      if (!existing) {
        if (candidatesById.size >= MAX_VIDEO_CANDIDATES) {
          throw new Error(
            `Candidate count exceeds the ${MAX_VIDEO_CANDIDATES}-video safety limit.`,
          );
        }
        candidatesById.set(candidate.videoId, candidate);
        return;
      }

      existing.memberIds = Array.from(
        new Set([...existing.memberIds, ...candidate.memberIds]),
      );
    });

  console.log(
    `Verifying ${candidatesById.size} matching videos against their official channels...`,
  );
  const enriched = await mapWithConcurrency(
    Array.from(candidatesById.values()),
    VIDEO_CONCURRENCY,
    (candidate) => enrichCandidate(candidate, clientConfig),
  );
  const lives = enriched
    .filter(Boolean)
    .sort((left, right) => {
      const dateComparison = String(right.publishedAt ?? "").localeCompare(
        String(left.publishedAt ?? ""),
      );
      return dateComparison || left.title.localeCompare(right.title);
    });
  const memberIdsWithLives = new Set(lives.flatMap(({ memberIds }) => memberIds));
  const payload = {
    checkedAt: new Date().toISOString(),
    collectorVersion: COLLECTOR_VERSION,
    sourceNote:
      "공식 hololive 탤런트 YouTube 채널 검색 결과에서 공개 상태의 생일·주년·3D·무료 솔로 음악 라이브만 선별했습니다.",
    sourceUrl: "https://www.youtube.com/",
    talentCount: selectedTalents.length,
    membersWithLives: memberIdsWithLives.size,
    missingMemberIds: selectedTalents
      .filter((talent) => !memberIdsWithLives.has(talent.id))
      .map((talent) => talent.id),
    lives,
  };

  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  await writeFileAtomically(
    outputPath,
    `${JSON.stringify(payload, null, 2)}\n`,
  );
  console.log(
    `Collected ${lives.length} YouTube live archives for ${memberIdsWithLives.size}/${selectedTalents.length} talents into ${outputPath}`,
  );
}

main().catch((error) => {
  console.error(
    `YouTube archive update failed. ${
      error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    }`,
  );
  process.exitCode = 1;
});
