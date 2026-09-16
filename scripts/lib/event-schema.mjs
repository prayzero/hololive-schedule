export const EVENT_COUNTRY_REGIONS = Object.freeze([
  "JP",
  "KR",
  "US",
  "TW",
  "CN",
]);

export const EVENT_REGIONS = Object.freeze([
  ...EVENT_COUNTRY_REGIONS,
  "GLOBAL",
]);

export const EVENT_CATEGORIES = Object.freeze([
  "concert",
  "solo",
  "collaboration",
  "festival",
  "exhibition",
]);

const countryRegions = new Set(EVENT_COUNTRY_REGIONS);
const eventRegions = new Set(EVENT_REGIONS);
const eventCategories = new Set(EVENT_CATEGORIES);
const catalogIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const zonedTimestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?(Z|([+-])(\d{2}):(\d{2}))$/;
const expectedOffsetsByRegion = new Map([
  ["JP", new Set(["+09:00"])],
  ["KR", new Set(["+09:00"])],
  ["TW", new Set(["+08:00"])],
  ["CN", new Set(["+08:00"])],
  [
    "US",
    new Set([
      "-04:00",
      "-05:00",
      "-06:00",
      "-07:00",
      "-08:00",
      "-09:00",
      "-10:00",
    ]),
  ],
]);

export function validateCuratedEvents(events) {
  if (!Array.isArray(events) || events.length === 0 || events.length > 2_000) {
    fail("events must be a non-empty array with at most 2,000 items");
  }

  const ids = new Set();
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const label = event?.id ? `event ${event.id}` : `event at index ${index}`;
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      fail(`${label} must be an object`);
    }

    if (
      typeof event.id !== "string" ||
      event.id.length > 120 ||
      !catalogIdPattern.test(event.id) ||
      ids.has(event.id)
    ) {
      fail(`${label} has an invalid or duplicate lowercase kebab-case id`);
    }
    ids.add(event.id);

    requireDisplayString(event.title, `${label} title`, 300);
    requireDisplayString(event.titleKo, `${label} titleKo`, 300);
    requireDisplayString(event.city, `${label} city`, 300);
    requireDisplayString(event.venue, `${label} venue`, 500);
    requireDisplayString(event.dateLabel, `${label} dateLabel`, 200);
    requireDisplayString(event.timeLabel, `${label} timeLabel`, 300);
    requireDisplayString(event.format, `${label} format`, 300);
    requireDisplayString(event.description, `${label} description`, 2_000);

    if (!eventRegions.has(event.region)) {
      fail(`${label} has invalid region ${JSON.stringify(event.region)}`);
    }

    validateCategories(event.categories, label);
    validateParticipants(event.participants, event.participantIds, label);
    validateSupportedRegions(event.region, event.supportedRegions, label);

    const start = parseZonedTimestamp(event.startsAt, `${label} startsAt`);
    const end = parseZonedTimestamp(event.endsAt, `${label} endsAt`);
    if (end.epochMs < start.epochMs) {
      fail(`${label} endsAt precedes startsAt`);
    }
    validateRegionOffset(event.region, start.offset, `${label} startsAt`);
    validateRegionOffset(event.region, end.offset, `${label} endsAt`);
  }
}

function validateCategories(categories, label) {
  if (
    !Array.isArray(categories) ||
    categories.length === 0 ||
    categories.length > EVENT_CATEGORIES.length ||
    new Set(categories).size !== categories.length ||
    categories.some((category) => !eventCategories.has(category))
  ) {
    fail(`${label} has invalid or duplicate categories`);
  }
  if (categories.includes("solo") && !categories.includes("concert")) {
    fail(`${label} uses solo without concert`);
  }
}

function validateParticipants(participants, participantIds, label) {
  if (
    !Array.isArray(participants) ||
    participants.length === 0 ||
    participants.length > 100 ||
    new Set(participants).size !== participants.length ||
    participants.some(
      (participant) =>
        typeof participant !== "string" ||
        !participant.trim() ||
        participant !== participant.trim() ||
        participant.length > 200,
    )
  ) {
    fail(`${label} has invalid or duplicate participants`);
  }

  if (participantIds === undefined) return;
  if (
    !Array.isArray(participantIds) ||
    participantIds.length === 0 ||
    participantIds.length > participants.length ||
    new Set(participantIds).size !== participantIds.length ||
    participantIds.some(
      (participantId) =>
        typeof participantId !== "string" ||
        participantId.length > 120 ||
        !catalogIdPattern.test(participantId),
    )
  ) {
    fail(`${label} has invalid or duplicate participantIds`);
  }
}

function validateSupportedRegions(region, supportedRegions, label) {
  if (supportedRegions === undefined) return;
  if (region !== "GLOBAL") {
    fail(`${label} may only use supportedRegions with region GLOBAL`);
  }
  if (
    !Array.isArray(supportedRegions) ||
    supportedRegions.length === 0 ||
    supportedRegions.length > EVENT_COUNTRY_REGIONS.length ||
    new Set(supportedRegions).size !== supportedRegions.length ||
    supportedRegions.some((supportedRegion) => !countryRegions.has(supportedRegion))
  ) {
    fail(`${label} has invalid or duplicate supportedRegions`);
  }
}

function requireDisplayString(value, label, maximumLength) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value !== value.trim() ||
    value.length > maximumLength
  ) {
    fail(`${label} must be a non-empty trimmed string`);
  }
}

function parseZonedTimestamp(value, label) {
  if (typeof value !== "string") {
    fail(`${label} must be an ISO 8601 timestamp with an explicit offset`);
  }
  const match = value.match(zonedTimestampPattern);
  if (!match) {
    fail(`${label} must be an ISO 8601 timestamp with an explicit offset`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = Number((match[7] ?? ".0").slice(1).padEnd(3, "0"));
  const offset = match[8];
  const offsetHour = offset === "Z" ? 0 : Number(match[10]);
  const offsetMinute = offset === "Z" ? 0 : Number(match[11]);

  if (
    year < 2_000 ||
    year > 2_999 ||
    month < 1 ||
    month > 12 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 14 ||
    offsetMinute > 59 ||
    (offsetHour === 14 && offsetMinute !== 0)
  ) {
    fail(`${label} has an invalid calendar date or UTC offset`);
  }

  const localEpochMs = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond,
  );
  const localDate = new Date(localEpochMs);
  if (
    localDate.getUTCFullYear() !== year ||
    localDate.getUTCMonth() !== month - 1 ||
    localDate.getUTCDate() !== day ||
    localDate.getUTCHours() !== hour ||
    localDate.getUTCMinutes() !== minute ||
    localDate.getUTCSeconds() !== second
  ) {
    fail(`${label} has an invalid calendar date or time`);
  }

  const offsetSign = match[9] === "-" ? -1 : 1;
  const offsetMinutes =
    offset === "Z" ? 0 : offsetSign * (offsetHour * 60 + offsetMinute);
  return {
    epochMs: localEpochMs - offsetMinutes * 60_000,
    offset,
  };
}

function validateRegionOffset(region, offset, label) {
  const expectedOffsets = expectedOffsetsByRegion.get(region);
  if (expectedOffsets && !expectedOffsets.has(offset)) {
    fail(
      `${label} offset ${offset} does not match region ${region} (${[
        ...expectedOffsets,
      ].join(", ")})`,
    );
  }
}

function fail(message) {
  throw new Error(message);
}
