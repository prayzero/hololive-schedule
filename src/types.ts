export type TalentBranch = "JP" | "EN" | "ID" | "DEV_IS";
export type TalentStatus = "active" | "affiliate" | "alumni";

export interface Talent {
  id: string;
  name: string;
  nameKo: string;
  nativeName: string;
  branch: TalentBranch;
  generation: string;
  channelId: string;
  aliases: string[];
  portraitUrl: string;
  officialProfileUrl: string;
  status: TalentStatus;
  accent: string;
}

export interface TalentsPayload {
  checkedAt: string;
  sourceUrl: string;
  sourceNote: string;
  talents: Talent[];
}

export interface ScheduleEntry {
  id: string;
  date: string | null;
  dateLabel: string | null;
  time: string | null;
  startsAt: string | null;
  name: string;
  title: string | null;
  url: string;
  videoId: string;
  thumbnail: string | null;
  avatar: string | null;
  isLive: boolean;
  branch?: TalentBranch;
}

export interface SchedulePayload {
  generatedAt: string;
  source?: string;
  sources?: string[];
  sourceRefreshMinutes: number;
  collectorVersion: string;
  timezone: string;
  entries: ScheduleEntry[];
}

export interface ScheduleArchiveDate {
  date: string;
  month: string;
  count: number;
}

export interface ScheduleArchiveMonth {
  month: string;
  count: number;
  firstDate: string;
  lastDate: string;
  url: string;
}

export interface ScheduleIndexPayload {
  updatedAt: string;
  timezone: string;
  totalEntries: number;
  dates: ScheduleArchiveDate[];
  months: ScheduleArchiveMonth[];
}

export type EventCategory =
  | "concert"
  | "solo"
  | "collaboration"
  | "festival"
  | "exhibition";

export type EventRegion = "JP" | "KR" | "GLOBAL";

export interface CuratedEvent {
  id: string;
  title: string;
  titleKo: string;
  categories: EventCategory[];
  region: EventRegion;
  city: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  dateLabel: string;
  timeLabel: string;
  format: string;
  participants: string[];
  participantIds?: string[];
  description: string;
  imageUrl: string;
  sourceUrl: string;
  officialUrl?: string;
  note?: string;
}

export interface EventsPayload {
  checkedAt: string;
  sourceNote: string;
  events: CuratedEvent[];
}

export interface SoloLive {
  id: string;
  memberId: string;
  relatedMemberIds?: string[];
  title: string;
  titleKo: string;
  startsAt: string;
  endsAt: string;
  dateLabel: string;
  city: string;
  venue: string;
  format: string;
  imageUrl: string;
  sourceUrl: string;
  officialUrl?: string;
  note?: string;
}

export interface SoloLivesPayload {
  checkedAt: string;
  sourceUrl: string;
  sourceNote: string;
  lives: SoloLive[];
}

export type YouTubeLiveCategory =
  | "birthday"
  | "anniversary"
  | "3d"
  | "concert"
  | "special";

export interface YouTubeLive {
  id: string;
  videoId: string;
  memberIds: string[];
  channelId: string;
  title: string;
  category: YouTubeLiveCategory;
  publishedLabel: string | null;
  publishedAt: string;
  durationSeconds: number | null;
  videoUrl: string;
  thumbnailUrl: string;
}

export interface YouTubeLivesPayload {
  checkedAt: string;
  collectorVersion: string;
  sourceNote: string;
  sourceUrl: string;
  talentCount: number;
  membersWithLives: number;
  missingMemberIds: string[];
  lives: YouTubeLive[];
}

export type MusicCategory = "solo" | "collaboration" | "cover";
export type MusicSort = "release" | "duration-asc" | "duration-desc";

export interface MusicLink {
  label: string;
  kind: "youtube" | "streaming" | "music" | "album" | "other";
  url: string;
}

export interface MusicMember {
  talentId: string;
  debutDate: string | null;
  cohortOrder: number;
  debutOrder: number;
}

export interface MusicTrack {
  id: string;
  title: string;
  subtitle: string | null;
  category: MusicCategory;
  memberIds: string[];
  artist: string;
  releaseDate: string | null;
  durationSeconds: number | null;
  albumTitle: string | null;
  releaseType: string | null;
  thumbnailUrl: string | null;
  links: MusicLink[];
}

export interface MusicPayload {
  checkedAt: string;
  sourceNote: string;
  sourceUrls: string[];
  members: MusicMember[];
  tracks: MusicTrack[];
}

export interface CollectionRelease {
  id: string;
  name: string;
  shortName: string;
  releaseDate: string | null;
  category: string;
  sourceUrl: string;
  cardCount: number;
}

export interface CollectionRarity {
  id: string;
  label: string;
  sortOrder: number;
}

export interface CollectionCard {
  id: string;
  releaseIds: string[];
  cardNumber: string;
  title: string;
  rarityId: string;
  imageUrl: string;
  imagePosition?: string;
  imageSize?: string;
  sourceUrl?: string;
  memberNames?: string[];
  variantLabel?: string;
  sortOrder: number;
}

export interface CollectionCatalogPayload {
  checkedAt: string;
  sourceNote: string;
  sourceUrls: string[];
  releases: CollectionRelease[];
  rarities: CollectionRarity[];
  cards: CollectionCard[];
}

export interface DreamCharacter {
  id: string;
  talentId: string;
  name: string;
  nameKo: string;
  nativeName: string;
  branch: TalentBranch;
  generation: string;
  imageUrl: string;
  accent: string;
}

export interface DreamGameInfo {
  title: string;
  shortName: string;
  genre: string;
  pricing: string;
  officialUrl: string;
  appStoreUrl: string;
  googlePlayUrl: string;
  steamUrl: string;
}

export interface DreamGachaRatePreset {
  id: string;
  label: string;
  shortLabel: string;
  ratePercent: number;
  note: string;
}

export interface DreamGachaRates {
  verifiedAt: string;
  sourceLabel: string;
  normalRates: {
    star3: number;
    star4: number;
    star5: number;
  };
  guaranteedTenthRates: {
    star3: number;
    star4: number;
    star5: number;
  };
  targetPresets: DreamGachaRatePreset[];
  rateReferenceUrl: string;
  pickupReferenceUrl: string;
  screenshotReferenceUrl: string;
  officialNoticeUrl: string;
}

export interface DreamPickupCard {
  id: string;
  talentId: string;
  cardTitle: string;
  rarity: number | null;
  imageUrl: string;
  imageAlt: string;
  imagePosition?: string;
  imageScale?: number;
}

export interface DreamPickupRate {
  label: string;
  ratePercent: number;
}

export interface DreamPickup {
  id: string;
  title: string;
  subtitle: string;
  targetRatePercent: number | null;
  rateLabel: string;
  rateBreakdown: DreamPickupRate[];
  startsOn: string;
  endsOn: string | null;
  startsAt?: string;
  endsAt?: string | null;
  announcedOn: string;
  sourceLabel: string;
  sourceUrl: string;
  scheduleNote: string;
  cards: DreamPickupCard[];
}

export interface HololiveDreamsPayload {
  checkedAt: string;
  sourceUrl: string;
  officialNewsUrl: string;
  sourceNote: string;
  launchDate: string;
  game: DreamGameInfo;
  rarities: number[];
  ratesPublishedOnOfficialWeb: boolean;
  gachaRates: DreamGachaRates;
  pickups: DreamPickup[];
  characters: DreamCharacter[];
}
