import {
  CalendarDays,
  Clock3,
  ExternalLink,
  History,
  Megaphone,
  Sparkles,
} from "lucide-react";
import { useMemo, type CSSProperties } from "react";
import type { DreamPickup, Talent } from "../types";

type PickupStatus = "upcoming" | "ongoing" | "ended";

interface DreamPickupPanelProps {
  pickups: DreamPickup[];
  talents: Talent[];
  query: string;
  now: Date;
}

const KST_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

function normalizeSearch(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLocaleLowerCase();
}

function kstDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function pickupStatus(pickup: DreamPickup, today: string): PickupStatus {
  if (today < pickup.startsOn) return "upcoming";
  if (pickup.endsOn && today > pickup.endsOn) return "ended";
  return "ongoing";
}

function formatDate(value: string) {
  return KST_DATE_FORMATTER.format(
    new Date(`${value}T00:00:00+09:00`),
  ).replace(/\s/g, "");
}

function daysBetween(left: string, right: string) {
  return Math.round(
    (Date.parse(`${right}T00:00:00+09:00`) -
      Date.parse(`${left}T00:00:00+09:00`)) /
      86_400_000,
  );
}

function statusCopy(
  status: PickupStatus,
  pickup: DreamPickup,
  today: string,
) {
  if (status === "ongoing") return "진행 중";
  if (status === "ended") return "종료";
  const remaining = daysBetween(today, pickup.startsOn);
  if (remaining === 0) return "오늘 시작";
  if (remaining === 1) return "내일 시작";
  return `D-${remaining}`;
}

function scheduleCopy(pickup: DreamPickup) {
  const start = formatDate(pickup.startsOn);
  return pickup.endsOn
    ? `${start} – ${formatDate(pickup.endsOn)}`
    : `${start} 시작`;
}

export function DreamPickupPanel({
  pickups,
  talents,
  query,
  now,
}: DreamPickupPanelProps) {
  const talentById = useMemo(
    () => new Map(talents.map((talent) => [talent.id, talent])),
    [talents],
  );
  const today = kstDateKey(now);
  const normalizedQuery = normalizeSearch(query);

  const pickupEntries = useMemo(
    () =>
      pickups
        .map((pickup) => ({
          pickup,
          status: pickupStatus(pickup, today),
        }))
        .sort((left, right) => {
          const statusOrder: Record<PickupStatus, number> = {
            ongoing: 0,
            upcoming: 1,
            ended: 2,
          };
          return (
            statusOrder[left.status] - statusOrder[right.status] ||
            (left.status === "ended"
              ? right.pickup.startsOn.localeCompare(left.pickup.startsOn)
              : left.pickup.startsOn.localeCompare(right.pickup.startsOn))
          );
        }),
    [pickups, today],
  );

  const visibleEntries = useMemo(
    () =>
      pickupEntries.filter(({ pickup }) => {
        if (!normalizedQuery) return true;
        const cardNames = pickup.cards.flatMap((card) => {
          const talent = talentById.get(card.talentId);
          return [
            talent?.name,
            talent?.nameKo,
            talent?.nativeName,
            ...(talent?.aliases ?? []),
          ];
        });
        return normalizeSearch(
          [
            pickup.title,
            pickup.subtitle,
            pickup.sourceLabel,
            ...cardNames,
          ]
            .filter(Boolean)
            .join(" "),
        ).includes(normalizedQuery);
      }),
    [normalizedQuery, pickupEntries, talentById],
  );

  const counts = pickupEntries.reduce(
    (result, entry) => {
      result[entry.status] += 1;
      return result;
    },
    { upcoming: 0, ongoing: 0, ended: 0 } as Record<PickupStatus, number>,
  );
  const featured =
    visibleEntries.find(({ status }) => status === "ongoing") ??
    visibleEntries.find(({ status }) => status === "upcoming") ??
    visibleEntries[0];

  return (
    <div className="dream-pickup-panel">
      <div className="dream-pickup-overview">
        <div className="dream-pickup-overview__copy">
          <span className="dream-pickup-overview__icon" aria-hidden="true">
            <Megaphone size={21} />
          </span>
          <div>
            <small>PICKUP CALENDAR</small>
            <h3>새 픽업부터 지난 일정까지</h3>
            <p>
              공식 발표를 기준으로 픽업 대상과 기간을 기록합니다. 종료된
              픽업도 이곳에 계속 남습니다.
            </p>
          </div>
        </div>
        <div className="dream-pickup-stats" aria-label="픽업 일정 현황">
          <span>
            <small>진행 중</small>
            <strong>{counts.ongoing}</strong>
          </span>
          <span>
            <small>예정</small>
            <strong>{counts.upcoming}</strong>
          </span>
          <span>
            <small>종료 기록</small>
            <strong>{counts.ended}</strong>
          </span>
        </div>
      </div>

      {featured ? (
        <article
          className={`dream-pickup-feature is-${featured.status}`}
          aria-labelledby={`pickup-${featured.pickup.id}`}
        >
          <header className="dream-pickup-feature__header">
            <div>
              <span
                className={`dream-pickup-status is-${featured.status}`}
              >
                <span aria-hidden="true" />
                {statusCopy(featured.status, featured.pickup, today)}
              </span>
              <small>HOLOLIVE DREAMS · SUMMER PICKUP</small>
              <h3 id={`pickup-${featured.pickup.id}`}>
                {featured.pickup.title}
              </h3>
              <p>{featured.pickup.subtitle}</p>
            </div>
            <div className="dream-pickup-schedule">
              <span>
                <CalendarDays size={17} aria-hidden="true" />
                <small>픽업 일정</small>
              </span>
              <strong>{scheduleCopy(featured.pickup)}</strong>
              <small>
                {featured.pickup.endsOn
                  ? "한국·일본 시간 기준"
                  : "종료 일정 확인 중"}
              </small>
            </div>
          </header>

          <div className="dream-pickup-gallery">
            {featured.pickup.cards.map((card) => {
              const talent = talentById.get(card.talentId);
              const style = {
                "--pickup-position": card.imagePosition ?? "50% 50%",
                "--pickup-scale": card.imageScale ?? 1,
                "--pickup-origin":
                  card.imageScale && card.imageScale > 1
                    ? "43% 22%"
                    : "50% 50%",
                "--pickup-accent": talent?.accent ?? "#7368db",
              } as CSSProperties;

              return (
                <figure
                  className="dream-pickup-art"
                  key={card.id}
                  style={style}
                >
                  <img
                    src={card.imageUrl}
                    alt={card.imageAlt}
                    loading="lazy"
                    decoding="async"
                  />
                  <figcaption>
                    <small>
                      {card.rarity ? `★${card.rarity} PICK UP` : "PICK UP"}
                    </small>
                    <strong>{talent?.nameKo ?? card.talentId}</strong>
                  </figcaption>
                </figure>
              );
            })}
          </div>

          <footer className="dream-pickup-feature__footer">
            <div>
              <Sparkles size={15} aria-hidden="true" />
              <span>
                이미지: 공식 방송 공개 화면 · © COVER / © QualiArts, Inc.
              </span>
            </div>
            <a
              href={featured.pickup.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {featured.pickup.sourceLabel}
              <ExternalLink size={13} aria-hidden="true" />
            </a>
          </footer>
        </article>
      ) : (
        <div className="dream-pickup-empty">
          <CalendarDays size={29} aria-hidden="true" />
          <strong>검색 조건에 맞는 픽업이 없습니다</strong>
          <p>멤버 이름이나 픽업 이름으로 다시 검색해 주세요.</p>
        </div>
      )}

      <section
        className="dream-pickup-history"
        aria-labelledby="dream-pickup-history-title"
      >
        <div className="dream-pickup-history__heading">
          <span aria-hidden="true">
            <History size={18} />
          </span>
          <div>
            <small>SCHEDULE ARCHIVE</small>
            <h3 id="dream-pickup-history-title">픽업 일정 기록</h3>
          </div>
          <strong>{visibleEntries.length}건</strong>
        </div>

        {visibleEntries.length ? (
          <div className="dream-pickup-history__list">
            {visibleEntries.map(({ pickup, status }) => {
              const names = pickup.cards
                .map(
                  (card) =>
                    talentById.get(card.talentId)?.nameKo ?? card.talentId,
                )
                .join(" · ");
              return (
                <article key={pickup.id}>
                  <span className={`dream-pickup-status is-${status}`}>
                    <span aria-hidden="true" />
                    {statusCopy(status, pickup, today)}
                  </span>
                  <div>
                    <small>{scheduleCopy(pickup)}</small>
                    <strong>{pickup.title}</strong>
                    <p>{names}</p>
                  </div>
                  <div className="dream-pickup-history__note">
                    <Clock3 size={14} aria-hidden="true" />
                    <span>{pickup.scheduleNote}</span>
                  </div>
                  <a
                    href={pickup.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${pickup.title} 공식 발표 새 창에서 열기`}
                  >
                    공식 발표
                    <ExternalLink size={13} aria-hidden="true" />
                  </a>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="dream-pickup-history__empty">
            표시할 픽업 기록이 없습니다.
          </p>
        )}
      </section>
    </div>
  );
}

export default DreamPickupPanel;
