import {
  Check,
  ExternalLink,
  LockKeyhole,
  SearchX,
  Sparkles,
  Trophy,
} from "lucide-react";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { includesSearch, normalizeSearch } from "../search";
import type {
  CollectionCard,
  CollectionCatalogPayload,
  CollectionRarity,
  CollectionRelease,
  Talent,
} from "../types";
import { useOwnedCollection } from "./useOwnedCollection";
import "./collection.css";

export type CollectionCatalogKind = "cards" | "wafer";
type OwnedFilter = "all" | "owned" | "missing";
type SortMode = "newest" | "oldest" | "card-number";

interface CollectionCatalogPageProps {
  kind: CollectionCatalogKind;
  payload: CollectionCatalogPayload;
  query: string;
  talents: Talent[];
}

interface RarityGroup {
  id: string;
  label: string;
  cards: CollectionCard[];
}

interface ReleaseGroup {
  release: CollectionRelease;
  total: number;
  owned: number;
  rarityGroups: RarityGroup[];
}

const CATALOG_META = {
  cards: {
    kicker: "HOLOLIVE OFFICIAL CARD GAME",
    title: "공식 카드게임 컬렉션",
    description: "스타트 덱·부스터·프로모 카드를 팩과 등급별로 확인하세요.",
    collectionLabel: "공식 카드게임",
    itemLabel: "카드",
    releaseLabel: "팩·출시",
    sourceLabel: "공식 카드 목록",
    storageKey: "holo-now:official-card-game-owned:v1",
  },
  wafer: {
    kicker: "HOLOLIVE WAFER CARD COLLECTION",
    title: "웨하스 카드 컬렉션",
    description: "역대 카드와 출시 예정 라인업을 출시별로 확인하세요.",
    collectionLabel: "웨하스 카드",
    itemLabel: "카드",
    releaseLabel: "웨하스 출시",
    sourceLabel: "반다이 공식 제품 페이지",
    storageKey: "holo-now:wafer-owned:v1",
  },
} as const;

const OWNED_FILTERS: Array<{ value: OwnedFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "owned", label: "보유" },
  { value: "missing", label: "미보유" },
];
const RELEASE_BATCH_SIZE = 6;

const CHECKED_AT_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

const COLLECTION_SEARCH_ALIASES = [
  {
    identities: ["紫咲シオン", "魔法少女シオン"],
    aliases: "무라사키 시온 시온 Murasaki Shion",
  },
  {
    identities: ["夜空メル"],
    aliases: "요조라 멜 멜 Yozora Mel",
  },
  {
    identities: ["七詩ムメイ"],
    aliases: "나나시 무메이 무메이 Nanashi Mumei",
  },
  {
    identities: ["がうる・ぐら"],
    aliases: "가우르 구라 구라 Gawr Gura",
  },
  {
    identities: ["セレス・ファウナ"],
    aliases: "세레스 파우나 파우나 Ceres Fauna",
  },
  {
    identities: ["火威青"],
    aliases: "히오도시 아오 아오 Hiodoshi Ao",
  },
  {
    identities: ["miComet"],
    aliases:
      "미코멧 미코메트 사쿠라 미코 호시마치 스이세이 Sakura Miko Hoshimachi Suisei",
  },
  {
    identities: ["魔法少女みこ"],
    aliases: "마법소녀 미코 사쿠라 미코 Magical Girl Miko Sakura Miko",
  },
  {
    identities: ["ラムダック"],
    aliases:
      "램덕 람덕 LAMBDUCK 츠노마키 와타메 오오조라 스바루 Tsunomaki Watame Oozora Subaru",
  },
] as const;

const RELEASE_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
});

function releaseTime(release: CollectionRelease): number | null {
  if (!release.releaseDate) return null;
  const timestamp = Date.parse(`${release.releaseDate}T00:00:00+09:00`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatReleaseDate(value: string | null): string {
  if (!value) return "출시일 미정";
  const timestamp = Date.parse(`${value}T00:00:00+09:00`);
  return Number.isFinite(timestamp)
    ? RELEASE_DATE_FORMATTER.format(new Date(timestamp))
    : value;
}

function compareReleases(
  left: CollectionRelease,
  right: CollectionRelease,
  sortMode: SortMode,
): number {
  const leftTime = releaseTime(left);
  const rightTime = releaseTime(right);
  if (leftTime === null && rightTime !== null) return 1;
  if (leftTime !== null && rightTime === null) return -1;
  if (leftTime !== null && rightTime !== null && leftTime !== rightTime) {
    return sortMode === "oldest" ? leftTime - rightTime : rightTime - leftTime;
  }
  return left.name.localeCompare(right.name, "ko");
}

function latestReleasedId(releases: CollectionRelease[]): string {
  const now = Date.now();
  return (
    releases
      .filter((release) => {
        const timestamp = releaseTime(release);
        return timestamp !== null && timestamp <= now;
      })
      .sort((left, right) => compareReleases(left, right, "newest"))[0]?.id ??
    "all"
  );
}

function releaseStatus(release: CollectionRelease): "upcoming" | "undated" | null {
  const timestamp = releaseTime(release);
  if (timestamp === null) return "undated";
  return timestamp > Date.now() ? "upcoming" : null;
}

function compareCards(
  left: CollectionCard,
  right: CollectionCard,
  sortMode: SortMode,
): number {
  if (sortMode === "card-number") {
    return (
      left.cardNumber.localeCompare(right.cardNumber, "ko", {
        numeric: true,
        sensitivity: "base",
      }) || left.sortOrder - right.sortOrder
    );
  }

  return (
    left.sortOrder - right.sortOrder ||
    left.cardNumber.localeCompare(right.cardNumber, "ko", {
      numeric: true,
      sensitivity: "base",
    })
  );
}

const CatalogCard = memo(function CatalogCard({
  card,
  rarity,
  release,
  isOwned,
  onToggleOwned,
}: {
  card: CollectionCard;
  rarity?: CollectionRarity;
  release: CollectionRelease;
  isOwned: boolean;
  onToggleOwned: (id: string) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageRetry, setImageRetry] = useState(0);
  const imageRetryTimerRef = useRef<number | null>(null);
  const renderedImageUrl = imageRetry
    ? `${card.imageUrl}${card.imageUrl.includes("?") ? "&" : "?"}holo_retry=${imageRetry}`
    : card.imageUrl;
  const detail = [
    ...(card.memberNames ?? []),
    card.variantLabel,
  ].filter((value): value is string => Boolean(value));

  useEffect(
    () => () => {
      if (imageRetryTimerRef.current !== null) {
        window.clearTimeout(imageRetryTimerRef.current);
      }
    },
    [],
  );

  function handleImageError() {
    if (imageRetry >= 2) {
      setImageFailed(true);
      return;
    }
    if (imageRetryTimerRef.current !== null) return;

    imageRetryTimerRef.current = window.setTimeout(
      () => {
        imageRetryTimerRef.current = null;
        setImageRetry((current) => current + 1);
      },
      650 * (imageRetry + 1),
    );
  }

  return (
    <button
      type="button"
      className={`collection-catalog-card${isOwned ? " is-owned" : ""}`}
      aria-pressed={isOwned}
      aria-label={`${card.title}, ${card.cardNumber}, ${rarity?.label ?? card.rarityId}. ${
        isOwned ? "보유 중. 미보유로 변경" : "미보유. 보유로 변경"
      }`}
      onClick={() => onToggleOwned(card.id)}
    >
      <span className="collection-catalog-card__image">
        {!imageFailed ? (
          card.imagePosition || card.imageSize ? (
            <>
              <span
                className="collection-catalog-card__art is-sprite"
                style={{
                  backgroundImage: `url(${JSON.stringify(renderedImageUrl)})`,
                  backgroundPosition: card.imagePosition ?? "50% 50%",
                  backgroundSize: card.imageSize ?? "cover",
                }}
                aria-hidden="true"
              />
              <img
                className="collection-catalog-card__sprite-probe"
                src={renderedImageUrl}
                alt=""
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={handleImageError}
              />
            </>
          ) : (
            <img
              className="collection-catalog-card__art"
              src={renderedImageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={handleImageError}
            />
          )
        ) : (
          <span className="collection-catalog-card__fallback" aria-hidden="true">
            <Sparkles size={23} />
            이미지 준비 중
          </span>
        )}
        <span className="collection-catalog-card__rarity" aria-hidden="true">
          {rarity?.label ?? card.rarityId}
        </span>
        <span className="collection-catalog-card__check" aria-hidden="true">
          <Check size={16} strokeWidth={3} />
        </span>
        <span className="collection-catalog-card__owned-label">
          {isOwned ? "보유" : "미보유"}
        </span>
      </span>
      <span className="collection-catalog-card__copy">
        <small>
          {card.cardNumber} · {release.shortName}
        </small>
        <strong>{card.title}</strong>
        <span>{detail.length ? detail.join(" · ") : release.name}</span>
      </span>
    </button>
  );
});

export function CollectionCatalogPage({
  kind,
  payload,
  query,
  talents,
}: CollectionCatalogPageProps) {
  const meta = CATALOG_META[kind];
  const { ownedIds, storageError, toggleOwned } = useOwnedCollection(
    meta.storageKey,
  );
  const [selectedReleaseId, setSelectedReleaseId] = useState(() =>
    latestReleasedId(payload.releases),
  );
  const [selectedRarityId, setSelectedRarityId] = useState("all");
  const [ownedFilter, setOwnedFilter] = useState<OwnedFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [visibleReleaseCount, setVisibleReleaseCount] = useState(
    RELEASE_BATCH_SIZE,
  );
  const normalizedQuery = normalizeSearch(query);
  const previousQueryRef = useRef("");

  const releaseById = useMemo(
    () => new Map(payload.releases.map((release) => [release.id, release])),
    [payload.releases],
  );
  const rarityById = useMemo(
    () => new Map(payload.rarities.map((rarity) => [rarity.id, rarity])),
    [payload.rarities],
  );
  const sortedRarities = useMemo(
    () =>
      [...payload.rarities].sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          left.label.localeCompare(right.label, "ko"),
      ),
    [payload.rarities],
  );
  const releaseOptions = useMemo(
    () =>
      [...payload.releases].sort((left, right) =>
        compareReleases(left, right, "newest"),
      ),
    [payload.releases],
  );
  const validCardIds = useMemo(
    () => new Set(payload.cards.map((card) => card.id)),
    [payload.cards],
  );
  const ownedCount = useMemo(
    () => [...ownedIds].filter((id) => validCardIds.has(id)).length,
    [ownedIds, validCardIds],
  );
  const completion = payload.cards.length
    ? Math.round((ownedCount / payload.cards.length) * 100)
    : 0;

  const searchAliasesByCardId = useMemo(() => {
    const talentSearchEntries = talents.map((talent) => ({
      identities: [talent.nativeName, talent.name, ...talent.aliases]
        .map(normalizeSearch)
        .filter((value) => value.length >= 3),
      aliases: [
        talent.nameKo,
        talent.name,
        talent.nativeName,
        ...talent.aliases,
      ].join(" "),
    }));
    const catalogSearchEntries = COLLECTION_SEARCH_ALIASES.map((entry) => ({
      identities: entry.identities.map(normalizeSearch),
      aliases: entry.aliases,
    }));
    const searchEntries = [...talentSearchEntries, ...catalogSearchEntries];

    return new Map(
      payload.cards.map((card) => {
        const identityText = normalizeSearch(
          [card.title, ...(card.memberNames ?? [])].join(" "),
        );
        const aliases = searchEntries
          .filter(({ identities }) =>
            identities.some((identity) => identityText.includes(identity)),
          )
          .map(({ aliases: talentAliases }) => talentAliases)
          .join(" ");
        return [card.id, aliases] as const;
      }),
    );
  }, [payload.cards, talents]);

  const allCardsByRelease = useMemo(() => {
    const cardsByRelease = new Map<string, CollectionCard[]>();
    for (const card of payload.cards) {
      for (const releaseId of card.releaseIds) {
        const releaseCards = cardsByRelease.get(releaseId) ?? [];
        releaseCards.push(card);
        cardsByRelease.set(releaseId, releaseCards);
      }
    }
    return cardsByRelease;
  }, [payload.cards]);

  useEffect(() => {
    if (selectedReleaseId !== "all" && !releaseById.has(selectedReleaseId)) {
      setSelectedReleaseId("all");
    }
  }, [releaseById, selectedReleaseId]);

  useEffect(() => {
    if (selectedRarityId !== "all" && !rarityById.has(selectedRarityId)) {
      setSelectedRarityId("all");
    }
  }, [rarityById, selectedRarityId]);

  useEffect(() => {
    if (normalizedQuery && !previousQueryRef.current) {
      setSelectedReleaseId("all");
    }
    previousQueryRef.current = normalizedQuery;
  }, [normalizedQuery]);

  useEffect(() => {
    setVisibleReleaseCount(RELEASE_BATCH_SIZE);
  }, [
    normalizedQuery,
    ownedFilter,
    selectedRarityId,
    selectedReleaseId,
    sortMode,
  ]);

  const filteredCards = useMemo(
    () =>
      payload.cards.filter((card) => {
        const releases = card.releaseIds
          .map((releaseId) => releaseById.get(releaseId))
          .filter((release): release is CollectionRelease => Boolean(release));
        const rarity = rarityById.get(card.rarityId);
        const isOwned = ownedIds.has(card.id);
        const matchesRelease =
          selectedReleaseId === "all" ||
          card.releaseIds.includes(selectedReleaseId);
        const matchesRarity =
          selectedRarityId === "all" || card.rarityId === selectedRarityId;
        const matchesOwned =
          ownedFilter === "all" ||
          (ownedFilter === "owned" && isOwned) ||
          (ownedFilter === "missing" && !isOwned);
        const matchesQuery = includesSearch(
          [
            card.cardNumber,
            card.title,
            card.rarityId,
            rarity?.label,
            releases.map((release) => release.name).join(" "),
            releases.map((release) => release.shortName).join(" "),
            releases.map((release) => release.category).join(" "),
            card.variantLabel,
            card.memberNames?.join(" "),
            searchAliasesByCardId.get(card.id),
          ],
          normalizedQuery,
        );

        return matchesRelease && matchesRarity && matchesOwned && matchesQuery;
      }),
    [
      normalizedQuery,
      ownedFilter,
      ownedIds,
      payload.cards,
      rarityById,
      releaseById,
      searchAliasesByCardId,
      selectedRarityId,
      selectedReleaseId,
    ],
  );

  const releaseGroups = useMemo<ReleaseGroup[]>(() => {
    const cardsByRelease = new Map<string, CollectionCard[]>();
    for (const card of filteredCards) {
      const visibleReleaseIds =
        selectedReleaseId === "all"
          ? card.releaseIds
          : [selectedReleaseId];
      for (const releaseId of visibleReleaseIds) {
        if (!releaseById.has(releaseId)) continue;
        const cards = cardsByRelease.get(releaseId) ?? [];
        cards.push(card);
        cardsByRelease.set(releaseId, cards);
      }
    }

    const releases = [...payload.releases]
      .filter((release) => cardsByRelease.has(release.id))
      .sort((left, right) => compareReleases(left, right, sortMode));

    return releases.map((release) => {
      const cards = cardsByRelease.get(release.id) ?? [];
      const knownRarityIds = new Set(sortedRarities.map((rarity) => rarity.id));
      const rarityGroups: RarityGroup[] = sortedRarities
        .map((rarity) => ({
          id: rarity.id,
          label: rarity.label,
          cards: cards
            .filter((card) => card.rarityId === rarity.id)
            .sort((left, right) => compareCards(left, right, sortMode)),
        }))
        .filter((group) => group.cards.length > 0);
      const uncategorized = cards
        .filter((card) => !knownRarityIds.has(card.rarityId))
        .sort((left, right) => compareCards(left, right, sortMode));
      if (uncategorized.length) {
        rarityGroups.push({ id: "other", label: "기타", cards: uncategorized });
      }

      const allReleaseCards = allCardsByRelease.get(release.id) ?? [];
      return {
        release,
        total: allReleaseCards.length,
        owned: allReleaseCards.filter((card) => ownedIds.has(card.id)).length,
        rarityGroups,
      };
    });
  }, [
    filteredCards,
    ownedIds,
    payload.releases,
    allCardsByRelease,
    releaseById,
    selectedReleaseId,
    sortMode,
    sortedRarities,
  ]);

  const visibleMembershipCount = useMemo(
    () =>
      selectedReleaseId === "all"
        ? filteredCards.reduce(
            (total, card) => total + card.releaseIds.length,
            0,
          )
        : filteredCards.length,
    [filteredCards, selectedReleaseId],
  );
  const progressivelyRenderReleases =
    kind === "cards" && selectedReleaseId === "all" && !normalizedQuery;
  const visibleReleaseGroups = progressivelyRenderReleases
    ? releaseGroups.slice(0, visibleReleaseCount)
    : releaseGroups;
  const hiddenReleaseCount = releaseGroups.length - visibleReleaseGroups.length;

  return (
    <section
      className={`collection-catalog-page is-${kind}`}
      id={kind === "cards" ? "hololive-card-game" : "hololive-wafer"}
      aria-labelledby={`${kind}-collection-title`}
    >
      <div className="collection-catalog-top">
        <div>
          <span className="collection-catalog-kicker">
            <Sparkles size={14} aria-hidden="true" />
            {meta.kicker}
          </span>
          <h2 id={`${kind}-collection-title`}>
            {meta.title.split("\n").map((line, index) => (
              <span key={line}>
                {index > 0 ? <br /> : null}
                {line}
              </span>
            ))}
          </h2>
          <p>{meta.description}</p>
        </div>
        {payload.sourceUrls[0] ? (
          <a
            className="collection-catalog-source"
            href={payload.sourceUrls[0]}
            target="_blank"
            rel="noreferrer"
          >
            {meta.sourceLabel}
            <ExternalLink size={15} aria-hidden="true" />
          </a>
        ) : null}
      </div>

      <div className="collection-catalog-progress">
        <div className="collection-catalog-progress__main">
          <div
            className="collection-catalog-progress__ring"
            style={{ "--collection-progress": `${completion * 3.6}deg` } as CSSProperties}
          >
            <span>
              <strong>{completion}%</strong>
              완성
            </span>
          </div>
          <div>
            <span>MY COLLECTION</span>
            <strong>
              {ownedCount.toLocaleString("ko-KR")}
              <small> / {payload.cards.length.toLocaleString("ko-KR")}장</small>
            </strong>
            <p>카드를 눌러 보유 상태를 기록하세요.</p>
          </div>
        </div>

        <div className="collection-catalog-progress__stats">
          <div>
            <strong>{payload.releases.length.toLocaleString("ko-KR")}</strong>
            <span>{meta.releaseLabel}</span>
          </div>
          <div>
            <strong>{payload.rarities.length.toLocaleString("ko-KR")}</strong>
            <span>등급</span>
          </div>
          <div>
            <strong>{(payload.cards.length - ownedCount).toLocaleString("ko-KR")}</strong>
            <span>미보유</span>
          </div>
        </div>

        <div
          className={`collection-catalog-storage${storageError ? " is-error" : ""}`}
          role={storageError ? "alert" : undefined}
        >
          {storageError ? <LockKeyhole size={18} aria-hidden="true" /> : <Trophy size={18} aria-hidden="true" />}
          <span>
            <strong>
              {storageError
                ? "브라우저에 보유 기록을 저장하지 못했습니다"
                : `${meta.collectionLabel} 보유 기록은 이 브라우저에 자동 저장됩니다`}
            </strong>
            <small>
              {storageError
                ? "브라우저 저장 공간 권한을 확인해 주세요."
                : `${meta.sourceLabel} 기준 · ${CHECKED_AT_FORMATTER.format(
                    new Date(payload.checkedAt),
                  )} 확인`}
            </small>
          </span>
        </div>
      </div>

      <div
        className="collection-catalog-filters"
        role="group"
        aria-label={`${meta.collectionLabel} 필터`}
      >
        <label>
          <span>{meta.releaseLabel}</span>
          <select
            value={selectedReleaseId}
            onChange={(event) => setSelectedReleaseId(event.target.value)}
          >
            <option value="all">전체 출시</option>
            {releaseOptions.map((release) => (
              <option key={release.id} value={release.id}>
                {release.shortName} · {formatReleaseDate(release.releaseDate)}
                {releaseStatus(release) === "upcoming" ? " · 출시 예정" : ""}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>등급</span>
          <select
            value={selectedRarityId}
            onChange={(event) => setSelectedRarityId(event.target.value)}
          >
            <option value="all">전체 등급</option>
            {sortedRarities.map((rarity) => (
              <option key={rarity.id} value={rarity.id}>
                {rarity.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>정렬</span>
          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
          >
            <option value="newest">최신 출시순</option>
            <option value="oldest">오래된 출시순</option>
            <option value="card-number">카드 번호순</option>
          </select>
        </label>

        <div
          className="collection-catalog-owned-tabs"
          role="group"
          aria-label="보유 상태 선택"
        >
          {OWNED_FILTERS.map((filter) => (
            <button
              type="button"
              key={filter.value}
              className={ownedFilter === filter.value ? "is-active" : ""}
              aria-pressed={ownedFilter === filter.value}
              onClick={() => setOwnedFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <span className="collection-catalog-result" aria-live="polite">
          {visibleMembershipCount === filteredCards.length
            ? `${filteredCards.length.toLocaleString("ko-KR")}장`
            : `${filteredCards.length.toLocaleString("ko-KR")}종 · 수록 ${visibleMembershipCount.toLocaleString("ko-KR")}건`}
        </span>
      </div>

      {releaseGroups.length ? (
        <div className="collection-catalog-releases">
          {visibleReleaseGroups.map(({ release, total, owned, rarityGroups }) => {
            const percent = total ? Math.round((owned / total) * 100) : 0;
            const headingId = `${kind}-release-${release.id}`;
            const status = releaseStatus(release);
            return (
              <section
                className="collection-catalog-release"
                key={release.id}
                aria-labelledby={headingId}
              >
                <header className="collection-catalog-release__heading">
                  <div>
                    <small>
                      {release.category} · {formatReleaseDate(release.releaseDate)}
                      {status ? (
                        <b className={`is-${status}`}>
                          {status === "upcoming" ? "출시 예정" : "출시일 미정"}
                        </b>
                      ) : null}
                    </small>
                    <h3 id={headingId}>{release.name}</h3>
                    <span>{release.shortName}</span>
                  </div>
                  <div className="collection-catalog-release__progress">
                    <span>
                      <strong>{owned}</strong> / {total}장 · {percent}%
                    </span>
                    <i aria-hidden="true">
                      <b style={{ width: `${percent}%` }} />
                    </i>
                  </div>
                  <a href={release.sourceUrl} target="_blank" rel="noreferrer">
                    공식 정보
                    <ExternalLink size={14} aria-hidden="true" />
                  </a>
                </header>

                <div className="collection-catalog-rarities">
                  {rarityGroups.map((rarityGroup) => (
                    <section
                      className="collection-catalog-rarity"
                      key={rarityGroup.id}
                      aria-labelledby={`${headingId}-${rarityGroup.id}`}
                    >
                      <div className="collection-catalog-rarity__heading">
                        <h4 id={`${headingId}-${rarityGroup.id}`}>
                          {rarityGroup.label}
                        </h4>
                        <span>{rarityGroup.cards.length}장</span>
                      </div>
                      <div className="collection-catalog-grid">
                        {rarityGroup.cards.map((card) => (
                          <CatalogCard
                            key={card.id}
                            card={card}
                            rarity={rarityById.get(card.rarityId)}
                            release={release}
                            isOwned={ownedIds.has(card.id)}
                            onToggleOwned={toggleOwned}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </section>
            );
          })}
          {hiddenReleaseCount > 0 ? (
            <button
              type="button"
              className="collection-catalog-more"
              onClick={() =>
                setVisibleReleaseCount(
                  (current) => current + RELEASE_BATCH_SIZE,
                )
              }
            >
              다음 {Math.min(hiddenReleaseCount, RELEASE_BATCH_SIZE)}개 출시 더 보기
              <small>남은 출시 {hiddenReleaseCount}개</small>
            </button>
          ) : null}
        </div>
      ) : (
        <div className="collection-catalog-empty">
          <SearchX size={31} aria-hidden="true" />
          <strong>조건에 맞는 {meta.itemLabel}가 없습니다</strong>
          <p>검색어 또는 팩·등급·보유 필터를 바꿔 주세요.</p>
        </div>
      )}
    </section>
  );
}

export default CollectionCatalogPage;
