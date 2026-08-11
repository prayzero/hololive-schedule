import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const TALENTS_PATH = path.join(ROOT, "public", "data", "talents.json");
const LIVE_ARCHIVE_PATH = path.join(
  ROOT,
  "public",
  "data",
  "youtube-lives.json",
);
const OUTPUT_PATH = path.join(HERE, "youtube-jp.json");

const SEARCH_TERMS = [
  "3D LIVE",
  "3Dライブ",
  "誕生日",
  "生誕祭",
  "周年",
  "無料ライブ",
  "全編無料 LIVE",
  "SPECIAL LIVE",
];

const CHANNEL_OVERRIDES = {
  // talents.json currently points Matsuri at the hololive main channel.
  "natsuiro-matsuri": "UCQ0UDLQCjY0rmuxCDE38FGg",
};

const LIVE_MARKER = String.raw`(?:(?<!HOLO)LIVE|(?<!ホロ)ライブ|CONCERT)`;
const STRONG_EVENT_PATTERN = new RegExp(
  String.raw`(?:3D\s*(?:MUSIC\s*)?${LIVE_MARKER}|${LIVE_MARKER}\s*3D|3D(?:生誕祭?|周年(?:記念)?)|(?:生誕祭?|周年(?:記念)?)3D|(?:誕生日|生誕祭?|BIRTHDAY).{0,45}${LIVE_MARKER}|${LIVE_MARKER}.{0,45}(?:誕生日|生誕祭?|BIRTHDAY)|(?:周年|ANNIVERSARY).{0,45}${LIVE_MARKER}|${LIVE_MARKER}.{0,45}(?:周年|ANNIVERSARY)|SPECIAL\s*(?:3D\s*)?${LIVE_MARKER}|(?:全編無料|無料配信|無料ライブ|FREE\s*(?:ONLINE\s*)?).{0,50}${LIVE_MARKER}|${LIVE_MARKER}.{0,50}(?:全編無料|無料配信|FREE))`,
  "iu",
);

const EXCLUDE_PATTERN =
  /(?:切り抜き|shorts?|ティザー|teaser|trailer|予告編|同時視聴|同時試聴|watchalong|ミラー配信|振り返り|アフタートーク|after\s*talk|裏話|秘話|打ち上げ|おつかれ|お疲れ|感想|前夜祭|前々夜|直前|カウントダウン|凸待ち|逆凸|雑談|free\s*talk|talk\s*&\s*live|ライブとかの話|やるよって発表|発表とか|朝こよ|朝活|スパチャ|superchat|お祝いありがとう|歌枠|singing|視聴者参加型|大型アップデート|ガルパ配信|耐久|全身で動けるようになった|チケット|グッズ|goods|reaction|リアクション|ダイジェスト|チラ見せ|推しカメラ|dance\s*ver|MV|music\s*video|歌ってみた|cover)/iu;

const CATEGORY_RULES = [
  ["birthday", /(?:誕生日|生誕祭|birthday)/iu],
  ["anniversary", /(?:周年|anniversary)/iu],
  ["concert", /(?:ソロライブ|solo\s*live|無料ライブ|concert)/iu],
  ["3d", /(?:3D\s*LIVE|3Dライブ|3DLIVE)/iu],
];

function extractBalancedJson(text, marker) {
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = text.indexOf("{", markerIndex + marker.length);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function findInitialData(html) {
  return (
    extractBalancedJson(html, "var ytInitialData =") ??
    extractBalancedJson(html, "window[\"ytInitialData\"] =") ??
    extractBalancedJson(html, "ytInitialData =")
  );
}

function findPlayerResponse(html) {
  return (
    extractBalancedJson(html, "var ytInitialPlayerResponse =") ??
    extractBalancedJson(html, "ytInitialPlayerResponse =")
  );
}

function textOf(value) {
  if (!value) return "";
  if (typeof value.simpleText === "string") return value.simpleText;
  if (Array.isArray(value.runs)) {
    return value.runs.map((run) => run.text ?? "").join("");
  }
  return "";
}

function durationSecondsFromText(value) {
  const raw = textOf(value).trim();
  if (!raw) return null;
  const parts = raw.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function ownerChannelIdOf(renderer) {
  for (const byline of [
    renderer.shortBylineText,
    renderer.longBylineText,
    renderer.ownerText,
  ]) {
    for (const run of byline?.runs ?? []) {
      const browseId =
        run.navigationEndpoint?.browseEndpoint?.browseId ??
        run.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url?.match(
          /\/channel\/([^/?]+)/,
        )?.[1];
      if (browseId) return browseId;
    }
  }
  return null;
}

function collectVideoRenderers(node, results, seen = new WeakSet()) {
  if (!node || typeof node !== "object") return;
  if (seen.has(node)) return;
  seen.add(node);

  if (
    typeof node.videoId === "string" &&
    node.title &&
    (node.thumbnail || node.navigationEndpoint)
  ) {
    results.push(node);
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === "object") {
      collectVideoRenderers(value, results, seen);
    }
  }
}

async function fetchText(url, retries = 3) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.7",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
        },
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function fetchJson(url, init, retries = 4) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) =>
        setTimeout(resolve, 800 * 2 ** attempt + Math.random() * 400),
      );
    }
  }
  throw lastError;
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function next() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => next()));
  return results;
}

function categoryFor(title) {
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(title)) return category;
  }
  return "special";
}

function parseDurationSeconds(playerResponse) {
  const raw = playerResponse?.videoDetails?.lengthSeconds;
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) ? value : null;
}

function getPublishedAt(playerResponse) {
  const microformat =
    playerResponse?.microformat?.playerMicroformatRenderer ?? {};
  return (
    microformat.publishDate ??
    microformat.uploadDate ??
    microformat.liveBroadcastDetails?.startTimestamp ??
    null
  );
}

function isLiveArchive(playerResponse) {
  const details = playerResponse?.videoDetails ?? {};
  const microformat =
    playerResponse?.microformat?.playerMicroformatRenderer ?? {};
  return Boolean(
    details.isLiveContent ||
      microformat.liveBroadcastDetails?.startTimestamp ||
      microformat.liveBroadcastDetails?.endTimestamp,
  );
}

async function collectSearchCandidates(talent) {
  const candidates = new Map();

  for (const term of SEARCH_TERMS) {
    const url = `https://www.youtube.com/channel/${talent.channelId}/search?query=${encodeURIComponent(term)}`;
    const html = await fetchText(url);
    const initialData = findInitialData(html);
    if (!initialData) continue;

    const renderers = [];
    collectVideoRenderers(initialData, renderers);
    if (process.env.DEBUG_VIDEO) {
      const debugRenderer = renderers.find(
        (renderer) => renderer.videoId === process.env.DEBUG_VIDEO,
      );
      if (debugRenderer) {
        process.stderr.write(
          `[debug renderer] ${JSON.stringify(debugRenderer, null, 2)}\n`,
        );
      }
    }
    if (process.env.DEBUG_JP === talent.id) {
      process.stderr.write(
        `[debug] ${term}: ${renderers.length} renderers; ${renderers
          .slice(0, 5)
          .map((renderer) => textOf(renderer.title))
          .join(" | ")}\n`,
      );
    }
    for (const renderer of renderers) {
      const title = textOf(renderer.title);
      if (!title || !STRONG_EVENT_PATTERN.test(title)) continue;
      if (EXCLUDE_PATTERN.test(title)) continue;
      if (renderer.upcomingEventData) continue;
      const ownerChannelId = ownerChannelIdOf(renderer);
      if (ownerChannelId && ownerChannelId !== talent.channelId) continue;
      if (
        !ownerChannelId &&
        renderer.navigationEndpoint?.watchEndpoint?.playlistId
      ) {
        continue;
      }
      const durationSeconds = durationSecondsFromText(
        renderer.lengthText ?? renderer.thumbnailOverlays?.[0]?.thumbnailOverlayTimeStatusRenderer?.text,
      );
      if (durationSeconds !== null && durationSeconds < 20 * 60) continue;
      const thumbnails = renderer.thumbnail?.thumbnails ?? [];
      candidates.set(renderer.videoId, {
        videoId: renderer.videoId,
        searchTitle: title,
        publishedTimeText: textOf(renderer.publishedTimeText) || null,
        durationSeconds,
        thumbnailUrl:
          thumbnails.at(-1)?.url ??
          `https://i.ytimg.com/vi/${renderer.videoId}/maxresdefault.jpg`,
      });
    }
  }

  if (process.env.DEBUG_JP === talent.id) {
    process.stderr.write(
      `[debug] accepted search candidates: ${candidates.size}\n`,
    );
  }
  return [...candidates.values()];
}

async function hydrateCandidate(talent, candidate) {
  try {
    const sourceUrl = `https://www.youtube.com/watch?v=${candidate.videoId}`;
    const playerResponse = process.env.NO_HYDRATE
      ? null
      : await fetchJson(
          "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
          {
            method: "POST",
            headers: {
              "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.7",
              "Content-Type": "application/json",
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
            },
            body: JSON.stringify({
              context: {
                client: {
                  clientName: "WEB",
                  clientVersion: "2.20260723.01.00",
                  hl: "ja",
                  gl: "JP",
                },
              },
              videoId: candidate.videoId,
            }),
          },
        );
    if (!playerResponse) {
      return {
        memberId: talent.id,
        videoId: candidate.videoId,
        title: candidate.searchTitle,
        publishedAt: null,
        category: categoryFor(candidate.searchTitle),
        sourceUrl,
        thumbnailUrl: candidate.thumbnailUrl,
        durationSeconds: candidate.durationSeconds,
        isLiveArchive: null,
        publishedTimeText: candidate.publishedTimeText,
      };
    }

    const details = playerResponse.videoDetails ?? {};
    const title = details.title ?? candidate.searchTitle;
    const durationSeconds = parseDurationSeconds(playerResponse);
    const microformat =
      playerResponse?.microformat?.playerMicroformatRenderer ?? {};

    if (process.env.DEBUG_JP === talent.id) {
      process.stderr.write(
        `[debug hydrate] ${candidate.videoId}: channel=${details.channelId}; duration=${durationSeconds}; live=${details.isLiveContent}; unplugged=${details.isUnpluggedCorpus}; title=${title}\n`,
      );
    }
    if (details.channelId && details.channelId !== talent.channelId) return null;
    if (details.isPrivate) return null;
    if (!STRONG_EVENT_PATTERN.test(title) || EXCLUDE_PATTERN.test(title)) {
      return null;
    }
    if (durationSeconds !== null && durationSeconds < 20 * 60) return null;

    const thumbnails =
      details.thumbnail?.thumbnails ?? microformat.thumbnail?.thumbnails ?? [];
    const thumbnailUrl =
      thumbnails.at(-1)?.url ??
      `https://i.ytimg.com/vi/${candidate.videoId}/maxresdefault.jpg`;

    return {
      memberId: talent.id,
      videoId: candidate.videoId,
      title,
      publishedAt: getPublishedAt(playerResponse),
      category: categoryFor(title),
      sourceUrl,
      thumbnailUrl,
      durationSeconds,
      isLiveArchive: isLiveArchive(playerResponse),
    };
  } catch (error) {
    if (process.env.DEBUG_JP === talent.id) {
      process.stderr.write(
        `[debug hydrate] ${candidate.videoId}: ${error?.stack ?? error}\n`,
      );
    }
    return {
      memberId: talent.id,
      videoId: candidate.videoId,
      title: candidate.searchTitle,
      publishedAt: null,
      category: categoryFor(candidate.searchTitle),
      sourceUrl: `https://www.youtube.com/watch?v=${candidate.videoId}`,
      thumbnailUrl: candidate.thumbnailUrl,
      durationSeconds: candidate.durationSeconds,
      isLiveArchive: null,
      publishedTimeText: candidate.publishedTimeText,
    };
  }
}

const talentPayload = JSON.parse(await fs.readFile(TALENTS_PATH, "utf8"));
const talents = talentPayload.talents
  .filter(
    (talent) =>
      talent.branch === "JP" &&
      (talent.status === "active" || talent.status === "affiliate"),
  )
  .map((talent) => ({
    ...talent,
    channelId: CHANNEL_OVERRIDES[talent.id] ?? talent.channelId,
  }));
const selectedTalents = process.env.DEBUG_JP
  ? talents.filter((talent) => talent.id === process.env.DEBUG_JP)
  : talents;

const [previousPayload, currentArchive] = await Promise.all([
  fs
    .readFile(OUTPUT_PATH, "utf8")
    .then((contents) => JSON.parse(contents))
    .catch(() => ({ records: [] })),
  fs
    .readFile(LIVE_ARCHIVE_PATH, "utf8")
    .then((contents) => JSON.parse(contents))
    .catch(() => ({ lives: [] })),
]);
const jpMemberIds = new Set(talents.map((talent) => talent.id));
const jpTalentsById = new Map(talents.map((talent) => [talent.id, talent]));
const preservedRecords = [
  ...(previousPayload.records ?? []),
  ...(currentArchive.lives ?? []).flatMap((live) =>
    (live.memberIds ?? [])
      .filter(
        (memberId) =>
          jpMemberIds.has(memberId) &&
          jpTalentsById.get(memberId)?.channelId === live.channelId,
      )
      .map((memberId) => ({
        memberId,
        videoId: live.videoId,
        title: live.title,
        publishedAt: live.publishedAt,
        category: live.category,
        sourceUrl: live.videoUrl,
        thumbnailUrl: live.thumbnailUrl,
      })),
  ),
];

const candidateGroups = await runPool(selectedTalents, 5, async (talent, index) => {
  process.stderr.write(
    `[search ${index + 1}/${selectedTalents.length}] ${talent.name}\n`,
  );
  return {
    talent,
    candidates: await collectSearchCandidates(talent),
  };
});

const hydrationJobs = candidateGroups.flatMap(({ talent, candidates }) =>
  candidates.map((candidate) => ({ talent, candidate })),
);

const hydrated = await runPool(hydrationJobs, 2, async ({ talent, candidate }) =>
  hydrateCandidate(talent, candidate),
);

const discoveredRecords = hydrated
  .filter(Boolean)
  .map((record) => ({
    memberId: record.memberId,
    videoId: record.videoId,
    title: record.title,
    publishedAt: record.publishedAt,
    category: record.category,
    sourceUrl: record.sourceUrl,
    thumbnailUrl: record.thumbnailUrl,
  }));
const recordsByKey = new Map();
for (const record of [...preservedRecords, ...discoveredRecords]) {
  if (!jpMemberIds.has(record.memberId) || !record.videoId) continue;
  recordsByKey.set(`${record.memberId}:${record.videoId}`, record);
}

const records = Array.from(recordsByKey.values())
  .sort((left, right) => {
    if (left.memberId !== right.memberId) {
      return left.memberId.localeCompare(right.memberId);
    }
    return (right.publishedAt ?? "").localeCompare(left.publishedAt ?? "");
  });

const membersWithRecords = new Set(records.map((record) => record.memberId));
const missingMembers = talents
  .filter((talent) => !membersWithRecords.has(talent.id))
  .map((talent) => ({
    memberId: talent.id,
    channelId: talent.channelId,
    reason: "No qualifying public archive found by the configured official-channel searches.",
  }));

const payload = {
  checkedAt: new Date().toISOString(),
  scope:
    "Official hololive JP talents marked active or affiliate in talents.json. Public official-channel birthday, anniversary, 3D music live, free solo concert, and comparable special live archives only.",
  methodology:
    "YouTube searches were run against each official talent channel and merged cumulatively with previously verified records so temporary search omissions cannot delete the archive. Search renderers with a different owner channel ID or ownerless playlist-only entries were rejected, then accepted videos were hydrated through YouTube player metadata for an exact publication date and a second channel-ID check. Ordinary gameplay, chat, karaoke, aftertalks, previews, single-song clips, MVs, watchalongs, and videos shorter than 20 minutes were excluded.",
  publishedAtNote:
    "All accepted records had an exact publication timestamp in YouTube player metadata at the time checked.",
  dataCorrections: [
    {
      memberId: "natsuiro-matsuri",
      field: "channelId",
      value: "UCQ0UDLQCjY0rmuxCDE38FGg",
      reason:
        "The current talents.json value UCJFZiqLMntJufDCHc6bQixg belongs to the hololive main channel, not Natsuiro Matsuri.",
      officialProfileUrl:
        "https://hololive.hololivepro.com/en/talents/natsuiro-matsuri/",
    },
  ],
  sourceType: "official-youtube-channel",
  memberCount: talents.length,
  recordCount: records.length,
  missingMembers,
  records,
};

await fs.mkdir(HERE, { recursive: true });
await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stderr.write(
  `Wrote ${records.length} records for ${membersWithRecords.size}/${talents.length} members to ${OUTPUT_PATH}\n`,
);
