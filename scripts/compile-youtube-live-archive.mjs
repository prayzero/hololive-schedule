import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readJsonFileStrict,
  writeFileAtomically,
} from "./lib/secure-io.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const publicDataDirectory = resolve(projectRoot, "public", "data");
const researchDirectory = resolve(projectRoot, "research");
const outputPath = resolve(publicDataDirectory, "youtube-lives.json");
const MAXIMUM_RECORDS = 20_000;
const YOUTUBE_LIVE_CATEGORIES = new Set([
  "birthday",
  "anniversary",
  "3d",
  "concert",
  "special",
]);

const [
  talentPayload,
  previousPayload,
  metadataPayload,
  jpPayload,
  globalPayload,
  alumniPayload,
] = await Promise.all([
    readJsonFileStrict(resolve(publicDataDirectory, "talents.json")),
    readJsonFileStrict(outputPath, {
      allowMissing: true,
      missingValue: { lives: [] },
      label: "existing public YouTube live archive",
    }),
    readJsonFileStrict(resolve(researchDirectory, "youtube-metadata.json"), {
      allowMissing: true,
      missingValue: { videos: [] },
      label: "YouTube metadata cache",
    }),
    readJsonFileStrict(resolve(researchDirectory, "youtube-jp.json")),
    readJsonFileStrict(resolve(researchDirectory, "youtube-global.json")),
    readJsonFileStrict(resolve(researchDirectory, "youtube-alumni.json")),
  ]);

if (!Array.isArray(talentPayload.talents) || talentPayload.talents.length > 500) {
  throw new Error("Talent data has an invalid talents array.");
}
const talents = talentPayload.talents.map((talent) => ({
  ...talent,
  id: requiredTalentId(talent.id),
  channelId: requiredYouTubeChannelId(talent.channelId),
}));
for (const [label, values] of [
  ["previous live", previousPayload.lives],
  ["metadata", metadataPayload.videos],
  ["JP research", jpPayload.records],
  ["global research", globalPayload.records],
  ["alumni research", alumniPayload.records],
]) {
  if (!Array.isArray(values) || values.length > MAXIMUM_RECORDS) {
    throw new Error(`${label} data exceeds the record safety limit.`);
  }
}

const talentsById = new Map(talents.map((talent) => [talent.id, talent]));
const previousByVideoId = new Map(
  previousPayload.lives.map((live) => [requiredYouTubeVideoId(live.videoId), live]),
);
const metadataByVideoId = new Map(
  metadataPayload.videos.map((video) => [requiredYouTubeVideoId(video.videoId), video]),
);
const groupedRecords = new Map();

for (const record of [
  ...jpPayload.records,
  ...globalPayload.records,
  ...alumniPayload.records,
]) {
  const memberId = requiredTalentId(record.memberId);
  const videoId = requiredYouTubeVideoId(record.videoId);
  const title = requiredVideoTitle(record.title);
  const category = requiredCategory(record.category);
  const talent = talentsById.get(memberId);

  if (!talent) {
    throw new Error(
      `Unknown talent id "${memberId}" for ${videoId}.`,
    );
  }

  const existing = groupedRecords.get(videoId);

  if (existing) {
    if (existing.title !== title || existing.category !== category) {
      throw new Error(`Conflicting research metadata for ${videoId}.`);
    }
    existing.memberIds.add(memberId);
    continue;
  }

  groupedRecords.set(videoId, {
    videoId,
    title,
    category,
    publishedAt: record.publishedAt ?? null,
    channelId: talent.channelId,
    memberIds: new Set([memberId]),
  });
  if (groupedRecords.size > MAXIMUM_RECORDS) {
    throw new Error(
      `Compiled archive exceeds the ${MAXIMUM_RECORDS}-video safety limit.`,
    );
  }
}

const lives = Array.from(groupedRecords.values())
  .map((record) => {
    const previous = previousByVideoId.get(record.videoId);
    const metadata = metadataByVideoId.get(record.videoId);
    const publishedAt = requiredPublishedAt(
      record.publishedAt,
      metadata?.publishedAt,
      previous?.publishedAt,
    );
    const durationSeconds = requiredDurationSeconds(
      metadata?.durationSeconds,
      previous?.durationSeconds,
    );

    return {
      id: record.videoId,
      videoId: record.videoId,
      memberIds: Array.from(record.memberIds),
      channelId: record.channelId,
      title: record.title,
      category: record.category,
      publishedLabel: null,
      publishedAt,
      durationSeconds,
      videoUrl: `https://www.youtube.com/watch?v=${record.videoId}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${record.videoId}/hqdefault.jpg`,
    };
  })
  .sort(
    (left, right) =>
      String(right.publishedAt).localeCompare(String(left.publishedAt)) ||
      left.title.localeCompare(right.title),
  );

const memberIdsWithLives = new Set(lives.flatMap((live) => live.memberIds));
const payload = {
  checkedAt: new Date().toISOString(),
  collectorVersion: "curated-official-channel-1.0.0",
  sourceNote:
    "공식 hololive 탤런트 YouTube 채널에서 공개된 생일·주년·3D 음악 라이브와 무료 콘서트 기록입니다. 일반 노래방·게임·잡담·후일담·미리보기·Shorts·단일 곡 영상은 제외했습니다.",
  sourceUrl: "https://www.youtube.com/",
  talentCount: talents.length,
  membersWithLives: memberIdsWithLives.size,
  missingMemberIds: talents
    .filter((talent) => !memberIdsWithLives.has(talent.id))
    .map((talent) => talent.id),
  lives,
};

await writeFileAtomically(
  outputPath,
  `${JSON.stringify(payload, null, 2)}\n`,
);
console.log(
  `Compiled ${lives.length} official YouTube live archives for ${memberIdsWithLives.size}/${talents.length} talents.`,
);

function requiredTalentId(value) {
  const talentId = String(value ?? "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(talentId) || talentId.length > 80) {
    throw new Error(`Invalid talent id: ${talentId}`);
  }
  return talentId;
}

function requiredYouTubeChannelId(value) {
  const channelId = String(value ?? "");
  if (!/^UC[A-Za-z0-9_-]{22}$/.test(channelId)) {
    throw new Error(`Invalid YouTube channel id: ${channelId}`);
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

function requiredVideoTitle(value) {
  const title = String(value ?? "").trim();
  if (!title || title.length > 500) {
    throw new Error("YouTube live title is missing or too long.");
  }
  return title;
}

function requiredCategory(value) {
  const category = String(value ?? "");
  if (!YOUTUBE_LIVE_CATEGORIES.has(category)) {
    throw new Error(`Invalid YouTube live category: ${category}`);
  }
  return category;
}

function requiredPublishedAt(...values) {
  const publishedAt = values.find(
    (value) =>
      typeof value === "string" &&
      Number.isFinite(Date.parse(value)) &&
      Date.parse(value) <= Date.now() + 24 * 60 * 60 * 1_000,
  );
  if (!publishedAt) {
    throw new Error("YouTube live is missing a valid publication time.");
  }
  return publishedAt;
}

function requiredDurationSeconds(...values) {
  const durationSeconds = values.find(
    (value) =>
      Number.isSafeInteger(value) &&
      value >= 20 * 60 &&
      value <= 7 * 24 * 60 * 60,
  );
  if (durationSeconds === undefined) {
    throw new Error("YouTube live is missing a valid duration.");
  }
  return durationSeconds;
}
