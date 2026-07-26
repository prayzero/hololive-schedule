import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  Globe2,
  History,
  Info,
  MapPin,
  Radio,
  Search,
  Sparkles,
  Ticket,
  UsersRound,
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
import type {
  CuratedEvent,
  EventRegion,
  EventsPayload,
  ScheduleEntry,
  SchedulePayload,
  SoloLive,
  SoloLivesPayload,
  Talent,
  TalentsPayload,
} from "./types";

const BASE_URL = import.meta.env.BASE_URL;
const DATA_URLS = {
  schedule: `${BASE_URL}data/schedule.json`,
  events: `${BASE_URL}data/events.json`,
  talents: `${BASE_URL}data/talents.json`,
  solos: `${BASE_URL}data/solo-lives.json`,
};
const OFFICIAL_SCHEDULE_URL = "https://schedule.hololive.tv/lives/hololive";
const OFFICIAL_TALENTS_URL = "https://hololive.hololivepro.com/en/talents";

type PageView = "schedule" | "concerts" | "solo" | "local";
type SoloPeriod = "upcoming" | "past";
type BroadcastStatus = "live" | "upcoming" | "ended";
type EventStatus = "ongoing" | "upcoming" | "ended";

interface LoadedData {
  schedule: SchedulePayload;
  events: EventsPayload;
  talents: TalentsPayload;
  solos: SoloLivesPayload;
}

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
      "hololive JP·EN·ID·DEV_IS 여성 탤런트의 방송을 한국 시간으로 모았습니다.",
  },
  concerts: {
    eyebrow: "CONCERT CALENDAR",
    title: "무대 위의 순간을 놓치지 않게.",
    description:
      "공식 합동 공연과 페스티벌, 상영 일정을 큰 썸네일과 함께 확인하세요.",
  },
  solo: {
    eyebrow: "SOLO LIVE ARCHIVE",
    title: "한 사람의 무대, 처음부터 지금까지.",
    description:
      "예정된 솔로 라이브와 지난 공연을 나누어 보고, 멤버 얼굴을 눌러 개인 이력을 펼쳐보세요.",
  },
  local: {
    eyebrow: "JP · KR LOCAL",
    title: "일본과 한국에서 만나는 홀로라이브.",
    description:
      "팝업, 전시, 카페, 카드게임 등 공식 현지 콜라보를 지역별로 정리했습니다.",
  },
};

const NAV_ITEMS: Array<{ id: PageView; label: string; shortLabel: string }> = [
  { id: "schedule", label: "방송 일정", shortLabel: "방송" },
  { id: "concerts", label: "콘서트", shortLabel: "공연" },
  { id: "solo", label: "솔로 라이브", shortLabel: "솔로" },
  { id: "local", label: "일본·한국", shortLabel: "현지" },
];

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

function paramValue(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

function initialView(): PageView {
  const value = paramValue("view");
  return NAV_ITEMS.some(({ id }) => id === value)
    ? (value as PageView)
    : "schedule";
}

function initialSoloPeriod(): SoloPeriod {
  return paramValue("solo") === "past" ? "past" : "upcoming";
}

function dateKey(date: Date): string {
  return DATE_KEY_FORMATTER.format(date);
}

function normalizeSearch(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, "");
}

function includesQuery(
  values: Array<string | null | undefined>,
  normalizedQuery: string,
): boolean {
  if (!normalizedQuery) {
    return true;
  }

  return values.some((value) =>
    normalizeSearch(String(value ?? "")).includes(normalizedQuery),
  );
}

function soloTalentIds(live: SoloLive): string[] {
  return [live.memberId, ...(live.relatedMemberIds ?? [])];
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

function isFemaleScheduleEntry(entry: ScheduleEntry): boolean {
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
              aria-label={`${talent.nameKo} 솔로 라이브 이력 보기`}
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
          aria-label={`${talent.nameKo}의 솔로 라이브 이력만 보기`}
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(() => new Date());
  const [view, setView] = useState<PageView>(initialView);
  const [query, setQuery] = useState(() => paramValue("q") ?? "");
  const [selectedDate, setSelectedDate] = useState(
    () => paramValue("day") ?? dateKey(new Date()),
  );
  const [hideEnded, setHideEnded] = useState(true);
  const [soloPeriod, setSoloPeriod] =
    useState<SoloPeriod>(initialSoloPeriod);
  const [selectedMemberId, setSelectedMemberId] = useState(
    () => paramValue("member") ?? "",
  );
  const [region, setRegion] = useState<"ALL" | "JP" | "KR">(() => {
    const value = paramValue("region");
    return value === "JP" || value === "KR" ? value : "ALL";
  });

  useEffect(() => {
    const controller = new AbortController();

    async function loadData() {
      try {
        const [scheduleResponse, eventsResponse, talentsResponse, solosResponse] =
          await Promise.all([
            fetch(DATA_URLS.schedule, {
              cache: "no-store",
              signal: controller.signal,
            }),
            fetch(DATA_URLS.events, { signal: controller.signal }),
            fetch(DATA_URLS.talents, { signal: controller.signal }),
            fetch(DATA_URLS.solos, { signal: controller.signal }),
          ]);

        const responses = [
          scheduleResponse,
          eventsResponse,
          talentsResponse,
          solosResponse,
        ];

        if (responses.some((response) => !response.ok)) {
          throw new Error("일정 데이터 일부를 불러오지 못했습니다.");
        }

        const [schedule, events, talents, solos] = await Promise.all([
          scheduleResponse.json() as Promise<SchedulePayload>,
          eventsResponse.json() as Promise<EventsPayload>,
          talentsResponse.json() as Promise<TalentsPayload>,
          solosResponse.json() as Promise<SoloLivesPayload>,
        ]);

        setData({ schedule, events, talents, solos });
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "일정을 불러오지 못했습니다.",
          );
        }
      }
    }

    void loadData();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

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
    const params = new URLSearchParams();
    params.set("view", view);

    if (query.trim()) {
      params.set("q", query.trim());
    }

    if (view === "schedule" && selectedDate) {
      params.set("day", selectedDate);
    }

    if (view === "solo") {
      params.set("solo", soloPeriod);
      if (selectedMemberId) {
        params.set("member", selectedMemberId);
      }
    }

    if (view === "local" && region !== "ALL") {
      params.set("region", region);
    }

    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params.toString()}`,
    );
    document.title = `${PAGE_META[view].title} | HOLO NOW`;
  }, [query, region, selectedDate, selectedMemberId, soloPeriod, view]);

  const talents = data?.talents.talents ?? [];
  const soloLives = data?.solos.lives ?? [];
  const normalizedQuery = normalizeSearch(query);

  const talentById = useMemo(
    () => new Map(talents.map((talent) => [talent.id, talent])),
    [talents],
  );

  const soloCountByTalent = useMemo(() => {
    const counts = new Map<string, number>();
    soloLives.forEach((live) => {
      soloTalentIds(live).forEach((talentId) => {
        counts.set(talentId, (counts.get(talentId) ?? 0) + 1);
      });
    });
    return counts;
  }, [soloLives]);

  const archiveTalents = useMemo(
    () =>
      talents
        .filter((talent) => soloCountByTalent.has(talent.id))
        .sort((left, right) => {
          const leftUpcoming = soloLives.some(
            (live) =>
              soloTalentIds(live).includes(left.id) &&
              new Date(live.endsAt).getTime() >= now.getTime(),
          );
          const rightUpcoming = soloLives.some(
            (live) =>
              soloTalentIds(live).includes(right.id) &&
              new Date(live.endsAt).getTime() >= now.getTime(),
          );

          return (
            Number(rightUpcoming) - Number(leftUpcoming) ||
            left.nameKo.localeCompare(right.nameKo, "ko")
          );
        }),
    [now, soloCountByTalent, soloLives, talents],
  );

  const matchingTalents = useMemo(
    () =>
      normalizedQuery
        ? archiveTalents
            .filter((talent) =>
              includesQuery(talentSearchValues(talent), normalizedQuery),
            )
            .slice(0, 6)
        : [],
    [archiveTalents, normalizedQuery],
  );

  const femaleSchedule = useMemo(
    () =>
      (data?.schedule.entries ?? []).filter(isFemaleScheduleEntry).sort((a, b) =>
        String(a.startsAt ?? "").localeCompare(String(b.startsAt ?? "")),
      ),
    [data?.schedule.entries],
  );

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
    const uniqueDates = Array.from(
      new Set(
        femaleSchedule
          .map((entry) => entry.date)
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort();

    return uniqueDates.map((value) => {
      const count = femaleSchedule.filter((entry) => entry.date === value).length;
      const parsed = new Date(`${value}T12:00:00+09:00`);
      return { value, label: DAY_FORMATTER.format(parsed), count };
    });
  }, [femaleSchedule]);

  useEffect(() => {
    if (
      dateOptions.length > 0 &&
      !dateOptions.some((option) => option.value === selectedDate)
    ) {
      const today = dateKey(new Date());
      setSelectedDate(
        dateOptions.find((option) => option.value === today)?.value ??
          dateOptions[0].value,
      );
    }
  }, [dateOptions, selectedDate]);

  const visibleBroadcasts = useMemo(
    () =>
      femaleSchedule.filter((entry) => {
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
    [femaleSchedule, hideEnded, normalizedQuery, now, selectedDate],
  );

  const liveNow = useMemo(
    () =>
      femaleSchedule.filter(
        (entry) => broadcastStatus(entry, now) === "live",
      ),
    [femaleSchedule, now],
  );

  const nextBroadcast = useMemo(
    () =>
      femaleSchedule.find(
        (entry) => broadcastStatus(entry, now) === "upcoming",
      ),
    [femaleSchedule, now],
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

  const pastSoloLives = useMemo(
    () =>
      soloLives
        .filter((live) => new Date(live.endsAt).getTime() < now.getTime())
        .sort(
          (left, right) =>
            new Date(right.startsAt).getTime() -
            new Date(left.startsAt).getTime(),
        ),
    [now, soloLives],
  );

  const selectedTalent = selectedMemberId
    ? talentById.get(selectedMemberId)
    : undefined;

  const periodSoloLives =
    soloPeriod === "upcoming" ? upcomingSoloLives : pastSoloLives;

  const visibleSoloLives = useMemo(
    () =>
      periodSoloLives.filter((live) => {
        const associatedTalentIds = soloTalentIds(live);

        if (
          selectedMemberId &&
          !associatedTalentIds.includes(selectedMemberId)
        ) {
          return false;
        }

        const associatedTalents = associatedTalentIds
          .map((talentId) => talentById.get(talentId))
          .filter((talent): talent is Talent => Boolean(talent));

        return includesQuery(
          [
            live.title,
            live.titleKo,
            live.city,
            live.venue,
            ...associatedTalents.flatMap(talentSearchValues),
          ],
          normalizedQuery,
        );
      }),
    [
      normalizedQuery,
      periodSoloLives,
      selectedMemberId,
      talentById,
    ],
  );

  const visibleArchiveTalents = useMemo(
    () =>
      normalizedQuery
        ? archiveTalents.filter((talent) =>
            includesQuery(talentSearchValues(talent), normalizedQuery),
          )
        : archiveTalents,
    [archiveTalents, normalizedQuery],
  );

  const concertEvents = useMemo(
    () =>
      (data?.events.events ?? [])
        .filter(
          (event) =>
            event.categories.includes("concert") &&
            !event.categories.includes("solo") &&
            new Date(event.endsAt).getTime() >= now.getTime(),
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
        .sort(
          (left, right) =>
            new Date(left.startsAt).getTime() -
            new Date(right.startsAt).getTime(),
        ),
    [data?.events.events, normalizedQuery, now],
  );

  const localEvents = useMemo(
    () =>
      (data?.events.events ?? [])
        .filter(
          (event) =>
            (event.region === "JP" || event.region === "KR") &&
            (event.categories.includes("collaboration") ||
              event.categories.includes("exhibition") ||
              event.categories.includes("festival")) &&
            new Date(event.endsAt).getTime() >= now.getTime(),
        )
        .filter((event) => region === "ALL" || event.region === region)
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
    const talentLives = soloLives.filter(
      (live) => soloTalentIds(live).includes(talent.id),
    );
    const hasUpcoming = talentLives.some(
      (live) => new Date(live.endsAt).getTime() >= now.getTime(),
    );

    setView("solo");
    setSelectedMemberId(talent.id);
    setSoloPeriod(hasUpcoming ? "upcoming" : "past");
    setQuery("");
    window.setTimeout(() => {
      document
        .getElementById("solo-archive")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  const currentMeta = PAGE_META[view];

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>

      <header className="site-header">
        <button
          type="button"
          className="brand"
          onClick={() => setView("schedule")}
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
              className={view === item.id ? "is-active" : ""}
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? "page" : undefined}
            >
              <span className="nav-full-label">{item.label}</span>
              <span className="nav-short-label">{item.shortLabel}</span>
            </button>
          ))}
        </nav>

        <a
          className="header-official-link"
          href={OFFICIAL_SCHEDULE_URL}
          target="_blank"
          rel="noreferrer"
        >
          공식 일정
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
                멤버, 방송, 공연 검색
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
                placeholder="멤버 · 방송 · 공연 검색"
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

              {matchingTalents.length > 0 ? (
                <div className="search-popover" role="listbox">
                  <span>멤버를 누르면 솔로 공연 이력이 열립니다</span>
                  {matchingTalents.map((talent) => (
                    <button
                      type="button"
                      key={talent.id}
                      onClick={() => selectTalent(talent)}
                      role="option"
                      aria-selected="false"
                    >
                      <TalentAvatar talent={talent} size="small" />
                      <span>
                        <strong>{talent.nameKo}</strong>
                        <small>
                          {talent.name} · 공연 {soloCountByTalent.get(talent.id)}
                          건
                        </small>
                      </span>
                      <ArrowRight size={17} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="hero-trust-row">
              <span>
                <Check size={15} aria-hidden="true" /> 여성 탤런트 전용
              </span>
              <span>
                <Globe2 size={15} aria-hidden="true" /> KST · JST
              </span>
              <span>
                <Sparkles size={15} aria-hidden="true" /> 무료 자동 업데이트
              </span>
            </div>
          </div>

          <aside className="hero-dashboard" aria-label="오늘의 일정 요약">
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
                <strong>{femaleSchedule.length}</strong>
                <span>수집 방송</span>
              </div>
              <div>
                <History size={18} aria-hidden="true" />
                <strong>{pastSoloLives.length}</strong>
                <span>지난 솔로</span>
              </div>
            </div>

            {featuredSolo && featuredTalent ? (
              <button
                type="button"
                className="featured-solo"
                onClick={() => selectTalent(featuredTalent)}
              >
                <TalentAvatar talent={featuredTalent} size="medium" />
                <span>
                  <small>NEXT SOLO LIVE</small>
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
          </aside>
        </section>

        {error ? (
          <div className="data-alert" role="alert">
            <Info size={20} aria-hidden="true" />
            <div>
              <strong>일정 데이터를 불러오지 못했습니다.</strong>
              <p>{error} 잠시 뒤 새로고침해 주세요.</p>
            </div>
          </div>
        ) : null}

        {view === "schedule" ? (
          <section className="page-section schedule-page">
            <SectionHeading
              eyebrow="NOW & NEXT"
              title="여성 탤런트 방송 일정"
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
              <div className="date-tabs" aria-label="방송 날짜 선택">
                {dateOptions.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className={
                      selectedDate === option.value ? "is-active" : ""
                    }
                    onClick={() => setSelectedDate(option.value)}
                  >
                    <span>{option.label}</span>
                    <strong>{option.count}</strong>
                  </button>
                ))}
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

            {!data ? (
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

            <div className="source-banner">
              <Info size={18} aria-hidden="true" />
              <p>
                남성 그룹(HOLOSTARS)은 수집하지 않습니다. 방송 시간은 변경될
                수 있으니 시청 전{" "}
                <a
                  href={OFFICIAL_SCHEDULE_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  공식 Holodule
                </a>
                에서 한 번 더 확인해 주세요.
              </p>
            </div>
          </section>
        ) : null}

        {view === "concerts" ? (
          <section className="page-section">
            <SectionHeading
              eyebrow="UPCOMING STAGES"
              title="콘서트 · 페스티벌"
              description="솔로 공연은 별도 아카이브에, 이곳에는 합동 무대와 공식 상영 일정을 모았습니다."
              action={<span className="count-chip">{concertEvents.length}건</span>}
            />

            {!data ? (
              <LoadingGrid />
            ) : concertEvents.length > 0 ? (
              <div className="event-grid">
                {concertEvents.map((event) => (
                  <EventCard event={event} now={now} key={event.id} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="검색 결과가 없습니다"
                description="공연명이나 출연 멤버의 다른 표기로 검색해 보세요."
              />
            )}
          </section>
        ) : null}

        {view === "solo" ? (
          <section className="page-section solo-page" id="solo-archive">
            <SectionHeading
              eyebrow="MEMBER HISTORY"
              title="솔로 라이브 아카이브"
              description="공식 페이지에서 확인 가능한 주요 단독·원맨 공연을 멤버별로 연결했습니다."
              action={
                <div className="segmented-tabs" aria-label="솔로 공연 시기">
                  <button
                    type="button"
                    className={soloPeriod === "upcoming" ? "is-active" : ""}
                    onClick={() => setSoloPeriod("upcoming")}
                  >
                    예정 <span>{upcomingSoloLives.length}</span>
                  </button>
                  <button
                    type="button"
                    className={soloPeriod === "past" ? "is-active" : ""}
                    onClick={() => setSoloPeriod("past")}
                  >
                    지난 공연 <span>{pastSoloLives.length}</span>
                  </button>
                </div>
              }
            />

            <div className="talent-browser">
              <div className="talent-browser-heading">
                <div>
                  <strong>멤버 얼굴로 찾기</strong>
                  <span>누르면 해당 멤버의 공연 기록만 보여드려요.</span>
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
                {visibleArchiveTalents.map((talent) => (
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
                    aria-label={`${talent.nameKo} 솔로 라이브 이력 보기`}
                    aria-pressed={selectedMemberId === talent.id}
                  >
                    <TalentAvatar talent={talent} size="large" />
                    <strong>{talent.nameKo}</strong>
                    <span>{soloCountByTalent.get(talent.id)} stages</span>
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
                  <strong>{soloCountByTalent.get(selectedTalent.id)}</strong>
                  <span>공식 공연 기록</span>
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
            ) : visibleSoloLives.length > 0 ? (
              <div className="solo-grid">
                {visibleSoloLives.map((live) => {
                  const talent =
                    selectedTalent &&
                    soloTalentIds(live).includes(selectedTalent.id)
                      ? selectedTalent
                      : talentById.get(live.memberId);
                  return talent ? (
                    <SoloCard
                      key={live.id}
                      live={live}
                      talent={talent}
                      now={now}
                      onTalentSelect={selectTalent}
                    />
                  ) : null;
                })}
              </div>
            ) : (
              <EmptyState
                title={
                  selectedTalent
                    ? `${selectedTalent.nameKo}의 ${
                        soloPeriod === "past" ? "지난" : "예정"
                      } 공연이 없어요`
                    : "조건에 맞는 솔로 공연이 없어요"
                }
                description={
                  selectedTalent
                    ? `‘${
                        soloPeriod === "past" ? "예정" : "지난 공연"
                      }’ 탭도 확인해 보세요.`
                    : "검색어를 지우거나 다른 탭을 선택해 보세요."
                }
              />
            )}

            <div className="source-banner source-banner-solo">
              <History size={18} aria-hidden="true" />
              <p>
                일반 생일 3D 라이브가 아닌, 공식 페이지에서 단독·원맨 공연으로
                확인되는 주요 기록을 정리했습니다. 전체 로스터는{" "}
                <a
                  href={OFFICIAL_TALENTS_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  hololive 공식 탤런트 페이지
                </a>
                를 기준으로 합니다.
              </p>
            </div>
          </section>
        ) : null}

        {view === "local" ? (
          <section className="page-section">
            <SectionHeading
              eyebrow="OFFLINE & COLLAB"
              title="일본 · 한국 현지 일정"
              description="공식 공지와 협업사 페이지에서 기간과 장소가 확인된 행사만 실었습니다."
              action={
                <div className="region-tabs" aria-label="지역 선택">
                  {(["ALL", "JP", "KR"] as const).map((item) => (
                    <button
                      type="button"
                      key={item}
                      className={region === item ? "is-active" : ""}
                      onClick={() => setRegion(item)}
                    >
                      {item === "ALL"
                        ? "전체"
                        : item === "JP"
                          ? "일본"
                          : "한국"}
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
                title="조건에 맞는 현지 행사가 없습니다"
                description="다른 지역을 선택하거나 검색어를 지워보세요."
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
        </div>
        <p className="disclaimer">
          hololive 및 각 탤런트의 권리는 COVER Corp.에 있습니다. 이 사이트는
          공식 서비스가 아니며, 공개된 공식 링크를 정리해 제공합니다.
        </p>
      </footer>
    </div>
  );
}
