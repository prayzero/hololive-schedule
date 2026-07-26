import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const YOUTUBE_ROOT = "https://www.youtube.com";
const REQUEST_TIMEOUT_MS = 20_000;
const SEARCH_CONCURRENCY = 4;
const VIDEO_CONCURRENCY = 6;
const MINIMUM_DURATION_SECONDS = 20 * 60;
const COLLECTOR_VERSION = "1.0.0";

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

  if (!apiKey || !clientVersion) {
    throw new Error("YouTube client configuration was not found.");
  }

  return { apiKey, clientVersion };
}

function collectVideoRenderers(value, results = []) {
  if (!value || typeof value !== "object") {
    return results;
  }

  if (value.videoRenderer) {
    results.push(value.videoRenderer);
  }

  Object.values(value).forEach((child) =>
    collectVideoRenderers(child, results),
  );
  return results;
}

function candidateFromRenderer(renderer, memberIds, channelId) {
  const title = textFromRuns(renderer.title);
  const durationText = textFromRuns(renderer.lengthText);
  const durationSeconds = parseDuration(durationText);

  if (
    !renderer.videoId ||
    !title ||
    !durationSeconds ||
    !titleQualifies(title, durationSeconds)
  ) {
    return null;
  }

  return {
    id: renderer.videoId,
    videoId: renderer.videoId,
    memberIds,
    channelId,
    title,
    category: classifyTitle(title),
    publishedLabel: textFromRuns(renderer.publishedTimeText) || null,
    publishedAt: null,
    durationSeconds,
    videoUrl: `${YOUTUBE_ROOT}/watch?v=${renderer.videoId}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${renderer.videoId}/hqdefault.jpg`,
  };
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Accept-Language": "en-US,en;q=0.9,ja;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
        ...(options.headers ?? {}),
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url, options = {}) {
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
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return await response.json();
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
  const url = `${YOUTUBE_ROOT}/channel/${task.channelId}/search?query=${encodeURIComponent(task.query)}`;
  const html = await fetchText(url);
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
    const player = await fetchJson(
      `${YOUTUBE_ROOT}/youtubei/v1/player?key=${encodeURIComponent(clientConfig.apiKey)}`,
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
          videoId: candidate.videoId,
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

async function writeAtomically(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;

  try {
    await writeFile(temporaryPath, contents, "utf8");
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
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

  const channelGroups = new Map();
  selectedTalents.forEach((talent) => {
    const existing = channelGroups.get(talent.channelId) ?? {
      channelId: talent.channelId,
      memberIds: [],
      branches: new Set(),
    };
    existing.memberIds.push(talent.id);
    existing.branches.add(talent.branch);
    channelGroups.set(talent.channelId, existing);
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
      "공식 여성 탤런트 YouTube 채널 검색 결과에서 공개 상태의 생일·주년·3D·무료 솔로 음악 라이브만 선별했습니다.",
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

  await writeAtomically(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
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
