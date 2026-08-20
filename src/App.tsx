import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Disc3,
  ExternalLink,
  Globe2,
  Headphones,
  History,
  Info,
  MapPin,
  Music2,
  Play,
  Radio,
  Search,
  Sparkles,
  Ticket,
  UsersRound,
  Video,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  CollectionCatalogPage,
  type CollectionCatalogKind,
} from "./collection/CollectionCatalogPage";
import { DreamPage } from "./dream/DreamPage";
import { MusicPage } from "./music/MusicPage";
import { includesSearch, normalizeSearch } from "./search";
import type {
  CollectionCatalogPayload,
  CuratedEvent,
  EventRegion,
  EventsPayload,
  HololiveDreamsPayload,
  MusicPayload,
  ScheduleIndexPayload,
  ScheduleEntry,
  SchedulePayload,
  SoloLive,
  SoloLivesPayload,
  Talent,
  TalentsPayload,
  YouTubeLive,
  YouTubeLiveCategory,
  YouTubeLivesPayload,
} from "./types";

const BASE_URL = import.meta.env.BASE_URL;
const DATA_URLS = {
  schedule: `${BASE_URL}data/schedule.json`,
  scheduleIndex: `${BASE_URL}data/schedule-index.json`,
  events: `${BASE_URL}data/events.json`,
  talents: `${BASE_URL}data/talents.json`,
  solos: `${BASE_URL}data/solo-lives.json`,
  youtubeLives: `${BASE_URL}data/youtube-lives.json`,
  hololiveDreams: `${BASE_URL}data/hololive-dreams.json`,
  music: `${BASE_URL}data/music.json`,
  cards: `${BASE_URL}data/hololive-official-card-game.json`,
  wafer: `${BASE_URL}data/hololive-wafers.json`,
};
const OFFICIAL_SCHEDULE_URL = "https://schedule.hololive.tv/lives/hololive";
const OFFICIAL_TALENTS_URL = "https://hololive.hololivepro.com/en/talents";
const OFFICIAL_DREAMS_URL = "https://www.hololive-dreams.com/en";
const OFFICIAL_MUSIC_URL = "https://hololive.hololivepro.com/en/music/";
const OFFICIAL_CARD_GAME_URL = "https://hololive-official-cardgame.com/";
const OFFICIAL_WAFER_URL =
  "https://www.bandai.co.jp/candy/characters/character462/index.html";

const DREAM_PICKUP_MOMENT_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

type PageView =
  | "schedule"
  | "concerts"
  | "solo"
  | "local"
  | "music"
  | "dream"
  | "cards"
  | "wafer";
type ConcertPeriod = "upcoming" | "past";
type DreamPanel = "collection" | "pickup" | "calculator";
type YouTubeCategoryFilter = "all" | YouTubeLiveCategory;
type LocalEventFilter = "ALL" | "JP" | "KR" | "ENDED";
type BroadcastStatus = "live" | "upcoming" | "ended";
type EventStatus = "ongoing" | "upcoming" | "ended";

interface LoadedData {
  schedule: SchedulePayload;
  scheduleIndex: ScheduleIndexPayload;
  events: EventsPayload;
  talents: TalentsPayload;
  solos: SoloLivesPayload;
  youtubeLives: YouTubeLivesPayload;
  hololiveDreams: HololiveDreamsPayload;
}

type ConcertItem =
  | {
      kind: "event";
      id: string;
      startsAt: string;
      endsAt: string;
      event: CuratedEvent;
      linkedSolo?: SoloLive;
    }
  | {
      kind: "solo";
      id: string;
      startsAt: string;
      endsAt: string;
      live: SoloLive;
    };

interface IconTextProps {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  children: ReactNode;
}

const PAGE_META: Record<
  PageView,
  { eyebrow: string; title: string; description: string }
> = {
  schedule: {
    eyebrow: "LIVE SCHEDULE",
    title: "오늘, 누구를 만나러 갈까요?",
    description:
      "hololive JP·EN·ID·DEV_IS 탤런트의 방송을 한국 시간으로 모았습니다.",
  },
  concerts: {
    eyebrow: "CONCERT CALENDAR",
    title: "무대 위의 순간을 놓치지 않게.",
    description:
      "예정 공연부터 지난 솔로 무대까지, 공식 콘서트 기록을 한곳에서 확인하세요.",
  },
  solo: {
    eyebrow: "YOUTUBE LIVE ARCHIVE",
    title: "다시 보고 싶은 무료 라이브를 한곳에.",
    description:
      "생일·주년·3D·무료 콘서트 영상을 멤버와 카테고리별로 찾아보세요.",
  },
  local: {
    eyebrow: "JP · KR LOCAL",
    title: "일본과 한국에서 만나는 홀로라이브.",
    description:
      "팝업, 전시, 카페, 카드게임 등 공식 현지 콜라보를 지역별로 정리했습니다.",
  },
  music: {
    eyebrow: "HOLOLIVE MUSIC",
    title: "한 사람의 목소리를, 한곳에서.",
    description:
      "기수와 데뷔 순으로 멤버를 찾고 솔로곡·앨범·콜라보·커버를 한 번에 확인하세요.",
  },
  dream: {
    eyebrow: "HOLOLIVE DREAMS",
    title: "뽑은 순간부터, 나만의 컬렉션.",
    description:
      "기본 캐릭터와 신규 픽업 카드를 체크하고, 픽업별 결과를 저장해 역대 나의 운도 확인해 보세요.",
  },
  cards: {
    eyebrow: "HOLOLIVE OFFICIAL CARD GAME",
    title: "가지고 있는 카드가, 나만의 덱이 되도록.",
    description:
      "공식 카드게임의 스타트 덱·부스터·프로모 카드를 팩과 등급별로 모았습니다.",
  },
  wafer: {
    eyebrow: "HOLOLIVE WAFER CARDS",
    title: "웨하스에서 만난 순간도, 하나의 컬렉션으로.",
    description:
      "역대 홀로라이브 웨하스 카드를 출시와 등급별로 확인하고 보유 상태를 기록하세요.",
  },
};

const NAV_ITEMS: Array<{ id: PageView; label: string; shortLabel: string }> = [
  { id: "schedule", label: "방송 일정", shortLabel: "방송" },
  { id: "concerts", label: "콘서트", shortLabel: "공연" },
  { id: "solo", label: "YouTube 라이브", shortLabel: "영상" },
  { id: "local", label: "일본·한국", shortLabel: "현지" },
  { id: "music", label: "음악", shortLabel: "음악" },
  { id: "dream", label: "홀로라이브 드림", shortLabel: "드림" },
  { id: "cards", label: "공식 카드게임", shortLabel: "카드" },
  { id: "wafer", label: "웨하스 카드", shortLabel: "웨하스" },
];

const YOUTUBE_CATEGORY_OPTIONS: Array<{
  id: YouTubeCategoryFilter;
  label: string;
}> = [
  { id: "all", label: "전체" },
  { id: "birthday", label: "생일" },
  { id: "anniversary", label: "주년" },
  { id: "3d", label: "3D" },
  { id: "concert", label: "무료 콘서트" },
  { id: "special", label: "스페셜" },
];

const YOUTUBE_CATEGORY_LABELS: Record<YouTubeLiveCategory, string> = {
  birthday: "생일",
  anniversary: "주년",
  "3d": "3D",
  concert: "무료 콘서트",
  special: "스페셜",
};

const TALENT_BRANCH_ORDER: Record<Talent["branch"], number> = {
  JP: 0,
  DEV_IS: 1,
  EN: 2,
  ID: 3,
};

const MALE_NAME_MARKERS = [
  "altare",
  "axel",
  "bettel",
  "flayon",
  "hakka",
  "shinri",
  "goldbullet",
  "jurard",
  "octavio",
  "ruze",
  "gibby",
  "astel",
  "rikka",
  "temma",
  "roberu",
  "oga",
  "shien",
  "miyabi",
  "izuru",
  "fuma",
  "uyu",
  "rio",
  "花咲みやび",
  "奏手イヅル",
  "アルランディス",
  "律可",
  "アステル",
  "岸堂天真",
  "夕刻ロベル",
  "影山シエン",
  "荒咬オウガ",
  "夜十神封魔",
  "羽継烏有",
  "水無世燐央",
];

const DATE_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const DAY_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  weekday: "short",
});
const DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});
const TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const UPDATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const YOUTUBE_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
});

function paramValue(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

function isCollectionView(view: PageView): view is CollectionCatalogKind {
  return view === "cards" || view === "wafer";
}

function initialView(): PageView {
  const value = paramValue("view");
  return NAV_ITEMS.some(({ id }) => id === value)
    ? (value as PageView)
    : "schedule";
}

function initialConcertPeriod(): ConcertPeriod {
  return paramValue("concert") === "past" ? "past" : "upcoming";
}

function initialYouTubeCategory(): YouTubeCategoryFilter {
  const value = paramValue("category");
  return YOUTUBE_CATEGORY_OPTIONS.some((option) => option.id === value)
    ? (value as YouTubeCategoryFilter)
    : "all";
}

function initialDreamPanel(): DreamPanel {
  const value = paramValue("dream");
  return value === "pickup" || value === "calculator" ? value : "collection";
}

function initialRegion(): LocalEventFilter {
  if (paramValue("status") === "ended") return "ENDED";
  const value = paramValue("region");
  return value === "JP" || value === "KR" ? value : "ALL";
}

function dateKey(date: Date): string {
  return DATE_KEY_FORMATTER.format(date);
}

function includesQuery(
  values: Array<string | null | undefined>,
  normalizedQuery: string,
): boolean {
  return includesSearch(values, normalizedQuery);
}

function soloTalentIds(live: SoloLive): string[] {
  return [live.memberId, ...(live.relatedMemberIds ?? [])];
}

function canonicalUrl(value?: string): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const path = url.pathname
      .replace(/^\/en\//, "/")
      .replace(/\/+$/, "")
      .toLocaleLowerCase();
    return `${url.hostname.toLocaleLowerCase()}${path}`;
  } catch {
    return value.replace(/\/+$/, "").toLocaleLowerCase();
  }
}

function concertIdentityKeys(
  sourceUrl: string,
  officialUrl: string | undefined,
  startsAt: string,
  title: string,
): string[] {
  const urls = [canonicalUrl(sourceUrl), canonicalUrl(officialUrl)]
    .filter((value): value is string => Boolean(value))
    .map((value) => `url:${value}`);
  const date = startsAt.slice(0, 10);
  return [...urls, `fallback:${date}:${normalizeSearch(title)}`];
}

function formatDuration(totalSeconds: number | null): string | null {
  if (totalSeconds === null || !Number.isFinite(totalSeconds)) {
    return null;
  }

  const safeSeconds = Number.isFinite(totalSeconds)
    ? Math.max(0, Math.round(totalSeconds))
    : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function broadcastStatus(
  entry: ScheduleEntry,
  now: Date,
): BroadcastStatus {
  if (entry.isLive) {
    return "live";
  }

  if (!entry.startsAt) {
    return "upcoming";
  }

  return new Date(entry.startsAt).getTime() > now.getTime()
    ? "upcoming"
    : "ended";
}

function eventStatus(
  event: Pick<CuratedEvent, "startsAt" | "endsAt"> | SoloLive,
  now: Date,
): EventStatus {
  const startsAt = new Date(event.startsAt).getTime();
  const endsAt = new Date(event.endsAt).getTime();
  const timestamp = now.getTime();

  if (timestamp >= startsAt && timestamp <= endsAt) {
    return "ongoing";
  }

  return timestamp < startsAt ? "upcoming" : "ended";
}

function statusLabel(status: BroadcastStatus | EventStatus): string {
  if (status === "live" || status === "ongoing") {
    return "진행 중";
  }

  if (status === "upcoming") {
    return "예정";
  }

  return "종료";
}

function formatRelative(startsAt: string | null, now: Date): string {
  if (!startsAt) {
    return "시간 확인 중";
  }

  const minutes = Math.round(
    (new Date(startsAt).getTime() - now.getTime()) / 60_000,
  );

  if (minutes < -1) {
    return TIME_FORMATTER.format(new Date(startsAt));
  }

  if (minutes <= 1) {
    return "곧 시작";
  }

  if (minutes < 60) {
    return `${minutes}분 뒤`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}시간 ${rest}분 뒤` : `${hours}시간 뒤`;
}

function talentSearchValues(talent: Talent): string[] {
  return [
    talent.name,
    talent.nameKo,
    talent.nativeName,
    talent.branch,
    talent.generation,
    ...talent.aliases,
  ];
}

function isHololiveScheduleEntry(entry: ScheduleEntry): boolean {
  const normalizedName = normalizeSearch(entry.name);
  return !MALE_NAME_MARKERS.some((marker) =>
    normalizedName.includes(normalizeSearch(marker)),
  );
}

function regionLabel(region: EventRegion): string {
  if (region === "JP") {
    return "일본";
  }

  if (region === "KR") {
    return "한국";
  }

  return "글로벌";
}

function IconText({ icon: Icon, children }: IconTextProps) {
  return (
    <span className="icon-text">
      <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

function SmartImage({
  src,
  alt,
  className,
  fallbackText,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackText: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span className={`image-fallback ${className ?? ""}`} aria-label={alt}>
        <Sparkles size={24} aria-hidden="true" />
        <span>{fallbackText}</span>
      </span>
    );
  }

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function TalentAvatar({
  talent,
  size = "medium",
}: {
  talent: Talent;
  size?: "small" | "medium" | "large";
}) {
  const [failed, setFailed] = useState(false);

  return (
    <span
      className={`talent-avatar talent-avatar-${size}`}
      style={{ "--talent-accent": talent.accent } as CSSProperties}
    >
      {!failed ? (
        <img
          src={talent.portraitUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{talent.nameKo.slice(0, 1)}</span>
      )}
    </span>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <span className="section-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action ? <div className="section-heading-action">{action}</div> : null}
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <Search size={25} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function BroadcastCard({
  entry,
  now,
  talent,
  onTalentSelect,
}: {
  entry: ScheduleEntry;
  now: Date;
  talent?: Talent;
  onTalentSelect: (talent: Talent) => void;
}) {
  const status = broadcastStatus(entry, now);

  return (
    <article className="broadcast-card">
      <a
        className="card-media"
        href={entry.url}
        target="_blank"
        rel="noreferrer"
        aria-label={`${entry.name} 방송 YouTube에서 열기`}
      >
        <SmartImage
          src={entry.thumbnail}
          alt={`${entry.name} 방송 썸네일`}
          fallbackText="방송 썸네일"
        />
        <span className={`status-badge status-${status}`}>
          {status === "live" ? <span className="pulse-dot" /> : null}
          {statusLabel(status)}
        </span>
        {entry.time ? <span className="media-time">{entry.time}</span> : null}
      </a>
      <div className="broadcast-body">
        <div className="broadcast-member">
          {talent ? (
            <button
              type="button"
              className="avatar-button"
              onClick={() => onTalentSelect(talent)}
              aria-label={`${talent.nameKo} YouTube 라이브 보기`}
            >
              <TalentAvatar talent={talent} size="small" />
            </button>
          ) : (
            <span className="avatar-placeholder" aria-hidden="true">
              {entry.name.slice(0, 1)}
            </span>
          )}
          <div>
            <strong>{talent?.nameKo ?? entry.name}</strong>
            <span>{entry.branch ?? talent?.branch ?? "hololive"}</span>
          </div>
        </div>
        <h3>{entry.title || `${entry.name}의 공식 방송`}</h3>
        <div className="card-footer">
          <span>{formatRelative(entry.startsAt, now)}</span>
          <a href={entry.url} target="_blank" rel="noreferrer">
            YouTube <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
      </div>
    </article>
  );
}

function EventCard({
  event,
  now,
  kind = "event",
}: {
  event: CuratedEvent;
  now: Date;
  kind?: "event" | "local";
}) {
  const status = eventStatus(event, now);

  return (
    <article className={`event-card event-card-${kind}`}>
      <a
        className="event-media"
        href={event.officialUrl ?? event.sourceUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`${event.titleKo} 공식 페이지 열기`}
      >
        <SmartImage
          src={event.imageUrl}
          alt={`${event.titleKo} 공식 이미지`}
          fallbackText="공식 행사"
        />
        <span className={`status-badge status-${status}`}>
          {statusLabel(status)}
        </span>
        <span className={`region-badge region-${event.region.toLowerCase()}`}>
          {regionLabel(event.region)}
        </span>
      </a>
      <div className="event-body">
        <span className="event-date">{event.dateLabel}</span>
        <h3>{event.titleKo}</h3>
        <p className="event-original">{event.title}</p>
        <div className="event-meta">
          <IconText icon={MapPin}>
            {event.city} · {event.venue}
          </IconText>
          <IconText icon={Clock3}>{event.timeLabel}</IconText>
          <IconText icon={Ticket}>{event.format}</IconText>
        </div>
        <p className="event-description">{event.description}</p>
        <div className="event-participants">
          <UsersRound size={16} aria-hidden="true" />
          <span>{event.participants.join(" · ")}</span>
        </div>
        <div className="event-card-footer">
          {event.note ? <span className="note-pill">{event.note}</span> : <span />}
          <a href={event.sourceUrl} target="_blank" rel="noreferrer">
            공식 정보 <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
      </div>
    </article>
  );
}

function SoloCard({
  live,
  talent,
  now,
  onTalentSelect,
}: {
  live: SoloLive;
  talent: Talent;
  now: Date;
  onTalentSelect: (talent: Talent) => void;
}) {
  const status = eventStatus(live, now);

  return (
    <article
      className="solo-card"
      style={{ "--talent-accent": talent.accent } as CSSProperties}
    >
      <a
        className="solo-media"
        href={live.officialUrl ?? live.sourceUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`${live.titleKo} 공식 페이지 열기`}
      >
        <SmartImage
          src={live.imageUrl}
          alt={`${live.titleKo} 공식 키 비주얼`}
          fallbackText={talent.nameKo}
        />
        <span className={`status-badge status-${status}`}>
          {status === "ended" ? "지난 공연" : statusLabel(status)}
        </span>
      </a>
      <div className="solo-body">
        <button
          type="button"
          className="solo-talent-link"
          onClick={() => onTalentSelect(talent)}
          aria-label={`${talent.nameKo}의 YouTube 라이브 보기`}
        >
          <TalentAvatar talent={talent} size="small" />
          <span>
            <strong>{talent.nameKo}</strong>
            <small>
              {talent.branch} · {talent.generation}
            </small>
          </span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
        <span className="solo-date">{live.dateLabel}</span>
        <h3>{live.titleKo}</h3>
        <p>{live.title}</p>
        <div className="solo-meta">
          <IconText icon={MapPin}>
            {live.city} · {live.venue}
          </IconText>
          <IconText icon={Ticket}>{live.format}</IconText>
        </div>
        <div className="solo-card-footer">
          {live.note ? <span>{live.note}</span> : <span />}
          <a href={live.sourceUrl} target="_blank" rel="noreferrer">
            공식 기록 <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
      </div>
    </article>
  );
}

function YouTubeLiveCard({
  live,
  talents,
  onTalentSelect,
}: {
  live: YouTubeLive;
  talents: Talent[];
  onTalentSelect: (talent: Talent) => void;
}) {
  const primaryTalent = talents[0];
  const duration = formatDuration(live.durationSeconds);
  const talentNames =
    talents.length > 0
      ? talents.map((talent) => talent.nameKo).join(" · ")
      : "hololive";

  return (
    <article
      className="youtube-live-card"
      style={
        primaryTalent
          ? ({ "--talent-accent": primaryTalent.accent } as CSSProperties)
          : undefined
      }
    >
      <a
        className="youtube-live-media"
        href={live.videoUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`${live.title} YouTube에서 보기`}
      >
        <SmartImage
          src={live.thumbnailUrl}
          alt={`${live.title} 영상 썸네일`}
          fallbackText="YouTube 라이브"
        />
        <span className={`youtube-category category-${live.category}`}>
          {YOUTUBE_CATEGORY_LABELS[live.category]}
        </span>
        {duration ? <span className="youtube-duration">{duration}</span> : null}
        <span className="youtube-play" aria-hidden="true">
          <Play size={19} fill="currentColor" />
        </span>
      </a>
      <div className="youtube-live-body">
        <div className="youtube-live-member">
          <div className="youtube-avatar-stack">
            {talents.slice(0, 3).map((talent) => (
              <button
                type="button"
                className="avatar-button"
                key={talent.id}
                onClick={() => onTalentSelect(talent)}
                aria-label={`${talent.nameKo}의 YouTube 라이브만 보기`}
              >
                <TalentAvatar talent={talent} size="small" />
              </button>
            ))}
          </div>
          <div>
            <strong>{talentNames}</strong>
            <span>{primaryTalent?.branch ?? "hololive"} 공식 채널</span>
          </div>
        </div>
        <h3>{live.title}</h3>
        <div className="youtube-live-meta">
          <IconText icon={CalendarDays}>
            <time dateTime={live.publishedAt}>
              {YOUTUBE_DATE_FORMATTER.format(new Date(live.publishedAt))}
            </time>
          </IconText>
          {duration ? (
            <IconText icon={Clock3}>영상 길이 {duration}</IconText>
          ) : (
            <IconText icon={Clock3}>길이 정보 없음</IconText>
          )}
        </div>
        <div className="youtube-live-footer">
          <span>
            <Video size={14} aria-hidden="true" />
            {YOUTUBE_CATEGORY_LABELS[live.category]}
          </span>
          <a href={live.videoUrl} target="_blank" rel="noreferrer">
            YouTube <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
      </div>
    </article>
  );
}

function LoadingGrid() {
  return (
    <div className="card-grid" aria-label="일정을 불러오는 중">
      {[0, 1, 2, 3].map((item) => (
        <div className="skeleton-card" key={item}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [data, setData] = useState<LoadedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveMonths, setArchiveMonths] = useState<
    Record<string, ScheduleEntry[]>
  >({});
  const [archiveLoadingMonth, setArchiveLoadingMonth] = useState<string | null>(
    null,
  );
  const [musicData, setMusicData] = useState<MusicPayload | null>(null);
  const [musicError, setMusicError] = useState<string | null>(null);
  const [collectionData, setCollectionData] = useState<
    Partial<Record<CollectionCatalogKind, CollectionCatalogPayload>>
  >({});
  const [collectionErrors, setCollectionErrors] = useState<
    Partial<Record<CollectionCatalogKind, string | null>>
  >({});
  const [collectionReloadRequest, setCollectionReloadRequest] = useState(0);
  const [dataReloadRequest, setDataReloadRequest] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const activeNavButtonRef = useRef<HTMLButtonElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const activeDateButtonRef = useRef<HTMLButtonElement>(null);
  const [now, setNow] = useState(() => new Date());
  const [view, setView] = useState<PageView>(initialView);
  const [query, setQuery] = useState(() => paramValue("q") ?? "");
  const [selectedDate, setSelectedDate] = useState(
    () => paramValue("day") ?? dateKey(new Date()),
  );
  const [hideEnded, setHideEnded] = useState(() => {
    const requestedDate = paramValue("day");
    return !requestedDate || requestedDate >= dateKey(new Date());
  });
  const [concertPeriod, setConcertPeriod] =
    useState<ConcertPeriod>(initialConcertPeriod);
  const [youtubeCategory, setYoutubeCategory] =
    useState<YouTubeCategoryFilter>(initialYouTubeCategory);
  const [dreamPanel, setDreamPanel] =
    useState<DreamPanel>(initialDreamPanel);
  const [selectedMemberId, setSelectedMemberId] = useState(
    () => paramValue("member") ?? "",
  );
  const [region, setRegion] = useState<LocalEventFilter>(initialRegion);
  const historyViewRef = useRef(view);
  const restoringHistoryRef = useRef(false);
  const activeCollectionView = isCollectionView(view) ? view : null;
  const activeCollectionData = activeCollectionView
    ? collectionData[activeCollectionView] ?? null
    : null;
  const activeCollectionError = activeCollectionView
    ? collectionErrors[activeCollectionView] ?? null
    : null;

  useEffect(() => {
    let controller: AbortController | null = null;
    let refreshTimer: number | null = null;
    let nextRefreshAt = 0;
    let loading = false;
    let disposed = false;

    const scheduleRefresh = (delayMs: number) => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      nextRefreshAt = Date.now() + delayMs;
      refreshTimer = window.setTimeout(() => void loadData(), delayMs);
    };

    async function loadData() {
      if (loading || disposed) return;
      loading = true;
      controller = new AbortController();

      try {
        setError(null);
        const [
          scheduleResponse,
          scheduleIndexResponse,
          eventsResponse,
          talentsResponse,
          solosResponse,
          youtubeLivesResponse,
          hololiveDreamsResponse,
        ] = await Promise.all([
          fetch(DATA_URLS.schedule, {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch(DATA_URLS.scheduleIndex, {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch(DATA_URLS.events, {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch(DATA_URLS.talents, {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch(DATA_URLS.solos, {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch(DATA_URLS.youtubeLives, {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch(DATA_URLS.hololiveDreams, {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);

        const responses = [
          scheduleResponse,
          scheduleIndexResponse,
          eventsResponse,
          talentsResponse,
          solosResponse,
          youtubeLivesResponse,
          hololiveDreamsResponse,
        ];

        if (responses.some((response) => !response.ok)) {
          throw new Error("사이트 데이터 일부를 불러오지 못했습니다.");
        }

        const [
          schedule,
          scheduleIndex,
          events,
          talents,
          solos,
          youtubeLives,
          hololiveDreams,
        ] = await Promise.all([
            scheduleResponse.json() as Promise<SchedulePayload>,
            scheduleIndexResponse.json() as Promise<ScheduleIndexPayload>,
            eventsResponse.json() as Promise<EventsPayload>,
            talentsResponse.json() as Promise<TalentsPayload>,
            solosResponse.json() as Promise<SoloLivesPayload>,
            youtubeLivesResponse.json() as Promise<YouTubeLivesPayload>,
            hololiveDreamsResponse.json() as Promise<HololiveDreamsPayload>,
          ]);

        if (disposed) return;
        setData({
          schedule,
          scheduleIndex,
          events,
          talents,
          solos,
          youtubeLives,
          hololiveDreams,
        });
        const refreshMinutes = Math.min(
          60,
          Math.max(1, Number(schedule.sourceRefreshMinutes) || 15),
        );
        scheduleRefresh(refreshMinutes * 60_000);
      } catch (loadError) {
        if (!controller?.signal.aborted && !disposed) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "사이트 데이터를 불러오지 못했습니다.",
          );
          scheduleRefresh(60_000);
        }
      } finally {
        loading = false;
      }
    }

    const refreshIfStale = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() >= nextRefreshAt
      ) {
        void loadData();
      }
    };

    void loadData();
    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => {
      disposed = true;
      controller?.abort();
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, [dataReloadRequest]);

  useEffect(() => {
    if (view !== "music" || musicData) {
      return;
    }

    const controller = new AbortController();

    async function loadMusicData() {
      try {
        setMusicError(null);
        const response = await fetch(DATA_URLS.music, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("음악 데이터를 불러오지 못했습니다.");
        }

        setMusicData((await response.json()) as MusicPayload);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setMusicError(
            loadError instanceof Error
              ? loadError.message
              : "음악 데이터를 불러오지 못했습니다.",
          );
        }
      }
    }

    void loadMusicData();
    return () => controller.abort();
  }, [dataReloadRequest, musicData, view]);

  useEffect(() => {
    if (!activeCollectionView || activeCollectionData) {
      return;
    }

    const requestedView = activeCollectionView;
    const controller = new AbortController();

    async function loadCollectionData() {
      try {
        setCollectionErrors((current) => ({
          ...current,
          [requestedView]: null,
        }));
        const response = await fetch(DATA_URLS[requestedView], {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            requestedView === "cards"
              ? "공식 카드게임 데이터를 불러오지 못했습니다."
              : "웨하스 카드 데이터를 불러오지 못했습니다.",
          );
        }

        const payload = (await response.json()) as CollectionCatalogPayload;
        setCollectionData((current) => ({
          ...current,
          [requestedView]: payload,
        }));
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setCollectionErrors((current) => ({
            ...current,
            [requestedView]:
              loadError instanceof Error
                ? loadError.message
                : "카드 컬렉션 데이터를 불러오지 못했습니다.",
          }));
        }
      }
    }

    void loadCollectionData();
    return () => controller.abort();
  }, [
    activeCollectionData,
    activeCollectionView,
    collectionReloadRequest,
  ]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const activeButton = activeNavButtonRef.current;
    const nav = activeButton?.parentElement;
    if (!activeButton || !nav) return;

    const navBounds = nav.getBoundingClientRect();
    const buttonBounds = activeButton.getBoundingClientRect();
    if (buttonBounds.left < navBounds.left) {
      nav.scrollBy({
        left: buttonBounds.left - navBounds.left - 12,
        behavior: "smooth",
      });
    } else if (buttonBounds.right > navBounds.right) {
      nav.scrollBy({
        left: buttonBounds.right - navBounds.right + 12,
        behavior: "smooth",
      });
    }
  }, [view]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isEditing =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement ||
        (activeElement instanceof HTMLElement &&
          activeElement.isContentEditable);

      if (
        event.key === "/" &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !isEditing
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    const restoreFromLocation = () => {
      const requestedDate = paramValue("day");
      restoringHistoryRef.current = true;
      setView(initialView());
      setQuery(paramValue("q") ?? "");
      setSelectedDate(requestedDate ?? dateKey(new Date()));
      setHideEnded(
        !requestedDate || requestedDate >= dateKey(new Date()),
      );
      setConcertPeriod(initialConcertPeriod());
      setYoutubeCategory(initialYouTubeCategory());
      setDreamPanel(initialDreamPanel());
      setSelectedMemberId(paramValue("member") ?? "");
      setRegion(initialRegion());
    };

    window.addEventListener("popstate", restoreFromLocation);
    return () => window.removeEventListener("popstate", restoreFromLocation);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("view", view);

    if (query.trim()) {
      params.set("q", query.trim());
    }

    if (view === "schedule" && selectedDate) {
      params.set("day", selectedDate);
    }

    if (view === "concerts") {
      params.set("concert", concertPeriod);
    }

    if (view === "solo") {
      if (youtubeCategory !== "all") {
        params.set("category", youtubeCategory);
      }
      if (selectedMemberId) {
        params.set("member", selectedMemberId);
      }
    }

    if (view === "music" && selectedMemberId) {
      params.set("member", selectedMemberId);
    }

    if (view === "local") {
      if (region === "ENDED") {
        params.set("status", "ended");
      } else if (region !== "ALL") {
        params.set("region", region);
      }
    }

    if (view === "dream") {
      params.set("dream", dreamPanel);
    }

    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    const changedView = historyViewRef.current !== view;

    if (restoringHistoryRef.current) {
      restoringHistoryRef.current = false;
    } else if (nextUrl !== currentUrl) {
      window.history[changedView ? "pushState" : "replaceState"](
        null,
        "",
        nextUrl,
      );
    }
    historyViewRef.current = view;
    document.title = `${PAGE_META[view].title} | HOLO NOW`;
  }, [
    concertPeriod,
    dreamPanel,
    query,
    region,
    selectedDate,
    selectedMemberId,
    view,
    youtubeCategory,
  ]);

  const talents = data?.talents.talents ?? [];
  const soloLives = data?.solos.lives ?? [];
  const youtubeLives = data?.youtubeLives.lives ?? [];
  const musicTracks = musicData?.tracks ?? [];
  const normalizedQuery = normalizeSearch(query);

  const musicOriginalCount = useMemo(
    () => musicTracks.filter((track) => track.category !== "cover").length,
    [musicTracks],
  );
  const musicCoverCount = useMemo(
    () => musicTracks.filter((track) => track.category === "cover").length,
    [musicTracks],
  );
  const musicAlbumCount = useMemo(
    () =>
      new Set(
        musicTracks
          .map((track) => track.albumTitle?.trim())
          .filter((title): title is string => Boolean(title)),
      ).size,
    [musicTracks],
  );

  const talentById = useMemo(
    () => new Map(talents.map((talent) => [talent.id, talent])),
    [talents],
  );

  const youtubeCountByTalent = useMemo(() => {
    const counts = new Map<string, number>();
    youtubeLives.forEach((live) => {
      live.memberIds.forEach((talentId) => {
        counts.set(talentId, (counts.get(talentId) ?? 0) + 1);
      });
    });
    return counts;
  }, [youtubeLives]);

  const youtubeTalents = useMemo(
    () =>
      [...talents].sort(
        (left, right) =>
          TALENT_BRANCH_ORDER[left.branch] -
            TALENT_BRANCH_ORDER[right.branch] ||
          left.nameKo.localeCompare(right.nameKo, "ko"),
      ),
    [talents],
  );

  const matchingTalents = useMemo(
    () =>
      normalizedQuery
        ? youtubeTalents
            .filter((talent) =>
              includesQuery(talentSearchValues(talent), normalizedQuery),
            )
            .slice(0, 6)
        : [],
    [normalizedQuery, youtubeTalents],
  );

  const currentSchedule = useMemo(
    () =>
      (data?.schedule.entries ?? [])
        .filter(isHololiveScheduleEntry)
        .sort((a, b) =>
          String(a.startsAt ?? "").localeCompare(String(b.startsAt ?? "")),
        ),
    [data?.schedule.entries],
  );

  const hololiveSchedule = useMemo(() => {
    const entriesByVideoId = new Map<string, ScheduleEntry>();

    Object.values(archiveMonths)
      .flat()
      .filter(isHololiveScheduleEntry)
      .forEach((entry) => entriesByVideoId.set(entry.videoId, entry));
    currentSchedule.forEach((entry) =>
      entriesByVideoId.set(entry.videoId, entry),
    );

    return [...entriesByVideoId.values()].sort((a, b) =>
      String(a.startsAt ?? "").localeCompare(String(b.startsAt ?? "")),
    );
  }, [archiveMonths, currentSchedule]);

  const talentForBroadcast = (entry: ScheduleEntry): Talent | undefined => {
    const entryName = normalizeSearch(entry.name);
    return talents.find((talent) =>
      talentSearchValues(talent).some((value) => {
        const normalizedValue = normalizeSearch(value);
        return (
          normalizedValue === entryName ||
          (normalizedValue.length >= 3 && entryName.includes(normalizedValue)) ||
          (entryName.length >= 3 && normalizedValue.includes(entryName))
        );
      }),
    );
  };

  const dateOptions = useMemo(() => {
    if (data?.scheduleIndex.dates.length) {
      return data.scheduleIndex.dates.map(({ date, count }) => {
        const parsed = new Date(`${date}T12:00:00+09:00`);
        return { value: date, label: DAY_FORMATTER.format(parsed), count };
      });
    }

    const dateCounts = new Map<string, number>();
    currentSchedule.forEach((entry) => {
      if (entry.date) {
        dateCounts.set(entry.date, (dateCounts.get(entry.date) ?? 0) + 1);
      }
    });

    return [...dateCounts]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([value, count]) => {
      const parsed = new Date(`${value}T12:00:00+09:00`);
      return { value, label: DAY_FORMATTER.format(parsed), count };
      });
  }, [currentSchedule, data?.scheduleIndex.dates]);

  useEffect(() => {
    if (
      dateOptions.length > 0 &&
      !dateOptions.some((option) => option.value === selectedDate)
    ) {
      const today = dateKey(new Date());
      const firstCurrentOrFuture = dateOptions.find(
        (option) => option.value >= today,
      );
      setSelectedDate(
        dateOptions.find((option) => option.value === today)?.value ??
          firstCurrentOrFuture?.value ??
          dateOptions.at(-1)!.value,
      );
    }
  }, [dateOptions, selectedDate]);

  const visibleDateOptions = useMemo(() => {
    if (dateOptions.length <= 15) {
      return dateOptions;
    }

    const selectedIndex = Math.max(
      0,
      dateOptions.findIndex((option) => option.value === selectedDate),
    );
    const start = Math.max(
      0,
      Math.min(selectedIndex - 7, dateOptions.length - 15),
    );
    return dateOptions.slice(start, start + 15);
  }, [dateOptions, selectedDate]);

  useEffect(() => {
    const month = selectedDate.slice(0, 7);
    const hasArchivedMonth = Object.hasOwn(archiveMonths, month);
    const monthExists = data?.scheduleIndex.months.some(
      (item) => item.month === month,
    );

    if (
      !data ||
      !monthExists ||
      hasArchivedMonth
    ) {
      return;
    }

    const controller = new AbortController();
    setArchiveError(null);
    setArchiveLoadingMonth(month);

    void fetch(
      `${BASE_URL}data/schedule-archive/${encodeURIComponent(month)}.json`,
      {
        cache: "no-store",
        signal: controller.signal,
      },
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error(`방송 기록을 불러오지 못했습니다. (${response.status})`);
        }
        return response.json() as Promise<SchedulePayload>;
      })
      .then((payload) => {
        if (!Array.isArray(payload.entries)) {
          throw new Error("방송 기록 파일의 형식이 올바르지 않습니다.");
        }
        setArchiveMonths((previous) => ({
          ...previous,
          [month]: payload.entries,
        }));
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setArchiveError(
            loadError instanceof Error
              ? loadError.message
              : "방송 기록을 불러오지 못했습니다.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setArchiveLoadingMonth((loadingMonth) =>
            loadingMonth === month ? null : loadingMonth,
          );
        }
      });

    return () => controller.abort();
  }, [
    archiveMonths,
    data,
    dataReloadRequest,
    selectedDate,
  ]);

  useEffect(() => {
    const activeButton = activeDateButtonRef.current;
    const dateTabs = activeButton?.parentElement;

    if (!activeButton || !dateTabs) {
      return;
    }

    dateTabs.scrollTo({
      behavior: "smooth",
      left:
        activeButton.offsetLeft -
        (dateTabs.clientWidth - activeButton.clientWidth) / 2,
    });
  }, [selectedDate, visibleDateOptions]);

  const selectScheduleDate = (value: string) => {
    setSelectedDate(value);
    if (value < dateKey(new Date())) {
      setHideEnded(false);
    }
  };

  const openDatePicker = () => {
    const input = dateInputRef.current;

    if (!input) {
      return;
    }

    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  };

  const openSchedule = () => {
    setView("schedule");
    setSelectedDate(dateKey(new Date()));
    setHideEnded(true);
  };

  const visibleBroadcasts = useMemo(
    () =>
      hololiveSchedule.filter((entry) => {
        if (entry.date !== selectedDate) {
          return false;
        }

        if (hideEnded && broadcastStatus(entry, now) === "ended") {
          return false;
        }

        return includesQuery(
          [entry.name, entry.title, entry.branch],
          normalizedQuery,
        );
      }),
    [hololiveSchedule, hideEnded, normalizedQuery, now, selectedDate],
  );

  const liveNow = useMemo(
    () =>
      currentSchedule.filter(
        (entry) => broadcastStatus(entry, now) === "live",
      ),
    [currentSchedule, now],
  );

  const nextBroadcast = useMemo(
    () =>
      currentSchedule.find(
        (entry) => broadcastStatus(entry, now) === "upcoming",
      ),
    [currentSchedule, now],
  );

  const upcomingSoloLives = useMemo(
    () =>
      soloLives
        .filter((live) => new Date(live.endsAt).getTime() >= now.getTime())
        .sort(
          (left, right) =>
            new Date(left.startsAt).getTime() -
            new Date(right.startsAt).getTime(),
        ),
    [now, soloLives],
  );

  const selectedTalent = selectedMemberId
    ? talentById.get(selectedMemberId)
    : undefined;

  const youtubeCategoryCounts = useMemo(() => {
    const counts = new Map<YouTubeLiveCategory, number>();
    youtubeLives
      .filter(
        (live) =>
          !selectedMemberId || live.memberIds.includes(selectedMemberId),
      )
      .forEach((live) => {
        counts.set(live.category, (counts.get(live.category) ?? 0) + 1);
      });
    return counts;
  }, [selectedMemberId, youtubeLives]);

  const visibleYoutubeLives = useMemo(() => {
    const deduplicated = new Map<string, YouTubeLive>();

    youtubeLives.forEach((live) => {
      if (
        selectedMemberId &&
        !live.memberIds.includes(selectedMemberId)
      ) {
        return;
      }

      if (
        youtubeCategory !== "all" &&
        live.category !== youtubeCategory
      ) {
        return;
      }

      const associatedTalents = live.memberIds
        .map((talentId) => talentById.get(talentId))
        .filter((talent): talent is Talent => Boolean(talent));

      if (
        !includesQuery(
          [
            live.title,
            YOUTUBE_CATEGORY_LABELS[live.category],
            ...associatedTalents.flatMap(talentSearchValues),
          ],
          normalizedQuery,
        )
      ) {
        return;
      }

      deduplicated.set(live.videoId, live);
    });

    return Array.from(deduplicated.values()).sort(
      (left, right) =>
        new Date(right.publishedAt).getTime() -
        new Date(left.publishedAt).getTime(),
    );
  }, [
    normalizedQuery,
    selectedMemberId,
    talentById,
    youtubeCategory,
    youtubeLives,
  ]);

  const visibleYoutubeTalents = useMemo(() => {
    if (!normalizedQuery) {
      return youtubeTalents;
    }

    const matches = youtubeTalents.filter((talent) =>
      includesQuery(talentSearchValues(talent), normalizedQuery),
    );
    return matches.length > 0 ? matches : youtubeTalents;
  }, [normalizedQuery, youtubeTalents]);

  const concertItems = useMemo(() => {
    const items: ConcertItem[] = [];
    const keyToIndex = new Map<string, number>();

    (data?.events.events ?? [])
      .filter((event) => event.categories.includes("concert"))
      .forEach((event) => {
        const keys = concertIdentityKeys(
          event.sourceUrl,
          event.officialUrl,
          event.startsAt,
          event.title,
        );
        const duplicateIndex = keys
          .map((key) => keyToIndex.get(key))
          .find((value): value is number => value !== undefined);

        if (duplicateIndex !== undefined) {
          return;
        }

        const index = items.length;
        items.push({
          kind: "event",
          id: `event:${event.id}`,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          event,
        });
        keys.forEach((key) => keyToIndex.set(key, index));
      });

    soloLives.forEach((live) => {
      const keys = concertIdentityKeys(
        live.sourceUrl,
        live.officialUrl,
        live.startsAt,
        live.title,
      );
      const duplicateIndex = keys
        .map((key) => keyToIndex.get(key))
        .find((value): value is number => value !== undefined);

      if (duplicateIndex !== undefined) {
        const duplicate = items[duplicateIndex];
        if (duplicate.kind === "event") {
          duplicate.linkedSolo = live;
        }
        keys.forEach((key) => keyToIndex.set(key, duplicateIndex));
        return;
      }

      const index = items.length;
      items.push({
        kind: "solo",
        id: `solo:${live.id}`,
        startsAt: live.startsAt,
        endsAt: live.endsAt,
        live,
      });
      keys.forEach((key) => keyToIndex.set(key, index));
    });

    return items;
  }, [data?.events.events, soloLives]);

  const upcomingConcerts = useMemo(
    () =>
      concertItems
        .filter((item) => new Date(item.endsAt).getTime() >= now.getTime())
        .sort(
          (left, right) =>
            new Date(left.startsAt).getTime() -
            new Date(right.startsAt).getTime(),
        ),
    [concertItems, now],
  );

  const pastConcerts = useMemo(
    () =>
      concertItems
        .filter((item) => new Date(item.endsAt).getTime() < now.getTime())
        .sort(
          (left, right) =>
            new Date(right.startsAt).getTime() -
            new Date(left.startsAt).getTime(),
        ),
    [concertItems, now],
  );

  const visibleConcerts = useMemo(() => {
    const periodItems =
      concertPeriod === "upcoming" ? upcomingConcerts : pastConcerts;

    return periodItems.filter((item) => {
      if (item.kind === "event") {
        const linkedTalents = item.linkedSolo
          ? soloTalentIds(item.linkedSolo)
              .map((talentId) => talentById.get(talentId))
              .filter((talent): talent is Talent => Boolean(talent))
          : [];
        return includesQuery(
          [
            item.event.title,
            item.event.titleKo,
            item.event.city,
            item.event.venue,
            ...item.event.participants,
            ...(item.linkedSolo
              ? [item.linkedSolo.title, item.linkedSolo.titleKo]
              : []),
            ...linkedTalents.flatMap(talentSearchValues),
          ],
          normalizedQuery,
        );
      }

      const associatedTalents = soloTalentIds(item.live)
        .map((talentId) => talentById.get(talentId))
        .filter((talent): talent is Talent => Boolean(talent));
      return includesQuery(
        [
          item.live.title,
          item.live.titleKo,
          item.live.city,
          item.live.venue,
          ...associatedTalents.flatMap(talentSearchValues),
        ],
        normalizedQuery,
      );
    });
  }, [
    concertPeriod,
    normalizedQuery,
    pastConcerts,
    talentById,
    upcomingConcerts,
  ]);

  const localEvents = useMemo(
    () =>
      (data?.events.events ?? [])
        .filter(
          (event) =>
            (event.region === "JP" || event.region === "KR") &&
            (event.categories.includes("collaboration") ||
              event.categories.includes("exhibition") ||
              event.categories.includes("festival")),
        )
        .filter((event) => {
          const status = eventStatus(event, now);
          return region === "ENDED"
            ? status === "ended"
            : status !== "ended";
        })
        .filter(
          (event) =>
            region === "ALL" ||
            region === "ENDED" ||
            event.region === region,
        )
        .filter((event) =>
          includesQuery(
            [
              event.title,
              event.titleKo,
              event.city,
              event.venue,
              ...event.participants,
            ],
            normalizedQuery,
          ),
        )
        .sort((left, right) => {
          if (region === "ENDED") {
            return (
              new Date(right.endsAt).getTime() -
              new Date(left.endsAt).getTime()
            );
          }
          const leftStatus = eventStatus(left, now);
          const rightStatus = eventStatus(right, now);
          return (
            Number(rightStatus === "ongoing") -
              Number(leftStatus === "ongoing") ||
            new Date(left.startsAt).getTime() -
              new Date(right.startsAt).getTime()
          );
        }),
    [data?.events.events, normalizedQuery, now, region],
  );

  const featuredSolo = upcomingSoloLives[0];
  const featuredTalent = featuredSolo
    ? talentById.get(featuredSolo.memberId)
    : undefined;

  function selectTalent(talent: Talent) {
    setView("solo");
    setSelectedMemberId(talent.id);
    setYoutubeCategory("all");
    setQuery("");
    window.setTimeout(() => {
      document
        .getElementById("youtube-live-archive")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function openConcertsForTalent(talent: Talent) {
    setView("concerts");
    setConcertPeriod("upcoming");
    setSelectedMemberId("");
    setQuery(talent.nameKo);
    window.setTimeout(() => {
      document
        .getElementById("concert-archive")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function openDreamPickup() {
    setView("dream");
    setDreamPanel("pickup");
    setQuery("");
    window.setTimeout(() => {
      document
        .getElementById("hololive-dream")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function openMusicArchive() {
    document
      .getElementById("hololive-music")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openCollectionArchive(kind: CollectionCatalogKind) {
    document
      .getElementById(
        kind === "cards" ? "hololive-card-game" : "hololive-wafer",
      )
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const dreamPickupHighlight = useMemo(() => {
    const entries = (data?.hololiveDreams.pickups ?? [])
      .map((pickup) => {
        const startsAt = Date.parse(
          pickup.startsAt ?? `${pickup.startsOn}T00:00:00+09:00`,
        );
        const endsAt = pickup.endsAt
          ? Date.parse(pickup.endsAt)
          : pickup.endsOn
            ? Date.parse(`${pickup.endsOn}T23:59:59+09:00`)
            : null;
        return { pickup, startsAt, endsAt };
      })
      .sort((left, right) => left.startsAt - right.startsAt);
    const nowTime = now.getTime();
    const active = entries.filter(
      ({ startsAt, endsAt }) =>
        startsAt <= nowTime && (endsAt === null || nowTime <= endsAt),
    );
    const upcoming = entries.filter(({ startsAt }) => startsAt > nowTime);
    const ended = entries
      .filter(({ endsAt }) => endsAt !== null && endsAt < nowTime)
      .sort((left, right) => right.startsAt - left.startsAt);
    return {
      primary: active[0] ?? upcoming[0] ?? ended[0] ?? null,
      banner: active[0] ?? upcoming[0] ?? null,
      activeCount: active.length,
    };
  }, [data?.hololiveDreams.pickups, now]);

  const currentMeta = PAGE_META[view];
  const headerOfficialUrl =
    view === "dream"
      ? OFFICIAL_DREAMS_URL
      : view === "music"
        ? OFFICIAL_MUSIC_URL
          : view === "cards"
          ? activeCollectionData?.sourceUrls[0] ?? OFFICIAL_CARD_GAME_URL
          : view === "wafer"
            ? OFFICIAL_WAFER_URL
            : OFFICIAL_SCHEDULE_URL;
  const headerOfficialLabel =
    view === "dream"
      ? "공식 게임"
      : view === "music"
        ? "공식 음악"
        : view === "cards"
          ? "공식 카드"
          : view === "wafer"
            ? "공식 웨하스"
            : "공식 일정";

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>

      {dreamPickupHighlight.banner ? (
        <a
          className="dream-broadcast-banner"
          href="?view=dream&dream=pickup"
          onClick={(event) => {
            event.preventDefault();
            openDreamPickup();
          }}
          aria-label={`${dreamPickupHighlight.banner.pickup.title} 픽업 일정과 확률 보기`}
        >
          <span className="dream-broadcast-banner__inner">
            <span className="dream-broadcast-banner__icon" aria-hidden="true">
              <CalendarDays size={19} strokeWidth={2.2} />
            </span>
            <span className="dream-broadcast-banner__copy">
              <span className="dream-broadcast-banner__eyebrow">
                <span className="dream-broadcast-banner__live-dot" />
                CURRENT PICKUP
                {dreamPickupHighlight.activeCount > 1
                  ? ` · ${dreamPickupHighlight.activeCount}종 동시 진행`
                  : ""}
              </span>
              <strong>{dreamPickupHighlight.banner.pickup.title}</strong>
            </span>
            <span className="dream-broadcast-banner__time">
              <span>
                {DREAM_PICKUP_MOMENT_FORMATTER.format(
                  new Date(dreamPickupHighlight.banner.startsAt),
                )}{" "}
                시작
              </span>
              <strong>
                {dreamPickupHighlight.banner.endsAt
                  ? DREAM_PICKUP_MOMENT_FORMATTER.format(
                      new Date(dreamPickupHighlight.banner.endsAt),
                    )
                  : "종료 일정 확인 중"}
              </strong>
              <small>KST · JST</small>
            </span>
            <span className="dream-broadcast-banner__cta">
              일정·확률 보기
              <ArrowRight size={17} aria-hidden="true" />
            </span>
          </span>
        </a>
      ) : null}

      <header className="site-header">
        <button
          type="button"
          className="brand"
          onClick={openSchedule}
          aria-label="HOLO NOW 방송 일정 홈"
        >
          <span className="brand-mark" aria-hidden="true">
            <span />
            H
          </span>
          <span>
            <strong>HOLO NOW</strong>
            <small>hololive schedule archive</small>
          </span>
        </button>

        <nav className="primary-nav" aria-label="주요 페이지">
          {NAV_ITEMS.map((item) => (
            <button
              type="button"
              key={item.id}
              ref={view === item.id ? activeNavButtonRef : undefined}
              className={view === item.id ? "is-active" : ""}
              onClick={() =>
                item.id === "schedule" ? openSchedule() : setView(item.id)
              }
              aria-current={view === item.id ? "page" : undefined}
            >
              <span className="nav-full-label">{item.label}</span>
              <span className="nav-short-label">{item.shortLabel}</span>
            </button>
          ))}
        </nav>

        <a
          className="header-official-link"
          href={headerOfficialUrl}
          target="_blank"
          rel="noreferrer"
        >
          {headerOfficialLabel}
          <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </header>

      <main id="main-content">
        <section className={`hero hero-${view}`}>
          <div className="hero-glow hero-glow-one" aria-hidden="true" />
          <div className="hero-glow hero-glow-two" aria-hidden="true" />
          <div className="hero-copy">
            <span className="hero-eyebrow">
              <span className="spark-dot" />
              {currentMeta.eyebrow}
            </span>
            <h1>{currentMeta.title}</h1>
            <p>{currentMeta.description}</p>

            <div className="search-wrap">
              <Search size={21} aria-hidden="true" />
              <label className="sr-only" htmlFor="global-search">
                {view === "dream"
                  ? "홀로라이브 드림 수집 카드 검색"
                  : view === "music"
                    ? "멤버, 곡, 앨범 검색"
                    : isCollectionView(view)
                      ? "카드 번호, 멤버, 팩, 등급 검색"
                      : "멤버, 방송, 영상, 공연 검색"}
              </label>
              <input
                id="global-search"
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setQuery("");
                  }
                }}
                placeholder={
                  view === "dream"
                    ? "캐릭터 · 픽업 카드 검색"
                    : view === "music"
                      ? "멤버 · 곡 · 앨범 검색"
                      : isCollectionView(view)
                        ? "카드 번호 · 멤버 · 팩 · 등급 검색"
                        : "멤버 · 방송 · 영상 · 공연 검색"
                }
                autoComplete="off"
              />
              {query ? (
                <button
                  type="button"
                  className="search-clear"
                  onClick={() => setQuery("")}
                  aria-label="검색어 지우기"
                >
                  <X size={17} aria-hidden="true" />
                </button>
              ) : (
                <kbd>/</kbd>
              )}

              {view !== "dream" &&
              view !== "music" &&
              !isCollectionView(view) &&
              matchingTalents.length > 0 ? (
                <div className="search-popover" aria-label="멤버 검색 제안">
                  <span>멤버를 누르면 YouTube 라이브가 열립니다</span>
                  {matchingTalents.map((talent) => (
                    <button
                      type="button"
                      key={talent.id}
                      onClick={() => selectTalent(talent)}
                    >
                      <TalentAvatar talent={talent} size="small" />
                      <span>
                        <strong>{talent.nameKo}</strong>
                        <small>
                          {talent.name} · 영상{" "}
                          {youtubeCountByTalent.get(talent.id) ?? 0}개
                        </small>
                      </span>
                      <ArrowRight size={17} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {view === "dream" ? (
              <div className="hero-trust-row">
                <span>
                  <UsersRound size={15} aria-hidden="true" /> 공식 참여 멤버 54명
                </span>
                <span>
                  <Check size={15} aria-hidden="true" /> 이 브라우저에 자동 저장
                </span>
                <span>
                  <CalendarDays size={15} aria-hidden="true" /> 픽업 일정 · 기록
                </span>
              </div>
            ) : view === "music" ? (
              <div className="hero-trust-row">
                <span>
                  <UsersRound size={15} aria-hidden="true" />{" "}
                  {musicData?.members.length ?? 65}명 음악 기록
                </span>
                <span>
                  <Disc3 size={15} aria-hidden="true" /> 앨범 · 콜라보 · 커버
                </span>
                <span>
                  <Check size={15} aria-hidden="true" /> 공식 감상 링크
                </span>
              </div>
            ) : isCollectionView(view) ? (
              <div className="hero-trust-row">
                <span>
                  <Sparkles size={15} aria-hidden="true" />{" "}
                  {(activeCollectionData?.cards.length ?? 0).toLocaleString(
                    "ko-KR",
                  )}
                  장 카드 목록
                </span>
                <span>
                  <Check size={15} aria-hidden="true" /> 이 브라우저에 자동 저장
                </span>
                <span>
                  <History size={15} aria-hidden="true" /> 팩 · 등급별 정리
                </span>
              </div>
            ) : null}
          </div>

          <aside
            className="hero-dashboard"
            aria-label={
              view === "dream"
                ? "홀로라이브 드림 요약"
                : view === "music"
                  ? "홀로라이브 음악 아카이브 요약"
                  : isCollectionView(view)
                    ? view === "cards"
                      ? "홀로라이브 공식 카드게임 컬렉션 요약"
                      : "홀로라이브 웨하스 카드 컬렉션 요약"
                    : "오늘의 일정 요약"
            }
          >
            {view === "dream" ? (
              <>
                <div className="dashboard-heading">
                  <span>MY HOLOLIVE DREAMS</span>
                  <time>2026. 07. 23 출시</time>
                </div>
                <div className="dashboard-stats">
                  <div>
                    <UsersRound size={18} aria-hidden="true" />
                    <strong>{data?.hololiveDreams.characters.length ?? 54}</strong>
                    <span>참여 멤버</span>
                  </div>
                  <div>
                    <Sparkles size={18} aria-hidden="true" />
                    <strong>3</strong>
                    <span>★3 · ★4 · ★5</span>
                  </div>
                  <div>
                    <CalendarDays size={18} aria-hidden="true" />
                    <strong>{data?.hololiveDreams.pickups?.length ?? 1}</strong>
                    <span>픽업 기록</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="featured-solo dream-calculator-cta"
                  onClick={openDreamPickup}
                >
                  <CalendarDays size={30} aria-hidden="true" />
                  <span>
                    <small>
                      {dreamPickupHighlight.banner
                        ? `NOW PICKUP · ${
                            dreamPickupHighlight.banner.endsAt
                              ? `${DREAM_PICKUP_MOMENT_FORMATTER.format(
                                  new Date(
                                    dreamPickupHighlight.banner.endsAt,
                                  ),
                                )}까지`
                              : "진행 중"
                          }`
                        : "PICKUP ARCHIVE"}
                    </small>
                    <strong>
                      {dreamPickupHighlight.primary?.pickup.title ??
                        "픽업 일정 기록"}
                    </strong>
                    <em>
                      {dreamPickupHighlight.primary?.pickup.subtitle ??
                        "진행 중인 픽업과 지난 제공 비율을 확인해 보세요."}
                    </em>
                  </span>
                  <ArrowRight size={19} aria-hidden="true" />
                </button>
              </>
            ) : view === "music" ? (
              <>
                <div className="dashboard-heading">
                  <span>MEMBER MUSIC ARCHIVE</span>
                  <time>
                    {musicData?.checkedAt
                      ? `${UPDATE_FORMATTER.format(
                          new Date(musicData.checkedAt),
                        )} 확인`
                      : "데이터 준비 중"}
                  </time>
                </div>
                <div className="dashboard-stats">
                  <div>
                    <UsersRound size={18} aria-hidden="true" />
                    <strong>{musicData?.members.length ?? 0}</strong>
                    <span>현재 멤버</span>
                  </div>
                  <div>
                    <Music2 size={18} aria-hidden="true" />
                    <strong>{musicOriginalCount}</strong>
                    <span>오리지널 · 콜라보</span>
                  </div>
                  <div>
                    <Headphones size={18} aria-hidden="true" />
                    <strong>{musicCoverCount}</strong>
                    <span>커버곡</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="featured-solo music-library-cta"
                  onClick={openMusicArchive}
                >
                  <Disc3 size={30} aria-hidden="true" />
                  <span>
                    <small>{musicAlbumCount} ALBUM GROUPS</small>
                    <strong>멤버별 디스코그래피 열기</strong>
                    <em>곡 길이와 공식 감상 링크까지 확인하세요.</em>
                  </span>
                  <ArrowRight size={19} aria-hidden="true" />
                </button>
              </>
            ) : isCollectionView(view) ? (
              <>
                <div className="dashboard-heading">
                  <span>
                    {view === "cards"
                      ? "OFFICIAL CARD COLLECTION"
                      : "WAFER CARD COLLECTION"}
                  </span>
                  <time>
                    {activeCollectionData?.checkedAt
                      ? `${UPDATE_FORMATTER.format(
                          new Date(activeCollectionData.checkedAt),
                        )} 확인`
                      : "데이터 준비 중"}
                  </time>
                </div>
                <div className="dashboard-stats">
                  <div>
                    <History size={18} aria-hidden="true" />
                    <strong>{activeCollectionData?.releases.length ?? 0}</strong>
                    <span>팩 · 출시</span>
                  </div>
                  <div>
                    <Sparkles size={18} aria-hidden="true" />
                    <strong>
                      {(activeCollectionData?.cards.length ?? 0).toLocaleString(
                        "ko-KR",
                      )}
                    </strong>
                    <span>전체 카드</span>
                  </div>
                  <div>
                    <Check size={18} aria-hidden="true" />
                    <strong>{activeCollectionData?.rarities.length ?? 0}</strong>
                    <span>등급</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="featured-solo collection-library-cta"
                  onClick={() => {
                    if (activeCollectionView) {
                      openCollectionArchive(activeCollectionView);
                    }
                  }}
                >
                  <Sparkles size={30} aria-hidden="true" />
                  <span>
                    <small>MY CARD ARCHIVE</small>
                    <strong>
                      {view === "cards"
                        ? "공식 카드게임 컬렉션 열기"
                        : "웨하스 카드 컬렉션 열기"}
                    </strong>
                    <em>누르면 회색 카드가 컬러로 돌아옵니다.</em>
                  </span>
                  <ArrowRight size={19} aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                <div className="dashboard-heading">
                  <span>TODAY AT A GLANCE</span>
                  <time>{DATE_FORMATTER.format(now)}</time>
                </div>
                <div className="dashboard-stats">
                  <div>
                    <Radio size={18} aria-hidden="true" />
                    <strong>{liveNow.length}</strong>
                    <span>지금 LIVE</span>
                  </div>
                  <div>
                    <CalendarDays size={18} aria-hidden="true" />
                    <strong>
                      {(
                        data?.scheduleIndex.totalEntries ??
                        currentSchedule.length
                      ).toLocaleString("ko-KR")}
                    </strong>
                    <span>수집 방송</span>
                  </div>
                  <div>
                    <Video size={18} aria-hidden="true" />
                    <strong>{youtubeLives.length}</strong>
                    <span>라이브 영상</span>
                  </div>
                </div>

                {featuredSolo && featuredTalent ? (
                  <button
                    type="button"
                    className="featured-solo"
                    onClick={() => openConcertsForTalent(featuredTalent)}
                  >
                    <TalentAvatar talent={featuredTalent} size="medium" />
                    <span>
                      <small>NEXT CONCERT</small>
                      <strong>{featuredSolo.titleKo}</strong>
                      <em>
                        {featuredSolo.dateLabel} · {featuredSolo.venue}
                      </em>
                    </span>
                    <ArrowRight size={19} aria-hidden="true" />
                  </button>
                ) : (
                  <div className="featured-solo featured-solo-empty">
                    다음 솔로 라이브 발표를 기다리고 있어요.
                  </div>
                )}
              </>
            )}
          </aside>
        </section>

        {error ||
        archiveError ||
        (view === "music" && musicError) ||
        activeCollectionError ? (
          <div className="data-alert" role="alert">
            <Info size={20} aria-hidden="true" />
            <div>
              <strong>사이트 데이터를 불러오지 못했습니다.</strong>
              <p>
                {error ??
                  archiveError ??
                  (view === "music" ? musicError : null) ??
                  activeCollectionError}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDataReloadRequest((value) => value + 1);
                setCollectionReloadRequest((value) => value + 1);
              }}
            >
              다시 시도
            </button>
          </div>
        ) : null}

        {view === "schedule" ? (
          <section className="page-section schedule-page">
            <SectionHeading
              eyebrow="NOW & NEXT"
              title="방송 일정"
              description="Holodule의 hololive·English·Indonesia·DEV_IS 탭만 모아 15분 단위로 갱신합니다."
              action={
                data ? (
                  <span className="update-chip">
                    <span className="status-light" />
                    {UPDATE_FORMATTER.format(
                      new Date(data.schedule.generatedAt),
                    )}{" "}
                    갱신
                  </span>
                ) : null
              }
            />

            <div className="now-strip">
              <div className="now-block now-block-live">
                <div className="now-block-title">
                  <span>
                    <span className="pulse-dot" />
                    지금 방송 중
                  </span>
                  <strong>{liveNow.length}</strong>
                </div>
                {liveNow.length > 0 ? (
                  <div className="live-chips">
                    {liveNow.slice(0, 6).map((entry) => (
                      <a
                        key={entry.id}
                        href={entry.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {talentForBroadcast(entry)?.nameKo ?? entry.name}
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p>현재 표시된 라이브가 없습니다.</p>
                )}
              </div>

              <div className="now-block now-block-next">
                <span className="now-block-label">NEXT UP</span>
                {nextBroadcast ? (
                  <div>
                    <strong>
                      {talentForBroadcast(nextBroadcast)?.nameKo ??
                        nextBroadcast.name}
                    </strong>
                    <span>
                      {nextBroadcast.time} ·{" "}
                      {formatRelative(nextBroadcast.startsAt, now)}
                    </span>
                  </div>
                ) : (
                  <p>다음 방송을 확인하고 있습니다.</p>
                )}
              </div>
            </div>

            <div className="schedule-controls">
              <div className="schedule-date-picker">
                <div className="date-jump-control">
                  <button
                    type="button"
                    className="date-jump-trigger"
                    onClick={openDatePicker}
                  >
                    전체 기록
                  </button>
                  <input
                    ref={dateInputRef}
                    type="date"
                    aria-label="전체 방송 날짜 선택"
                    value={selectedDate}
                    min={dateOptions[0]?.value}
                    max={dateOptions.at(-1)?.value}
                    onChange={(event) =>
                      selectScheduleDate(event.target.value)
                    }
                  />
                </div>
                <div className="date-tabs" aria-label="방송 날짜 선택">
                  {visibleDateOptions.map((option) => {
                    const isActive = selectedDate === option.value;
                    return (
                      <button
                        type="button"
                        key={option.value}
                        ref={isActive ? activeDateButtonRef : undefined}
                        className={isActive ? "is-active" : ""}
                        aria-current={isActive ? "date" : undefined}
                        onClick={() => selectScheduleDate(option.value)}
                      >
                        <span>{option.label}</span>
                        <strong>{option.count}</strong>
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="switch-control">
                <input
                  type="checkbox"
                  checked={hideEnded}
                  onChange={(event) => setHideEnded(event.target.checked)}
                />
                <span aria-hidden="true" />
                종료 방송 숨기기
              </label>
            </div>

            {!data || archiveLoadingMonth === selectedDate.slice(0, 7) ? (
              <LoadingGrid />
            ) : visibleBroadcasts.length > 0 ? (
              <div className="card-grid broadcast-grid">
                {visibleBroadcasts.map((entry) => (
                  <BroadcastCard
                    key={entry.id}
                    entry={entry}
                    now={now}
                    talent={talentForBroadcast(entry)}
                    onTalentSelect={selectTalent}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="조건에 맞는 방송이 없어요"
                description="다른 날짜를 누르거나 검색어와 종료 방송 필터를 바꿔보세요."
              />
            )}

          </section>
        ) : null}

        {view === "concerts" ? (
          <section className="page-section" id="concert-archive">
            <SectionHeading
              eyebrow="OFFICIAL STAGES"
              title="콘서트 아카이브"
              description="공식 합동 공연과 정식·유료 솔로 공연을 예정·지난 공연으로 나누어 모았습니다."
              action={
                <div className="segmented-tabs" aria-label="콘서트 시기">
                  <button
                    type="button"
                    className={
                      concertPeriod === "upcoming" ? "is-active" : ""
                    }
                    onClick={() => setConcertPeriod("upcoming")}
                  >
                    예정 <span>{upcomingConcerts.length}</span>
                  </button>
                  <button
                    type="button"
                    className={concertPeriod === "past" ? "is-active" : ""}
                    onClick={() => setConcertPeriod("past")}
                  >
                    지난 공연 <span>{pastConcerts.length}</span>
                  </button>
                </div>
              }
            />

            {!data ? (
              <LoadingGrid />
            ) : visibleConcerts.length > 0 ? (
              <div className="event-grid concert-grid">
                {visibleConcerts.map((item) => {
                  if (item.kind === "event") {
                    return (
                      <EventCard
                        event={item.event}
                        now={now}
                        key={item.id}
                      />
                    );
                  }

                  const talent = talentById.get(item.live.memberId);
                  return talent ? (
                    <SoloCard
                      key={item.id}
                      live={item.live}
                      talent={talent}
                      now={now}
                      onTalentSelect={selectTalent}
                    />
                  ) : null;
                })}
              </div>
            ) : (
              <EmptyState
                title="검색 결과가 없습니다"
                description={`${
                  concertPeriod === "upcoming" ? "지난 공연" : "예정"
                } 탭을 확인하거나 공연명·출연 멤버의 다른 표기로 검색해 보세요.`}
              />
            )}

            <div className="source-banner">
              <Ticket size={18} aria-hidden="true" />
              <p>
                공식 이벤트와 정식·유료 솔로 공연 기록을 함께 표시합니다. 같은
                공연이 두 데이터에 있을 때는 공식 URL과 날짜·제목을 기준으로 한
                번만 보여드려요.
              </p>
            </div>
          </section>
        ) : null}

        {view === "solo" ? (
          <section
            className="page-section solo-page youtube-page"
            id="youtube-live-archive"
          >
            <SectionHeading
              eyebrow="FREE VIDEO ARCHIVE"
              title="YouTube 라이브 아카이브"
              description="공식 채널의 생일·주년·3D·무료 콘서트 영상을 멤버와 카테고리별로 찾아보세요."
              action={
                <span className="count-chip">
                  {visibleYoutubeLives.length}개 영상
                </span>
              }
            />

            <div className="archive-filter-bar">
              <div className="category-tabs" aria-label="영상 카테고리">
                {YOUTUBE_CATEGORY_OPTIONS.map((option) => {
                  const count =
                    option.id === "all"
                      ? selectedMemberId
                        ? youtubeCountByTalent.get(selectedMemberId) ?? 0
                        : youtubeLives.length
                      : youtubeCategoryCounts.get(option.id) ?? 0;

                  return (
                    <button
                      type="button"
                      key={option.id}
                      className={
                        youtubeCategory === option.id ? "is-active" : ""
                      }
                      onClick={() => setYoutubeCategory(option.id)}
                    >
                      {option.label} <span>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="talent-browser">
              <div className="talent-browser-heading">
                <div>
                  <strong>멤버 얼굴로 찾기</strong>
                  <span>
                    JP · DEV_IS · EN · ID 순서로 hololive 탤런트를 보여드려요.
                  </span>
                </div>
                {selectedTalent ? (
                  <button
                    type="button"
                    onClick={() => setSelectedMemberId("")}
                  >
                    전체 멤버 보기 <X size={15} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              <div className="talent-rail">
                {visibleYoutubeTalents.map((talent) => (
                  <button
                    type="button"
                    key={talent.id}
                    className={
                      selectedMemberId === talent.id ? "is-selected" : ""
                    }
                    style={
                      { "--talent-accent": talent.accent } as CSSProperties
                    }
                    onClick={() => selectTalent(talent)}
                    aria-label={`${talent.nameKo} YouTube 라이브 보기`}
                    aria-pressed={selectedMemberId === talent.id}
                  >
                    <TalentAvatar talent={talent} size="large" />
                    <strong>{talent.nameKo}</strong>
                    <span>
                      {youtubeCountByTalent.get(talent.id) ?? 0}개 영상
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {selectedTalent ? (
              <div
                className="member-archive-heading"
                style={
                  { "--talent-accent": selectedTalent.accent } as CSSProperties
                }
              >
                <TalentAvatar talent={selectedTalent} size="large" />
                <div>
                  <span>
                    {selectedTalent.branch} · {selectedTalent.generation}
                  </span>
                  <h3>{selectedTalent.nameKo}</h3>
                  <p>
                    {selectedTalent.nativeName} · {selectedTalent.name}
                  </p>
                </div>
                <div className="member-archive-stat">
                  <strong>
                    {youtubeCountByTalent.get(selectedTalent.id) ?? 0}
                  </strong>
                  <span>YouTube 라이브</span>
                </div>
                <a
                  href={selectedTalent.officialProfileUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  공식 프로필 <ArrowUpRight size={15} aria-hidden="true" />
                </a>
              </div>
            ) : null}

            {!data ? (
              <LoadingGrid />
            ) : visibleYoutubeLives.length > 0 ? (
              <div className="youtube-live-grid">
                {visibleYoutubeLives.map((live) => {
                  const associatedTalents = live.memberIds
                    .map((talentId) => talentById.get(talentId))
                    .filter((talent): talent is Talent => Boolean(talent));

                  return (
                    <YouTubeLiveCard
                      key={live.videoId}
                      live={live}
                      talents={associatedTalents}
                      onTalentSelect={selectTalent}
                    />
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title={
                  selectedTalent
                    ? `${selectedTalent.nameKo}의 조건에 맞는 영상이 없어요`
                    : "조건에 맞는 YouTube 라이브가 없어요"
                }
                description="검색어를 지우거나 다른 멤버·카테고리를 선택해 보세요."
              />
            )}

            <div className="source-banner source-banner-solo">
              <Video size={18} aria-hidden="true" />
              <p>
                공식 공개 YouTube 채널에서 무료로 볼 수 있는 라이브 영상을
                정리했습니다. 정식·유료 솔로 공연은 콘서트 탭에서 확인할 수
                있으며, 전체 로스터는{" "}
                <a
                  href={OFFICIAL_TALENTS_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  hololive 공식 탤런트 페이지
                </a>
                를 기준으로 합니다.
                {data?.youtubeLives.checkedAt
                  ? ` · ${UPDATE_FORMATTER.format(
                      new Date(data.youtubeLives.checkedAt),
                    )} 확인`
                  : ""}
              </p>
            </div>
          </section>
        ) : null}

        {view === "local" ? (
          <section className="page-section">
            <SectionHeading
              eyebrow="OFFLINE & COLLAB"
              title="일본 · 한국 현지 일정"
              description="진행·예정 행사는 지역별로 보고, 기간이 지난 행사는 종료 기록에서 다시 볼 수 있습니다."
              action={
                <div
                  className="region-tabs"
                  aria-label="현지 일정 지역과 상태 선택"
                >
                  {(["ALL", "JP", "KR", "ENDED"] as const).map((item) => (
                    <button
                      type="button"
                      key={item}
                      className={`${region === item ? "is-active" : ""}${
                        item === "ENDED" ? " is-ended" : ""
                      }`}
                      onClick={() => setRegion(item)}
                    >
                      {item === "ALL"
                        ? "전체"
                        : item === "JP"
                          ? "일본"
                          : item === "KR"
                            ? "한국"
                            : "종료"}
                    </button>
                  ))}
                </div>
              }
            />

            {!data ? (
              <LoadingGrid />
            ) : localEvents.length > 0 ? (
              <div className="event-grid">
                {localEvents.map((event) => (
                  <EventCard
                    event={event}
                    now={now}
                    kind="local"
                    key={event.id}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title={
                  region === "ENDED"
                    ? "조건에 맞는 종료 행사가 없습니다"
                    : "조건에 맞는 현지 행사가 없습니다"
                }
                description={
                  region === "ENDED"
                    ? "검색어를 지우면 보관된 종료 행사 전체를 볼 수 있습니다."
                    : "다른 지역을 선택하거나 검색어를 지워보세요."
                }
              />
            )}

            <div className="local-tip">
              <Globe2 size={21} aria-hidden="true" />
              <div>
                <strong>현지 방문 전 공식 페이지를 확인해 주세요.</strong>
                <p>
                  운영 시간, 입장 방법, 재고와 출연 정보는 예고 없이 바뀔 수
                  있습니다.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {view === "music" ? (
          data && musicData ? (
            <MusicPage
              payload={musicData}
              talents={talents}
              query={query}
              selectedMemberId={selectedMemberId}
              onSelectedMemberChange={setSelectedMemberId}
            />
          ) : (
            <section className="page-section" id="hololive-music">
              <LoadingGrid />
            </section>
          )
        ) : null}

        {isCollectionView(view) ? (
          activeCollectionData ? (
            <CollectionCatalogPage
              key={view}
              kind={view}
              payload={activeCollectionData}
              query={query}
              talents={talents}
            />
          ) : (
            <section
              className="page-section"
              id={
                view === "cards" ? "hololive-card-game" : "hololive-wafer"
              }
            >
              <LoadingGrid />
            </section>
          )
        ) : null}

        {view === "dream" ? (
          data ? (
            <DreamPage
              payload={data.hololiveDreams}
              talents={talents}
              query={query}
              panel={dreamPanel}
              now={now}
              onPanelChange={setDreamPanel}
            />
          ) : (
            <section className="page-section" id="hololive-dream">
              <LoadingGrid />
            </section>
          )
        ) : null}
      </main>

      <footer>
        <div className="footer-brand">
          <span className="brand-mark" aria-hidden="true">
            H
          </span>
          <div>
            <strong>HOLO NOW</strong>
            <p>팬이 만든 비공식 무료 일정 아카이브</p>
          </div>
        </div>
        <div className="footer-links">
          <a href={OFFICIAL_SCHEDULE_URL} target="_blank" rel="noreferrer">
            Holodule <ExternalLink size={14} aria-hidden="true" />
          </a>
          <a href={OFFICIAL_TALENTS_URL} target="_blank" rel="noreferrer">
            공식 탤런트 <ExternalLink size={14} aria-hidden="true" />
          </a>
          <a href={OFFICIAL_MUSIC_URL} target="_blank" rel="noreferrer">
            공식 음악 <ExternalLink size={14} aria-hidden="true" />
          </a>
          <a href={OFFICIAL_DREAMS_URL} target="_blank" rel="noreferrer">
            공식 게임 <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
        <p className="disclaimer">
          hololive 및 각 탤런트의 권리는 COVER Corp.에 있습니다. 이 사이트는
          공식 서비스가 아니며, 공개된 공식 링크를 정리해 제공합니다.
        </p>
      </footer>
    </div>
  );
}
