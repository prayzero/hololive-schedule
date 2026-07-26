import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const publicDataDirectory = resolve(projectRoot, "public", "data");
const researchDirectory = resolve(projectRoot, "research");
const outputPath = resolve(publicDataDirectory, "youtube-lives.json");

const [
  talentPayload,
  previousPayload,
  metadataPayload,
  jpPayload,
  globalPayload,
  alumniPayload,
] = await Promise.all([
    readJson(resolve(publicDataDirectory, "talents.json")),
    readJson(outputPath).catch(() => ({ lives: [] })),
    readJson(resolve(researchDirectory, "youtube-metadata.json")).catch(() => ({
      videos: [],
    })),
    readJson(resolve(researchDirectory, "youtube-jp.json")),
    readJson(resolve(researchDirectory, "youtube-global.json")),
    readJson(resolve(researchDirectory, "youtube-alumni.json")),
  ]);

const talentsById = new Map(
  talentPayload.talents.map((talent) => [talent.id, talent]),
);
const previousByVideoId = new Map(
  (previousPayload.lives ?? []).map((live) => [live.videoId, live]),
);
const metadataByVideoId = new Map(
  (metadataPayload.videos ?? []).map((video) => [video.videoId, video]),
);
const groupedRecords = new Map();

for (const record of [
  ...jpPayload.records,
  ...globalPayload.records,
  ...alumniPayload.records,
]) {
  const talent = talentsById.get(record.memberId);

  if (!talent) {
    throw new Error(
      `Unknown talent id "${record.memberId}" for ${record.videoId}.`,
    );
  }

  const existing = groupedRecords.get(record.videoId);

  if (existing) {
    existing.memberIds.add(record.memberId);
    continue;
  }

  groupedRecords.set(record.videoId, {
    ...record,
    channelId: talent.channelId,
    memberIds: new Set([record.memberId]),
  });
}

const lives = Array.from(groupedRecords.values())
  .map((record) => {
    const previous = previousByVideoId.get(record.videoId);
    const metadata = metadataByVideoId.get(record.videoId);

    return {
      id: record.videoId,
      videoId: record.videoId,
      memberIds: Array.from(record.memberIds),
      channelId: record.channelId,
      title: record.title,
      category: record.category,
      publishedLabel: null,
      publishedAt:
        record.publishedAt ??
        metadata?.publishedAt ??
        previous?.publishedAt ??
        null,
      durationSeconds:
        metadata?.durationSeconds ?? previous?.durationSeconds ?? null,
      videoUrl:
        record.sourceUrl ??
        `https://www.youtube.com/watch?v=${record.videoId}`,
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
  talentCount: talentPayload.talents.length,
  membersWithLives: memberIdsWithLives.size,
  missingMemberIds: talentPayload.talents
    .filter((talent) => !memberIdsWithLives.has(talent.id))
    .map((talent) => talent.id),
  lives,
};

await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(
  `Compiled ${lives.length} official YouTube live archives for ${memberIdsWithLives.size}/${talentPayload.talents.length} talents.`,
);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
