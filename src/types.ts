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
}

export interface SchedulePayload {
  generatedAt: string;
  source: string;
  sourceRefreshMinutes: number;
  collectorVersion: string;
  timezone: string;
  entries: ScheduleEntry[];
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
