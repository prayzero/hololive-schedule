import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  CirclePlay,
  CircleDot,
  Clock3,
  ExternalLink,
  Globe2,
  Info,
  MapPin,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  Ticket,
  UsersRound,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import type {
  CuratedEvent,
  EventRegion,
  EventsPayload,
  ScheduleEntry,
  SchedulePayload,
} from "./types";

const BASE_URL = import.meta.env.BASE_URL;
const SCHEDULE_URL = `${BASE_URL}data/schedule.json`;
const EVENTS_URL = `${BASE_URL}data/events.json`;
const OFFICIAL_SCHEDULE_URL = "https://schedule.hololive.tv/lives/all";
const DATE_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
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
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

type BroadcastStatus = "live" | "upcoming" | "ended";
type EventStatus = "ongoing" | "upcoming" | "ended";

interface LoadState {
  schedule: SchedulePayload | null;
  events: EventsPayload | null;
  error: string | null;
  loading: boolean;
}

interface IconTextProps {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  children: ReactNode;
}

function dateKey(date: Date): string {
  return DATE_KEY_FORMATTER.format(date);
}

function broadcastStatus(entry: ScheduleEntry, now: Date): BroadcastStatus {
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

function eventStatus(event: CuratedEvent, now: Date): EventStatus {
  const current = now.getTime();
  const start = new Date(event.startsAt).getTime();
  const end = new Date(event.endsAt).getTime();

  if (current < start) {
    return "upcoming";
  }

  if (current <= end) {
    return "ongoing";
  }

  return "ended";
}

function isRelevantEvent(event: CuratedEvent, now: Date): boolean {
  if (eventStatus(event, now) !== "ended") {
    return true;
  }

  const sevenDays = 7 * 24 * 60 * 60 * 1_000;
  return now.getTime() - new Date(event.endsAt).getTime() <= sevenDays;
}

function formatRelative(startsAt: string | null, now: Date): string {
  if (!startsAt) {
    return "시간 확인 중";
  }

  const minutes = Math.round(
    (new Date(startsAt).getTime() - now.getTime()) / 60_000,
  );

  if (minutes <= 0) {
    return "시작 시각 경과";
  }

  if (minutes < 60) {
    return `${minutes}분 후`;
  }

  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder > 0 ? `${hours}시간 ${remainder}분 후` : `${hours}시간 후`;
  }

  return `${Math.ceil(minutes / (24 * 60))}일 후`;
}

function scheduleDayLabel(value: string): string {
  return DAY_LABEL_FORMATTER.format(new Date(`${value}T12:00:00+09:00`));
}

function statusLabel(status: BroadcastStatus): string {
  if (status === "live") return "LIVE";
  if (status === "upcoming") return "예정";
  return "종료";
}

function eventStatusLabel(status: EventStatus): string {
  if (status === "ongoing") return "진행 중";
  if (status === "upcoming") return "예정";
  return "종료";
}

function regionLabel(region: EventRegion): string {
  if (region === "JP") return "일본";
  if (region === "KR") return "한국";
  return "글로벌";
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase("ko");
}

function includesQuery(values: Array<string | null | undefined>, query: string) {
  if (!query) return true;
  return values.some((value) => value?.toLocaleLowerCase("ko").includes(query));
}

function IconText({ icon: Icon, children }: IconTextProps) {
  return (
    <span className="icon-text">
      <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
      {children}
    </span>
  );
}

function ImageFrame({
  src,
  alt,
  fallback,
  eager = false,
}: {
  src: string | null;
  alt: string;
  fallback: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className={`image-frame${failed || !src ? " is-fallback" : ""}`}>
      {!failed && src ? (
        <img
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="image-fallback" aria-label={`${alt} 이미지 없음`}>
          <span>{fallback.slice(0, 2).toUpperCase()}</span>
          <Sparkles size={24} aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

function BroadcastCard({
  entry,
  now,
}: {
  entry: ScheduleEntry;
  now: Date;
}) {
  const status = broadcastStatus(entry, now);
  const title = entry.title || `${entry.name || "hololive"} 방송`;
  const start = entry.startsAt ? new Date(entry.startsAt) : null;

  return (
    <article className={`broadcast-card status-${status}`}>
      <div className="card-media">
        <ImageFrame
          src={entry.thumbnail}
          alt={`${entry.name} — ${title} 썸네일`}
          fallback={entry.name || "HL"}
        />
        <span className={`status-badge status-${status}`}>
          {status === "live" && <span className="live-dot" aria-hidden="true" />}
          {statusLabel(status)}
        </span>
        {entry.avatar && (
          <img
            className="channel-avatar"
            src={entry.avatar}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        )}
      </div>
      <div className="broadcast-body">
        <div className="card-kicker">
          <time dateTime={entry.startsAt ?? undefined}>
            {start ? TIME_FORMATTER.format(start) : entry.time || "시간 미정"}{" "}
            KST·JST
          </time>
          {status === "upcoming" && (
            <span>{formatRelative(entry.startsAt, now)}</span>
          )}
        </div>
        <h3>{title}</h3>
        <p className="member-line">{entry.name || "채널 확인 중"}</p>
        <a
          className="card-link"
          href={entry.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`${entry.name} 방송을 YouTube에서 보기`}
        >
          <CirclePlay size={17} aria-hidden="true" />
          YouTube에서 보기
          <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}

function EventCard({
  event,
  now,
  featured = false,
}: {
  event: CuratedEvent;
  now: Date;
  featured?: boolean;
}) {
  const status = eventStatus(event, now);

  return (
    <article
      className={`event-card${featured ? " is-featured" : ""} status-${status}`}
    >
      <div className="event-media">
        <ImageFrame
          src={event.imageUrl}
          alt={`${event.titleKo} 공식 이미지`}
          fallback={event.titleKo}
        />
        <div className="event-badges">
          <span className={`status-badge status-${status}`}>
            {status === "ongoing" && (
              <span className="live-dot" aria-hidden="true" />
            )}
            {eventStatusLabel(status)}
          </span>
          <span className={`region-badge region-${event.region.toLowerCase()}`}>
            {event.region} · {regionLabel(event.region)}
          </span>
        </div>
      </div>
      <div className="event-body">
        <p className="event-date">
          <CalendarDays size={16} aria-hidden="true" />
          <time dateTime={event.startsAt}>{event.dateLabel}</time>
        </p>
        <h3>{event.titleKo}</h3>
        <p className="event-original" lang="ja">
          {event.title}
        </p>
        <div className="event-meta">
          <IconText icon={Clock3}>{event.timeLabel}</IconText>
          <IconText icon={MapPin}>
            {event.city} · {event.venue}
          </IconText>
          <IconText icon={Ticket}>{event.format}</IconText>
        </div>
        <p className="event-description">{event.description}</p>
        <div className="participant-row">
          <UsersRound size={15} aria-hidden="true" />
          <span>{event.participants.join(" · ")}</span>
        </div>
        <div className="event-footer">
          {event.note && (
            <span className="note-pill">
              <Check size={14} aria-hidden="true" />
              {event.note}
            </span>
          )}
          <div className="event-links">
            <a href={event.sourceUrl} target="_blank" rel="noreferrer">
              공식 공지
              <ExternalLink size={14} aria-hidden="true" />
            </a>
            {event.officialUrl && (
              <a href={event.officialUrl} target="_blank" rel="noreferrer">
                특설 페이지
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
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
      <CalendarDays size={28} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
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
        <p className="section-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action && <div className="section-action">{action}</div>}
    </div>
  );
}

export default function App() {
  const [loadState, setLoadState] = useState<LoadState>({
    schedule: null,
    events: null,
    error: null,
    loading: true,
  });
  const [now, setNow] = useState(() => new Date());
  const [query, setQuery] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("q") ?? "";
  });
  const [selectedDate, setSelectedDate] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("day") ?? "";
  });
  const [hideEnded, setHideEnded] = useState(true);
  const [region, setRegion] = useState<"ALL" | EventRegion>(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("region");
    return value === "JP" || value === "KR" || value === "GLOBAL"
      ? value
      : "ALL";
  });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const [scheduleResponse, eventsResponse] = await Promise.all([
          fetch(SCHEDULE_URL, { signal: controller.signal }),
          fetch(EVENTS_URL, { signal: controller.signal }),
        ]);

        if (!scheduleResponse.ok || !eventsResponse.ok) {
          throw new Error("일정 파일을 불러오지 못했습니다.");
        }

        const [schedule, events] = (await Promise.all([
          scheduleResponse.json(),
          eventsResponse.json(),
        ])) as [SchedulePayload, EventsPayload];

        setLoadState({
          schedule,
          events,
          error: null,
          loading: false,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadState({
          schedule: null,
          events: null,
          error:
            error instanceof Error
              ? error.message
              : "일정을 불러오는 중 문제가 생겼습니다.",
          loading: false,
        });
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const scheduleEntries = loadState.schedule?.entries ?? [];
  const curatedEvents = loadState.events?.events ?? [];
  const days = useMemo(
    () =>
      Array.from(
        new Set(
          scheduleEntries
            .map((entry) => entry.date)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort(),
    [scheduleEntries],
  );

  useEffect(() => {
    if (days.length === 0) return;

    if (!selectedDate || !days.includes(selectedDate)) {
      const today = dateKey(now);
      setSelectedDate(days.includes(today) ? today : days[0]);
    }
  }, [days, now, selectedDate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const trimmedQuery = query.trim();

    if (trimmedQuery) params.set("q", trimmedQuery);
    else params.delete("q");

    if (selectedDate) params.set("day", selectedDate);
    else params.delete("day");

    if (region !== "ALL") params.set("region", region);
    else params.delete("region");

    const next = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`,
    );
  }, [query, region, selectedDate]);

  const normalizedQuery = normalizeSearch(query);
  const liveNow = useMemo(
    () =>
      scheduleEntries.filter(
        (entry) =>
          broadcastStatus(entry, now) === "live" &&
          includesQuery([entry.name, entry.title], normalizedQuery),
      ),
    [normalizedQuery, now, scheduleEntries],
  );
  const nextBroadcast = useMemo(
    () =>
      scheduleEntries
        .filter(
          (entry) =>
            broadcastStatus(entry, now) === "upcoming" &&
            includesQuery([entry.name, entry.title], normalizedQuery),
        )
        .sort((left, right) =>
          (left.startsAt ?? "").localeCompare(right.startsAt ?? ""),
        )[0] ?? null,
    [normalizedQuery, now, scheduleEntries],
  );
  const selectedEntries = useMemo(
    () =>
      scheduleEntries.filter((entry) => {
        const status = broadcastStatus(entry, now);
        return (
          entry.date === selectedDate &&
          (!hideEnded || status !== "ended") &&
          includesQuery([entry.name, entry.title], normalizedQuery)
        );
      }),
    [
      hideEnded,
      normalizedQuery,
      now,
      scheduleEntries,
      selectedDate,
    ],
  );
  const todayCount = scheduleEntries.filter(
    (entry) => entry.date === dateKey(now),
  ).length;
  const generatedAt = loadState.schedule?.generatedAt
    ? new Date(loadState.schedule.generatedAt)
    : null;
  const dataAgeMinutes = generatedAt
    ? Math.floor((now.getTime() - generatedAt.getTime()) / 60_000)
    : null;
  const stale = dataAgeMinutes !== null && dataAgeMinutes > 45;

  const visibleCuratedEvents = useMemo(
    () =>
      curatedEvents
        .filter((event) => isRelevantEvent(event, now))
        .filter((event) =>
          includesQuery(
            [
              event.title,
              event.titleKo,
              event.city,
              event.venue,
              event.description,
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
    [curatedEvents, normalizedQuery, now],
  );
  const soloEvents = visibleCuratedEvents.filter((event) =>
    event.categories.includes("solo"),
  );
  const concertEvents = visibleCuratedEvents.filter(
    (event) =>
      event.categories.includes("concert") &&
      !event.categories.includes("solo"),
  );
  const collaborationEvents = visibleCuratedEvents.filter(
    (event) =>
      event.categories.includes("collaboration") &&
      (region === "ALL" || event.region === region),
  );
  const nextCuratedEvent =
    curatedEvents
      .filter((event) => eventStatus(event, now) === "upcoming")
      .sort(
        (left, right) =>
          new Date(left.startsAt).getTime() -
          new Date(right.startsAt).getTime(),
      )[0] ?? null;

  return (
    <>
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>

      <header className="site-header">
        <a className="brand" href="#" aria-label="HOLO NOW 홈">
          <span className="brand-mark" aria-hidden="true">
            H
          </span>
          <span>
            <strong>HOLO NOW</strong>
            <small>비공식 일정 모음</small>
          </span>
        </a>
        <nav aria-label="주요 메뉴">
          <a href="#live">방송</a>
          <a href="#concerts">콘서트</a>
          <a href="#solo">솔로 라이브</a>
          <a href="#collabs">일본·한국</a>
        </nav>
        <a
          className="official-link"
          href={OFFICIAL_SCHEDULE_URL}
          target="_blank"
          rel="noreferrer"
        >
          공식 일정
          <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </header>

      <main id="main-content">
        <section className="hero" aria-labelledby="hero-title">
          <img
            className="hero-art"
            src={`${BASE_URL}og-card.png`}
            alt=""
            aria-hidden="true"
          />
          <div className="hero-orbit orbit-one" aria-hidden="true" />
          <div className="hero-orbit orbit-two" aria-hidden="true" />
          <div className="hero-copy">
            <p className="hero-eyebrow">
              <span className="signal-dot" aria-hidden="true" />
              OFFICIAL SCHEDULE INDEX · KST = JST
            </p>
            <h1 id="hero-title">
              놓치고 싶지 않은
              <span>홀로라이브의 모든 순간.</span>
            </h1>
            <p className="hero-description">
              공식 방송부터 콘서트, 솔로 라이브, 일본과 한국의 현지 행사까지
              썸네일과 함께 한 화면에 모았습니다.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#live">
                오늘 방송 보기
                <ChevronRight size={18} aria-hidden="true" />
              </a>
              <a className="button button-secondary" href="#collabs">
                현지 행사 찾기
                <MapPin size={17} aria-hidden="true" />
              </a>
            </div>
            <div className="timezone-note">
              <Clock3 size={16} aria-hidden="true" />
              한국과 일본은 같은 UTC+9 — 시간 변환 없이 그대로 확인하세요.
            </div>
          </div>

          <aside className="hero-panel" aria-label="가장 가까운 공식 행사">
            <div className="panel-topline">
              <span>NEXT OFFLINE</span>
              <CalendarDays size={17} aria-hidden="true" />
            </div>
            {nextCuratedEvent ? (
              <>
                <p className="panel-date">{nextCuratedEvent.dateLabel}</p>
                <h2>{nextCuratedEvent.titleKo}</h2>
                <p className="panel-original" lang="ja">
                  {nextCuratedEvent.title}
                </p>
                <div className="panel-meta">
                  <IconText icon={MapPin}>
                    {nextCuratedEvent.city} · {nextCuratedEvent.venue}
                  </IconText>
                  <IconText icon={Clock3}>
                    {nextCuratedEvent.timeLabel}
                  </IconText>
                </div>
                <a
                  href={nextCuratedEvent.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  공식 공지 확인
                  <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              </>
            ) : (
              <p>확인된 다음 행사가 없습니다.</p>
            )}
          </aside>

          <div className="hero-stats" aria-label="일정 요약">
            <div>
              <strong>{liveNow.length}</strong>
              <span>지금 LIVE</span>
            </div>
            <div>
              <strong>{todayCount}</strong>
              <span>오늘 방송</span>
            </div>
            <div>
              <strong>
                {
                  curatedEvents.filter(
                    (event) => eventStatus(event, now) !== "ended",
                  ).length
                }
              </strong>
              <span>예정·진행 행사</span>
            </div>
          </div>
        </section>

        <div className="search-dock" role="search">
          <Search size={20} aria-hidden="true" />
          <label htmlFor="global-search" className="sr-only">
            멤버, 방송, 행사 검색
          </label>
          <input
            id="global-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="멤버, 방송, 콘서트, 지역을 검색하세요"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")}>
              검색 지우기
            </button>
          )}
          <span className="search-hint">한·일 동일 시각</span>
        </div>

        {loadState.error && (
          <div className="data-alert is-error" role="alert">
            <Info size={19} aria-hidden="true" />
            <div>
              <strong>일정 데이터를 불러오지 못했습니다.</strong>
              <span>{loadState.error} 잠시 후 새로고침해 주세요.</span>
            </div>
          </div>
        )}

        <section className="content-section live-section" id="live">
          <SectionHeading
            eyebrow="LIVE SCHEDULE"
            title="공식 방송 일정"
            description="Holodule의 공개 일정을 30분마다 가져와 날짜와 시작 시각 순으로 보여줍니다."
            action={
              <div className={`update-chip${stale ? " is-stale" : ""}`}>
                <RefreshCw size={15} aria-hidden="true" />
                {generatedAt
                  ? `${UPDATE_FORMATTER.format(generatedAt)} 갱신`
                  : loadState.loading
                    ? "일정 불러오는 중"
                    : "갱신 시각 확인 불가"}
              </div>
            }
          />

          {stale && (
            <div className="data-alert" role="status">
              <Info size={18} aria-hidden="true" />
              <span>
                자동 갱신이 평소보다 늦습니다. 마지막 정상 데이터를 표시하고
                있습니다.
              </span>
            </div>
          )}

          <div className="now-grid">
            <div className="now-card live-now-card">
              <div className="now-card-label">
                <Radio size={18} aria-hidden="true" />
                지금 방송 중
                <span>{liveNow.length}</span>
              </div>
              {liveNow.length > 0 ? (
                <div className="live-list">
                  {liveNow.slice(0, 3).map((entry) => (
                    <a
                      key={entry.id}
                      href={entry.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="live-dot" aria-hidden="true" />
                      <strong>{entry.name}</strong>
                      <span>{entry.time || "LIVE"}</span>
                      <ArrowUpRight size={15} aria-hidden="true" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="now-empty">
                  현재 공식 일정에서 LIVE로 표시된 방송이 없습니다.
                </p>
              )}
            </div>
            <div className="now-card next-now-card">
              <div className="now-card-label">
                <CircleDot size={18} aria-hidden="true" />
                다음 방송
              </div>
              {nextBroadcast ? (
                <a
                  href={nextBroadcast.url}
                  target="_blank"
                  rel="noreferrer"
                  className="next-broadcast"
                >
                  <div>
                    <strong>{nextBroadcast.name}</strong>
                    <span>
                      {nextBroadcast.startsAt
                        ? `${TIME_FORMATTER.format(new Date(nextBroadcast.startsAt))} KST·JST`
                        : "시간 확인 중"}
                    </span>
                  </div>
                  <em>{formatRelative(nextBroadcast.startsAt, now)}</em>
                  <ChevronRight size={19} aria-hidden="true" />
                </a>
              ) : (
                <p className="now-empty">확인된 다음 방송이 없습니다.</p>
              )}
            </div>
          </div>

          <div className="schedule-toolbar">
            <div
              className="day-tabs"
              role="tablist"
              aria-label="방송 날짜 선택"
            >
              {days.map((day) => {
                const count = scheduleEntries.filter(
                  (entry) => entry.date === day,
                ).length;
                return (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selectedDate === day}
                    className={selectedDate === day ? "is-active" : ""}
                    key={day}
                    onClick={() => setSelectedDate(day)}
                  >
                    <span>
                      {day === dateKey(now)
                        ? "오늘"
                        : scheduleDayLabel(day).split(" ")[1] || "일정"}
                    </span>
                    <strong>{scheduleDayLabel(day)}</strong>
                    <em>{count}</em>
                  </button>
                );
              })}
            </div>
            <label className="toggle-control">
              <input
                type="checkbox"
                checked={hideEnded}
                onChange={(event) => setHideEnded(event.target.checked)}
              />
              <span aria-hidden="true" />
              종료 방송 숨기기
            </label>
          </div>

          <p className="result-count" aria-live="polite">
            {selectedEntries.length}개의 방송 일정
            {normalizedQuery ? ` · “${query.trim()}” 검색 결과` : ""}
          </p>

          {loadState.loading ? (
            <div className="card-grid broadcast-grid" aria-label="일정 로딩 중">
              {[0, 1, 2].map((item) => (
                <div className="skeleton-card" key={item} aria-hidden="true">
                  <div />
                  <span />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : selectedEntries.length > 0 ? (
            <div className="card-grid broadcast-grid">
              {selectedEntries.map((entry) => (
                <BroadcastCard entry={entry} now={now} key={entry.id} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="조건에 맞는 방송이 없습니다"
              description="날짜를 바꾸거나 종료 방송 숨기기를 해제해 보세요."
            />
          )}

          <div className="source-note">
            <Info size={17} aria-hidden="true" />
            <p>
              공식 Holodule 카드에는 전체 방송 제목이 제공되지 않아, 제목을
              확인할 수 없는 경우 채널명으로 표시합니다. 시각과 링크는 공식
              공개 일정 기준이며 변경될 수 있습니다.
            </p>
            <a
              href={OFFICIAL_SCHEDULE_URL}
              target="_blank"
              rel="noreferrer"
            >
              원본 일정 보기
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          </div>
        </section>

        <section className="content-section" id="concerts">
          <SectionHeading
            eyebrow="CONCERTS & FESTIVALS"
            title="콘서트 · 공식 상영"
            description="합동 라이브와 공식 딜레이 뷰잉처럼 날짜가 확정된 무대를 모았습니다."
          />
          {concertEvents.length > 0 ? (
            <div className="event-grid feature-grid">
              {concertEvents.map((event, index) => (
                <EventCard
                  event={event}
                  now={now}
                  featured={index === 0}
                  key={event.id}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="검색 조건에 맞는 콘서트가 없습니다"
              description="검색어를 지우면 확인된 전체 일정을 볼 수 있습니다."
            />
          )}
        </section>

        <section className="content-section solo-section" id="solo">
          <SectionHeading
            eyebrow="SOLO LIVE"
            title="멤버 솔로 라이브"
            description="멤버 한 명이 중심이 되는 공식 단독 공연만 별도로 정리했습니다."
            action={
              <span className="count-chip">
                <Sparkles size={15} aria-hidden="true" />
                예정 {soloEvents.length}
              </span>
            }
          />
          {soloEvents.length > 0 ? (
            <div className="event-grid">
              {soloEvents.map((event) => (
                <EventCard event={event} now={now} key={event.id} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="검색 조건에 맞는 솔로 라이브가 없습니다"
              description="멤버 이름이나 공연명을 다르게 검색해 보세요."
            />
          )}
        </section>

        <section className="content-section collab-section" id="collabs">
          <SectionHeading
            eyebrow="LOCAL COLLABORATIONS"
            title="일본 · 한국 현지 일정"
            description="현장에서 방문할 수 있는 팝업, 전시, 페스티벌과 공식 카드게임 행사를 확인했습니다."
            action={
              <div
                className="region-tabs"
                role="group"
                aria-label="행사 지역 필터"
              >
                {(
                  [
                    ["ALL", "전체"],
                    ["JP", "일본"],
                    ["KR", "한국"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    type="button"
                    className={region === value ? "is-active" : ""}
                    aria-pressed={region === value}
                    onClick={() => setRegion(value)}
                    key={value}
                  >
                    {label}
                  </button>
                ))}
              </div>
            }
          />

          {region === "KR" && (
            <div className="local-note">
              <Globe2 size={19} aria-hidden="true" />
              <div>
                <strong>현재 확인된 한국 일정</strong>
                <p>
                  8월 22–23일 서울 aT센터의 공식 카드게임 행사 2건이
                  확정됐습니다. 현장 탤런트 출연은 아직 발표되지 않았습니다.
                </p>
              </div>
            </div>
          )}

          {collaborationEvents.length > 0 ? (
            <div className="event-grid">
              {collaborationEvents.map((event) => (
                <EventCard event={event} now={now} key={event.id} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="조건에 맞는 현지 행사가 없습니다"
              description="지역을 전체로 바꾸거나 검색어를 지워 보세요."
            />
          )}
        </section>

        <section className="method-section" aria-labelledby="method-title">
          <div>
            <p className="section-eyebrow">SOURCE & POLICY</p>
            <h2 id="method-title">무료로 운영되는 정적 일정 페이지</h2>
          </div>
          <div className="method-grid">
            <div>
              <RefreshCw size={21} aria-hidden="true" />
              <strong>30분 자동 갱신</strong>
              <p>GitHub Actions가 공개 Holodule 일정만 읽어 Pages를 다시 만듭니다.</p>
            </div>
            <div>
              <Globe2 size={21} aria-hidden="true" />
              <strong>공식 출처 연결</strong>
              <p>공연과 현지 행사는 hololive/COVER 또는 협업사 공지를 연결합니다.</p>
            </div>
            <div>
              <Ticket size={21} aria-hidden="true" />
              <strong>API 키·광고 없음</strong>
              <p>브라우저에 비밀 키를 넣지 않고, 로그인·분석·유료 서버도 사용하지 않습니다.</p>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="footer-brand">
          <span className="brand-mark" aria-hidden="true">
            H
          </span>
          <div>
            <strong>HOLO NOW</strong>
            <p>홀로라이브 공식 일정과 행사를 빠르게 찾기 위한 비공식 모음입니다.</p>
          </div>
        </div>
        <div className="footer-links">
          <a
            href="https://hololive.hololivepro.com/events/"
            target="_blank"
            rel="noreferrer"
          >
            공식 이벤트
            <ExternalLink size={14} aria-hidden="true" />
          </a>
          <a
            href={OFFICIAL_SCHEDULE_URL}
            target="_blank"
            rel="noreferrer"
          >
            Holodule
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
        <p className="disclaimer">
          이 페이지는 hololive production 또는 COVER Corp.의 공식 서비스가
          아닙니다. 상표와 이미지의 권리는 각 권리자에게 있으며, 방문·예매 전
          반드시 연결된 공식 공지에서 최신 내용을 확인하세요.
        </p>
      </footer>
    </>
  );
}
