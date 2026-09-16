const MAX_TEXT_LENGTH = 16_384;
const MAX_ID_LENGTH = 512;
const MAX_URL_LENGTH = 4_096;
const MAX_ARRAY_LENGTH = 25_000;
const MAX_COUNT = 10_000_000;

type UnknownRecord = Record<string, unknown>;
type Validator = (value: unknown) => boolean;

const TALENT_BRANCHES = new Set(["JP", "EN", "ID", "DEV_IS"]);
const TALENT_STATUSES = new Set(["active", "affiliate", "alumni"]);
const EVENT_CATEGORIES = new Set([
  "concert",
  "solo",
  "collaboration",
  "festival",
  "exhibition",
]);
const EVENT_REGIONS = new Set(["JP", "KR", "US", "TW", "CN", "GLOBAL"]);
const EVENT_COUNTRY_REGIONS = new Set(["JP", "KR", "US", "TW", "CN"]);
const YOUTUBE_CATEGORIES = new Set([
  "birthday",
  "anniversary",
  "3d",
  "concert",
  "special",
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(
  value: unknown,
  maxLength = MAX_TEXT_LENGTH,
  allowEmpty = false,
): value is string {
  return (
    typeof value === "string" &&
    value.length <= maxLength &&
    (allowEmpty || value.length > 0)
  );
}

function isNullableText(value: unknown, maxLength = MAX_TEXT_LENGTH): boolean {
  return value === null || isText(value, maxLength, true);
}

function isDateText(value: unknown): value is string {
  return (
    isText(value, 128) && Number.isFinite(Date.parse(value))
  );
}

function isNullableDateText(value: unknown): boolean {
  return value === null || isDateText(value);
}

function isFiniteNumber(
  value: unknown,
  minimum = -MAX_COUNT,
  maximum = MAX_COUNT,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function isCount(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= MAX_COUNT
  );
}

function isRate(value: unknown): value is number {
  return isFiniteNumber(value, 0, 100);
}

function isOneOf(value: unknown, choices: ReadonlySet<string>): value is string {
  return typeof value === "string" && choices.has(value);
}

function isArrayOf(
  value: unknown,
  validator: Validator,
  maxLength = MAX_ARRAY_LENGTH,
): value is unknown[] {
  if (!Array.isArray(value) || value.length > maxLength) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!validator(value[index])) return false;
  }
  return true;
}

function isTextArray(
  value: unknown,
  maxLength = MAX_ARRAY_LENGTH,
  itemMaxLength = MAX_TEXT_LENGTH,
): value is string[] {
  return isArrayOf(value, (item) => isText(item, itemMaxLength), maxLength);
}

function isOptional(
  record: UnknownRecord,
  key: string,
  validator: Validator,
): boolean {
  return record[key] === undefined || validator(record[key]);
}

function isNullableFiniteNumber(
  value: unknown,
  minimum = -MAX_COUNT,
  maximum = MAX_COUNT,
): boolean {
  return value === null || isFiniteNumber(value, minimum, maximum);
}

function validateScheduleEntry(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isText(value.id, MAX_ID_LENGTH) &&
    isNullableDateText(value.date) &&
    isNullableText(value.dateLabel, 256) &&
    isNullableText(value.time, 256) &&
    isNullableDateText(value.startsAt) &&
    isText(value.name, 1_024) &&
    isNullableText(value.title) &&
    isText(value.url, MAX_URL_LENGTH) &&
    isText(value.videoId, MAX_ID_LENGTH) &&
    isNullableText(value.thumbnail, MAX_URL_LENGTH) &&
    isNullableText(value.avatar, MAX_URL_LENGTH) &&
    typeof value.isLive === "boolean" &&
    isOptional(value, "branch", (branch) => isOneOf(branch, TALENT_BRANCHES))
  );
}

function validateSchedule(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isDateText(value.generatedAt) &&
    isFiniteNumber(value.sourceRefreshMinutes, 0, 10_080) &&
    isText(value.collectorVersion, 256) &&
    isText(value.timezone, 128) &&
    isArrayOf(value.entries, validateScheduleEntry) &&
    isOptional(value, "source", (source) => isText(source, MAX_URL_LENGTH)) &&
    isOptional(value, "sources", (sources) =>
      isTextArray(sources, 100, MAX_URL_LENGTH),
    )
  );
}

function validateScheduleIndexDate(value: unknown): boolean {
  return (
    isRecord(value) &&
    isDateText(value.date) &&
    isText(value.month, 32) &&
    isCount(value.count)
  );
}

function validateScheduleIndexMonth(value: unknown): boolean {
  return (
    isRecord(value) &&
    isText(value.month, 32) &&
    isCount(value.count) &&
    isDateText(value.firstDate) &&
    isDateText(value.lastDate) &&
    isText(value.url, MAX_URL_LENGTH)
  );
}

function validateScheduleIndex(value: unknown): boolean {
  return (
    isRecord(value) &&
    isDateText(value.updatedAt) &&
    isText(value.timezone, 128) &&
    isCount(value.totalEntries) &&
    isArrayOf(value.dates, validateScheduleIndexDate) &&
    isArrayOf(value.months, validateScheduleIndexMonth, 1_000)
  );
}

function validateEvent(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isText(value.id, MAX_ID_LENGTH) &&
    isText(value.title) &&
    isText(value.titleKo) &&
    isArrayOf(value.categories, (item) => isOneOf(item, EVENT_CATEGORIES), 20) &&
    isOneOf(value.region, EVENT_REGIONS) &&
    isText(value.city, 2_048) &&
    isText(value.venue, 2_048) &&
    isDateText(value.startsAt) &&
    isDateText(value.endsAt) &&
    isText(value.dateLabel, 512) &&
    isText(value.timeLabel, 2_048) &&
    isText(value.format, 2_048) &&
    isTextArray(value.participants, 1_000, 1_024) &&
    isText(value.description) &&
    isText(value.imageUrl, MAX_URL_LENGTH) &&
    isText(value.sourceUrl, MAX_URL_LENGTH) &&
    isOptional(value, "supportedRegions", (regions) =>
      isArrayOf(regions, (item) => isOneOf(item, EVENT_COUNTRY_REGIONS), 20),
    ) &&
    isOptional(value, "participantIds", (ids) =>
      isTextArray(ids, 1_000, MAX_ID_LENGTH),
    ) &&
    isOptional(value, "officialUrl", (url) => isText(url, MAX_URL_LENGTH)) &&
    isOptional(value, "note", (note) => isText(note))
  );
}

function validateEvents(value: unknown): boolean {
  return (
    isRecord(value) &&
    isDateText(value.checkedAt) &&
    isText(value.sourceNote) &&
    isArrayOf(value.events, validateEvent, 5_000)
  );
}

function validateTalent(value: unknown): boolean {
  return (
    isRecord(value) &&
    isText(value.id, MAX_ID_LENGTH) &&
    isText(value.name, 1_024) &&
    isText(value.nameKo, 1_024) &&
    isText(value.nativeName, 1_024) &&
    isOneOf(value.branch, TALENT_BRANCHES) &&
    isText(value.generation, 1_024) &&
    isText(value.channelId, MAX_ID_LENGTH) &&
    isTextArray(value.aliases, 1_000, 1_024) &&
    isText(value.portraitUrl, MAX_URL_LENGTH) &&
    isText(value.officialProfileUrl, MAX_URL_LENGTH) &&
    isOneOf(value.status, TALENT_STATUSES) &&
    isText(value.accent, 128)
  );
}

function validateTalents(value: unknown): boolean {
  return (
    isRecord(value) &&
    isDateText(value.checkedAt) &&
    isText(value.sourceUrl, MAX_URL_LENGTH) &&
    isText(value.sourceNote) &&
    isArrayOf(value.talents, validateTalent, 5_000)
  );
}

function validateSoloLive(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isText(value.id, MAX_ID_LENGTH) &&
    isText(value.memberId, MAX_ID_LENGTH) &&
    isText(value.title) &&
    isText(value.titleKo) &&
    isDateText(value.startsAt) &&
    isDateText(value.endsAt) &&
    isText(value.dateLabel, 512) &&
    isText(value.city, 2_048) &&
    isText(value.venue, 2_048) &&
    isText(value.format, 2_048) &&
    isText(value.imageUrl, MAX_URL_LENGTH) &&
    isText(value.sourceUrl, MAX_URL_LENGTH) &&
    isOptional(value, "relatedMemberIds", (ids) =>
      isTextArray(ids, 1_000, MAX_ID_LENGTH),
    ) &&
    isOptional(value, "officialUrl", (url) => isText(url, MAX_URL_LENGTH)) &&
    isOptional(value, "note", (note) => isText(note))
  );
}

function validateSolos(value: unknown): boolean {
  return (
    isRecord(value) &&
    isDateText(value.checkedAt) &&
    isText(value.sourceUrl, MAX_URL_LENGTH) &&
    isText(value.sourceNote) &&
    isArrayOf(value.lives, validateSoloLive, 5_000)
  );
}

function validateYouTubeLive(value: unknown): boolean {
  return (
    isRecord(value) &&
    isText(value.id, MAX_ID_LENGTH) &&
    isText(value.videoId, MAX_ID_LENGTH) &&
    isTextArray(value.memberIds, 1_000, MAX_ID_LENGTH) &&
    isText(value.channelId, MAX_ID_LENGTH) &&
    isText(value.title) &&
    isOneOf(value.category, YOUTUBE_CATEGORIES) &&
    isNullableText(value.publishedLabel, 512) &&
    isDateText(value.publishedAt) &&
    isNullableFiniteNumber(value.durationSeconds, 0, 315_576_000) &&
    isText(value.videoUrl, MAX_URL_LENGTH) &&
    isText(value.thumbnailUrl, MAX_URL_LENGTH)
  );
}

function validateYouTubeLives(value: unknown): boolean {
  return (
    isRecord(value) &&
    isDateText(value.checkedAt) &&
    isText(value.collectorVersion, 256) &&
    isText(value.sourceNote) &&
    isText(value.sourceUrl, MAX_URL_LENGTH) &&
    isCount(value.talentCount) &&
    isCount(value.membersWithLives) &&
    isTextArray(value.missingMemberIds, 5_000, MAX_ID_LENGTH) &&
    isArrayOf(value.lives, validateYouTubeLive)
  );
}

function validateDreamCharacter(value: unknown): boolean {
  return (
    isRecord(value) &&
    isText(value.id, MAX_ID_LENGTH) &&
    isText(value.talentId, MAX_ID_LENGTH) &&
    isText(value.name, 1_024) &&
    isText(value.nameKo, 1_024) &&
    isText(value.nativeName, 1_024) &&
    isOneOf(value.branch, TALENT_BRANCHES) &&
    isText(value.generation, 1_024) &&
    isText(value.imageUrl, MAX_URL_LENGTH) &&
    isText(value.accent, 128)
  );
}

function validateDreamPickupCard(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isText(value.id, MAX_ID_LENGTH) &&
    isText(value.talentId, MAX_ID_LENGTH) &&
    isText(value.cardTitle) &&
    (value.rarity === null || isFiniteNumber(value.rarity, 0, 100)) &&
    isText(value.imageUrl, MAX_URL_LENGTH) &&
    isText(value.imageAlt, 2_048) &&
    isOptional(value, "imagePosition", (position) => isText(position, 256)) &&
    isOptional(value, "imageScale", (scale) => isFiniteNumber(scale, 0.01, 100))
  );
}

function validateDreamPickupRate(value: unknown): boolean {
  return (
    isRecord(value) &&
    isText(value.label, 2_048) &&
    isRate(value.ratePercent)
  );
}

function validateDreamPickup(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isText(value.id, MAX_ID_LENGTH) &&
    isText(value.title) &&
    isText(value.subtitle) &&
    (value.targetRatePercent === null || isRate(value.targetRatePercent)) &&
    isText(value.rateLabel, 2_048, true) &&
    isArrayOf(value.rateBreakdown, validateDreamPickupRate, 1_000) &&
    isDateText(value.startsOn) &&
    isNullableDateText(value.endsOn) &&
    isDateText(value.announcedOn) &&
    isText(value.sourceLabel, 2_048) &&
    isText(value.sourceUrl, MAX_URL_LENGTH) &&
    isText(value.scheduleNote) &&
    isArrayOf(value.cards, validateDreamPickupCard, 2_000) &&
    isOptional(value, "startsAt", isDateText) &&
    isOptional(value, "endsAt", isNullableDateText) &&
    isOptional(value, "bannerImageUrl", (url) => isText(url, MAX_URL_LENGTH)) &&
    isOptional(value, "participantTalentIds", (ids) =>
      isTextArray(ids, 1_000, MAX_ID_LENGTH),
    )
  );
}

function validateDreamEventChapter(value: unknown): boolean {
  return (
    isRecord(value) &&
    isText(value.talentId, MAX_ID_LENGTH) &&
    isText(value.songTitle) &&
    isDateText(value.startsAt) &&
    isNullableDateText(value.endsAt) &&
    isText(value.imageUrl, MAX_URL_LENGTH)
  );
}

function validateDreamEvent(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isText(value.id, MAX_ID_LENGTH) &&
    isText(value.title) &&
    isText(value.nativeTitle) &&
    isText(value.subtitle) &&
    isDateText(value.startsAt) &&
    isNullableDateText(value.endsAt) &&
    isText(value.sourceLabel, 2_048) &&
    isText(value.sourceUrl, MAX_URL_LENGTH) &&
    isText(value.scheduleSourceUrl, MAX_URL_LENGTH) &&
    isText(value.songsSourceUrl, MAX_URL_LENGTH) &&
    isArrayOf(value.chapters, validateDreamEventChapter, 2_000) &&
    isOptional(value, "imageUrl", (url) => isText(url, MAX_URL_LENGTH)) &&
    isOptional(value, "participantTalentIds", (ids) =>
      isTextArray(ids, 1_000, MAX_ID_LENGTH),
    )
  );
}

function validateDreamBroadcast(value: unknown): boolean {
  return (
    isRecord(value) &&
    isText(value.id, MAX_ID_LENGTH) &&
    isText(value.title) &&
    isText(value.nativeTitle) &&
    isText(value.subtitle) &&
    isDateText(value.startsAt) &&
    isNullableDateText(value.endsAt) &&
    isText(value.sourceLabel, 2_048) &&
    isText(value.sourceUrl, MAX_URL_LENGTH) &&
    isText(value.watchUrl, MAX_URL_LENGTH) &&
    isTextArray(value.participantTalentIds, 1_000, MAX_ID_LENGTH)
  );
}

function validateDreamGame(value: unknown): boolean {
  return (
    isRecord(value) &&
    isText(value.title) &&
    isText(value.shortName, 1_024) &&
    isText(value.genre, 2_048) &&
    isText(value.pricing, 2_048) &&
    isText(value.officialUrl, MAX_URL_LENGTH) &&
    isText(value.appStoreUrl, MAX_URL_LENGTH) &&
    isText(value.googlePlayUrl, MAX_URL_LENGTH) &&
    isText(value.steamUrl, MAX_URL_LENGTH)
  );
}

function validateDreamRateGroup(value: unknown): boolean {
  return (
    isRecord(value) &&
    isRate(value.star3) &&
    isRate(value.star4) &&
    isRate(value.star5)
  );
}

function validateDreamRatePreset(value: unknown): boolean {
  return (
    isRecord(value) &&
    isText(value.id, MAX_ID_LENGTH) &&
    isText(value.label, 2_048) &&
    isText(value.shortLabel, 1_024) &&
    isRate(value.ratePercent) &&
    isText(value.note)
  );
}

function validateDreamGachaRates(value: unknown): boolean {
  return (
    isRecord(value) &&
    isDateText(value.verifiedAt) &&
    isText(value.sourceLabel, 2_048) &&
    validateDreamRateGroup(value.normalRates) &&
    validateDreamRateGroup(value.guaranteedTenthRates) &&
    isArrayOf(value.targetPresets, validateDreamRatePreset, 1_000) &&
    isText(value.rateReferenceUrl, MAX_URL_LENGTH) &&
    isText(value.pickupReferenceUrl, MAX_URL_LENGTH) &&
    isText(value.screenshotReferenceUrl, MAX_URL_LENGTH) &&
    isText(value.officialNoticeUrl, MAX_URL_LENGTH)
  );
}

function validateHololiveDreams(value: unknown): boolean {
  return (
    isRecord(value) &&
    isDateText(value.checkedAt) &&
    isText(value.sourceUrl, MAX_URL_LENGTH) &&
    isText(value.officialNewsUrl, MAX_URL_LENGTH) &&
    isText(value.sourceNote) &&
    isDateText(value.launchDate) &&
    validateDreamGame(value.game) &&
    isArrayOf(value.rarities, (rarity) => isFiniteNumber(rarity, 0, 100), 100) &&
    typeof value.ratesPublishedOnOfficialWeb === "boolean" &&
    validateDreamGachaRates(value.gachaRates) &&
    isArrayOf(value.events, validateDreamEvent, 2_000) &&
    isArrayOf(value.officialBroadcasts, validateDreamBroadcast, 2_000) &&
    isArrayOf(value.pickups, validateDreamPickup, 2_000) &&
    isArrayOf(value.characters, validateDreamCharacter, 5_000)
  );
}

export function validateSiteResourcePayload(
  key: string,
  value: unknown,
): boolean {
  try {
    switch (key) {
      case "schedule":
        return validateSchedule(value);
      case "scheduleIndex":
        return validateScheduleIndex(value);
      case "events":
        return validateEvents(value);
      case "talents":
        return validateTalents(value);
      case "solos":
        return validateSolos(value);
      case "youtubeLives":
        return validateYouTubeLives(value);
      case "hololiveDreams":
        return validateHololiveDreams(value);
      default:
        return false;
    }
  } catch {
    return false;
  }
}
