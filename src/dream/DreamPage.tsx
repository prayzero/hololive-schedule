import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  BarChart3,
  Calculator,
  CalendarDays,
  Check,
  ChevronRight,
  ExternalLink,
  Gamepad2,
  Info,
  LockKeyhole,
  SearchX,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import type {
  DreamCharacter,
  HololiveDreamsPayload,
  Talent,
  TalentBranch,
} from "../types";
import { DreamPickupPanel } from "./DreamPickupPanel";
import {
  calculateLuck,
  formatExpected,
  formatProbability,
  formatRatePercent,
} from "./luck";
import "./dream.css";

const STORAGE_KEY = "holo-now:dream-owned:v1";

type DreamPanel = "collection" | "pickup" | "calculator";
type CollectionFilter = "ALL" | "PICKUP" | TalentBranch;
type OwnedFilter = "all" | "owned" | "missing";

interface CollectionCharacter extends DreamCharacter {
  kind: "base" | "pickup";
  rarity?: number | null;
  pickupId?: string;
  pickupTitle?: string;
  cardTitle?: string;
  imageAlt?: string;
  imagePosition?: string;
  imageScale?: number;
}

interface DreamPageProps {
  payload: HololiveDreamsPayload;
  talents: Talent[];
  query: string;
  panel: DreamPanel;
  now: Date;
  onPanelChange: (panel: DreamPanel) => void;
}

const BRANCH_FILTERS: Array<{ value: TalentBranch; label: string }> = [
  { value: "JP", label: "JP" },
  { value: "DEV_IS", label: "DEV_IS" },
  { value: "EN", label: "EN" },
  { value: "ID", label: "ID" },
];

const COLLECTION_FILTERS: Array<{
  value: CollectionFilter;
  label: string;
}> = [
  { value: "ALL", label: "전체" },
  { value: "PICKUP", label: "픽업" },
  ...BRANCH_FILTERS,
];

const OWNED_FILTERS: Array<{ value: OwnedFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "owned", label: "보유" },
  { value: "missing", label: "미보유" },
];

const DREAM_BRANCH_ORDER: Record<TalentBranch, number> = {
  JP: 0,
  DEV_IS: 1,
  EN: 2,
  ID: 3,
};

const DREAM_GENERATION_ORDER: Record<string, number> = {
  "JP:0기생": 0,
  "JP:1기생": 1,
  "JP:1기생 · GAMERS": 1,
  "JP:2기생": 2,
  "JP:GAMERS": 3,
  "JP:3기생": 4,
  "JP:4기생": 5,
  "JP:5기생": 6,
  "JP:holoX": 7,
  "DEV_IS:ReGLOSS": 0,
  "EN:Myth": 0,
  "EN:Promise": 1,
  "EN:Advent": 2,
  "ID:ID 1기생": 0,
  "ID:ID 2기생": 1,
  "ID:ID 3기생": 2,
};

function readOwnedCharacters() {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : [],
    );
  } catch {
    return new Set<string>();
  }
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[’']/g, "")
    .replace(/\s+/g, "")
    .toLocaleLowerCase();
}

export function DreamPage({
  payload,
  talents,
  query,
  panel,
  now,
  onPanelChange,
}: DreamPageProps) {
  const [ownedIds, setOwnedIds] = useState<Set<string>>(readOwnedCharacters);
  const [collectionFilter, setCollectionFilter] =
    useState<CollectionFilter>("ALL");
  const [ownedFilter, setOwnedFilter] = useState<OwnedFilter>("all");
  const [ratePresetId, setRatePresetId] = useState(
    "summer-selected-star5",
  );
  const [pullInput, setPullInput] = useState("10");
  const [acquiredInput, setAcquiredInput] = useState("0");
  const [guaranteedInput, setGuaranteedInput] = useState("0");

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ownedIds]));
    } catch {
      // 저장 공간이 차단된 환경에서도 체크 기능 자체는 계속 동작합니다.
    }
  }, [ownedIds]);

  useEffect(() => {
    const syncStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setOwnedIds(readOwnedCharacters());
    };
    window.addEventListener("storage", syncStorage);
    return () => window.removeEventListener("storage", syncStorage);
  }, []);

  const talentById = useMemo(
    () => new Map(talents.map((talent) => [talent.id, talent])),
    [talents],
  );
  const normalizedQuery = normalizeSearch(query);
  const baseCharacters = useMemo<CollectionCharacter[]>(
    () =>
      [...payload.characters]
        .map((character) => ({
          ...character,
          kind: "base" as const,
        }))
        .sort(
          (left, right) =>
            DREAM_BRANCH_ORDER[left.branch] -
              DREAM_BRANCH_ORDER[right.branch] ||
            (DREAM_GENERATION_ORDER[
              `${left.branch}:${left.generation}`
            ] ?? 999) -
              (DREAM_GENERATION_ORDER[
                `${right.branch}:${right.generation}`
              ] ?? 999) ||
            left.nameKo.localeCompare(right.nameKo, "ko"),
        ),
    [payload.characters],
  );

  const pickupCharacters = useMemo<CollectionCharacter[]>(() => {
    const uniqueCards = new Map<string, CollectionCharacter>();

    for (const pickup of payload.pickups ?? []) {
      for (const card of pickup.cards) {
        if (uniqueCards.has(card.id)) continue;
        const talent = talentById.get(card.talentId);
        if (!talent) continue;
        uniqueCards.set(card.id, {
          id: card.id,
          talentId: talent.id,
          name: talent.name,
          nameKo: talent.nameKo,
          nativeName: talent.nativeName,
          branch: talent.branch,
          generation: talent.generation,
          imageUrl: card.imageUrl,
          accent: talent.accent,
          kind: "pickup",
          rarity: card.rarity,
          pickupId: pickup.id,
          pickupTitle: pickup.title,
          cardTitle: card.cardTitle,
          imageAlt: card.imageAlt,
          imagePosition: card.imagePosition,
          imageScale: card.imageScale,
        });
      }
    }

    return [...uniqueCards.values()].sort(
      (left, right) =>
        DREAM_BRANCH_ORDER[left.branch] - DREAM_BRANCH_ORDER[right.branch] ||
        (DREAM_GENERATION_ORDER[`${left.branch}:${left.generation}`] ?? 999) -
          (DREAM_GENERATION_ORDER[`${right.branch}:${right.generation}`] ??
            999) ||
        left.nameKo.localeCompare(right.nameKo, "ko"),
    );
  }, [payload.pickups, talentById]);

  const collectionCharacters = useMemo(
    () => [...pickupCharacters, ...baseCharacters],
    [baseCharacters, pickupCharacters],
  );
  const validCollectionIds = useMemo(
    () => new Set(collectionCharacters.map((character) => character.id)),
    [collectionCharacters],
  );
  const ownedCount = useMemo(
    () => [...ownedIds].filter((id) => validCollectionIds.has(id)).length,
    [ownedIds, validCollectionIds],
  );
  const completion = collectionCharacters.length
    ? Math.round((ownedCount / collectionCharacters.length) * 100)
    : 0;

  const branchProgress = useMemo(
    () =>
      BRANCH_FILTERS.map(({ value, label }) => {
        const branchCharacters = collectionCharacters.filter(
          (character) => character.branch === value,
        );
        const owned = branchCharacters.filter((character) =>
          ownedIds.has(character.id),
        ).length;
        return { value, label, owned, total: branchCharacters.length };
      }),
    [collectionCharacters, ownedIds],
  );

  const filteredCharacters = useMemo(
    () =>
      collectionCharacters.filter((character) => {
        const talent = talentById.get(character.talentId);
        const matchesCollection =
          collectionFilter === "ALL" ||
          (collectionFilter === "PICKUP" && character.kind === "pickup") ||
          character.branch === collectionFilter;
        const isOwned = ownedIds.has(character.id);
        const matchesOwned =
          ownedFilter === "all" ||
          (ownedFilter === "owned" && isOwned) ||
          (ownedFilter === "missing" && !isOwned);
        const searchable = normalizeSearch(
          [
            character.name,
            character.nameKo,
            character.nativeName,
            character.pickupTitle,
            character.cardTitle,
            character.kind === "pickup"
              ? `픽업${character.rarity ? ` ★${character.rarity}` : ""}`
              : "기본",
            talent?.aliases.join(" "),
          ]
            .filter(Boolean)
            .join(" "),
        );
        return (
          matchesCollection &&
          matchesOwned &&
          searchable.includes(normalizedQuery)
        );
      }),
    [
      collectionCharacters,
      collectionFilter,
      normalizedQuery,
      ownedFilter,
      ownedIds,
      talentById,
    ],
  );
  const filteredPickupCharacters = filteredCharacters.filter(
    (character) => character.kind === "pickup",
  );
  const filteredBaseCharacters = filteredCharacters.filter(
    (character) => character.kind === "base",
  );

  const selectedRatePreset =
    payload.gachaRates.targetPresets.find(
      (preset) => preset.id === ratePresetId,
    ) ?? payload.gachaRates.targetPresets[0];
  const selectedRatePercent = selectedRatePreset?.ratePercent ?? 0;
  const selectedProbability = selectedRatePercent / 100;
  const gachaVerifiedDate = payload.gachaRates.verifiedAt
    .slice(0, 10)
    .replace(/-/g, ".");

  const calculator = useMemo(
    () =>
      calculateLuck(
        selectedRatePercent,
        pullInput,
        acquiredInput,
        guaranteedInput,
      ),
    [acquiredInput, guaranteedInput, pullInput, selectedRatePercent],
  );

  const toggleOwned = (id: string) => {
    setOwnedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderCollectionCard = (character: CollectionCharacter) => {
    const isOwned = ownedIds.has(character.id);
    const talent = talentById.get(character.talentId);
    const accent = character.accent || talent?.accent || "#7c83ee";
    const cardStyle = {
      "--dream-accent": accent,
      "--dream-image-position": character.imagePosition ?? "50% 50%",
      "--dream-image-scale": character.imageScale ?? 1,
      "--dream-image-origin":
        character.kind === "pickup" &&
        character.imageScale &&
        character.imageScale > 1
          ? "43% 22%"
          : "50% 50%",
    } as CSSProperties;

    return (
      <button
        type="button"
        key={character.id}
        className={`dream-character-card${
          character.kind === "pickup" ? " is-pickup" : ""
        }${isOwned ? " is-owned" : ""}`}
        style={cardStyle}
        aria-pressed={isOwned}
        aria-label={`${character.nameKo} ${
          character.kind === "pickup" ? "픽업 카드 " : ""
        }${isOwned ? "보유 중. 미보유로 변경" : "미보유. 보유로 변경"}`}
        onClick={() => toggleOwned(character.id)}
      >
        <span className="dream-character-image">
          <img
            src={character.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
          />
          {character.kind === "pickup" ? (
            <span className="dream-character-pickup-badge" aria-hidden="true">
              {character.rarity ? `★${character.rarity} ` : ""}PICKUP
            </span>
          ) : null}
          <span className="dream-owned-check" aria-hidden="true">
            <Check size={16} strokeWidth={3} />
          </span>
          <span className="dream-owned-label">
            {isOwned ? "보유" : "미보유"}
          </span>
        </span>
        <span className="dream-character-copy">
          <small>
            {character.kind === "pickup"
              ? `${character.branch} · ${character.generation} · 픽업 카드`
              : `${character.branch} · ${character.generation}`}
          </small>
          <strong>{character.nameKo}</strong>
          <span>
            {character.kind === "pickup"
              ? character.cardTitle ?? character.pickupTitle
              : character.name}
          </span>
        </span>
      </button>
    );
  };

  return (
    <section
      className="dream-page"
      id="hololive-dream"
      aria-labelledby="dream-section-title"
    >
      <div className="dream-page-top">
        <div>
          <span className="dream-kicker">
            <Sparkles size={14} aria-hidden="true" />
            HOLOLIVE DREAMS
          </span>
          <h2 id="dream-section-title">
            캐릭터부터 픽업까지
            <br />
            홀로도리를 한곳에서
          </h2>
          <p>
            기본 캐릭터 {baseCharacters.length}명과 픽업 카드{" "}
            {pickupCharacters.length}장을 체크하고, 픽업별 나의 운 기록도
            계속 모아 보세요.
          </p>
        </div>

        <nav className="dream-panel-tabs" aria-label="홀로라이브 드림 메뉴">
          <button
            type="button"
            className={panel === "collection" ? "is-active" : ""}
            aria-current={panel === "collection" ? "page" : undefined}
            onClick={() => onPanelChange("collection")}
          >
            <Users size={17} aria-hidden="true" />
            내 캐릭터
          </button>
          <button
            type="button"
            className={panel === "pickup" ? "is-active" : ""}
            aria-current={panel === "pickup" ? "page" : undefined}
            onClick={() => onPanelChange("pickup")}
          >
            <CalendarDays size={17} aria-hidden="true" />
            픽업 일정
          </button>
          <button
            type="button"
            className={panel === "calculator" ? "is-active" : ""}
            aria-current={panel === "calculator" ? "page" : undefined}
            onClick={() => onPanelChange("calculator")}
          >
            <Calculator size={17} aria-hidden="true" />
            확률 계산기
          </button>
        </nav>
      </div>

      {panel === "collection" ? (
        <>
          <div className="dream-progress-card">
            <div className="dream-progress-main">
              <div className="dream-progress-ring" style={{ "--progress": `${completion * 3.6}deg` } as CSSProperties}>
                <span>
                  <strong>{completion}%</strong>
                  완성
                </span>
              </div>
              <div>
                <span>MY COLLECTION</span>
                <strong>
                  {ownedCount}
                  <small> / {collectionCharacters.length}장</small>
                </strong>
                <p>
                  기본 캐릭터와 같은 멤버의 픽업 카드는 별도로 체크됩니다.
                  카드를 누르면 보유 상태가 바뀝니다.
                </p>
              </div>
            </div>

            <div className="dream-branch-progress">
              {branchProgress.map((item) => {
                const percent = item.total ? (item.owned / item.total) * 100 : 0;
                return (
                  <div key={item.value}>
                    <span>
                      <strong>{item.label}</strong>
                      <small>
                        {item.owned}/{item.total}
                      </small>
                    </span>
                    <i aria-hidden="true">
                      <b style={{ width: `${percent}%` }} />
                    </i>
                  </div>
                );
              })}
            </div>

            <div className="dream-storage-note">
              <LockKeyhole size={17} aria-hidden="true" />
              <span>
                <strong>이 브라우저에 자동 저장</strong>
                로그인 없이 현재 기기에만 보유 목록을 저장합니다.
              </span>
            </div>
          </div>

          <div className="dream-filter-bar">
            <div className="dream-branch-tabs" aria-label="수집 카드 분류 선택">
              {COLLECTION_FILTERS.map((filter) => (
                <button
                  type="button"
                  key={filter.value}
                  className={
                    collectionFilter === filter.value ? "is-active" : ""
                  }
                  aria-pressed={collectionFilter === filter.value}
                  onClick={() => setCollectionFilter(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="dream-owned-tabs" aria-label="보유 상태 선택">
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
            <strong className="dream-result-count">
              {filteredCharacters.length}장
            </strong>
          </div>

          {filteredCharacters.length ? (
            <div className="dream-collection-groups">
              {filteredPickupCharacters.length ? (
                <section
                  className="dream-collection-group is-pickup"
                  aria-labelledby="dream-pickup-collection-title"
                >
                  <div className="dream-collection-group__heading">
                    <div>
                      <small>PICKUP COLLECTION</small>
                      <h3 id="dream-pickup-collection-title">
                        픽업 카드
                      </h3>
                    </div>
                    <span>{filteredPickupCharacters.length}장</span>
                  </div>
                  <div className="dream-character-grid is-pickup-grid">
                    {filteredPickupCharacters.map(renderCollectionCard)}
                  </div>
                </section>
              ) : null}

              {filteredBaseCharacters.length ? (
                <section
                  className="dream-collection-group"
                  aria-labelledby="dream-base-collection-title"
                >
                  <div className="dream-collection-group__heading">
                    <div>
                      <small>BASE COLLECTION</small>
                      <h3 id="dream-base-collection-title">
                        기본 캐릭터
                      </h3>
                    </div>
                    <span>{filteredBaseCharacters.length}장</span>
                  </div>
                  <div className="dream-character-grid">
                    {filteredBaseCharacters.map(renderCollectionCard)}
                  </div>
                </section>
              ) : null}
            </div>
          ) : (
            <div className="dream-empty">
              <SearchX size={30} aria-hidden="true" />
              <strong>조건에 맞는 수집 카드가 없습니다</strong>
              <p>검색어나 분류·보유 필터를 바꿔 주세요.</p>
            </div>
          )}
        </>
      ) : panel === "pickup" ? (
        <DreamPickupPanel
          pickups={payload.pickups ?? []}
          talents={talents}
          query={query}
          now={now}
        />
      ) : (
        <div className="dream-calculator-layout">
          <div className="dream-calculator-card">
            <div className="dream-card-heading">
              <span>
                <Calculator size={18} aria-hidden="true" />
              </span>
              <div>
                <small>LUCK CALCULATOR</small>
                <h3>내 뽑기 결과는 얼마나 운이 좋았을까요?</h3>
              </div>
            </div>

            <div className="dream-rate-selector">
              <div className="dream-rate-selector-heading">
                <span>계산할 대상</span>
                <small>
                  {payload.gachaRates.sourceLabel} · {gachaVerifiedDate} 확인
                </small>
              </div>
              <div
                className="dream-rate-presets"
                role="radiogroup"
                aria-label="계산 대상 제공 비율"
              >
                {payload.gachaRates.targetPresets.map((preset) => {
                  const isSelected = preset.id === selectedRatePreset?.id;
                  return (
                    <button
                      type="button"
                      key={preset.id}
                      className={isSelected ? "is-active" : ""}
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setRatePresetId(preset.id)}
                    >
                      <span>{preset.shortLabel}</span>
                      <strong>{formatRatePercent(preset.ratePercent)}%</strong>
                      <small>{preset.note}</small>
                    </button>
                  );
                })}
              </div>
              <div className="dream-selected-rate" aria-live="polite">
                <Check size={15} aria-hidden="true" />
                <span>
                  현재 적용값
                  <strong>{selectedRatePreset?.label ?? "제공 비율"}</strong>
                </span>
                <b>{formatRatePercent(selectedRatePercent)}%</b>
              </div>
            </div>

            <div className="dream-input-grid is-count-grid">
              <label>
                <span>
                  확률 적용 뽑기 수
                  <small>최대 10,000회</small>
                </span>
                <div className="dream-input-suffix">
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    step="1"
                    inputMode="numeric"
                    value={pullInput}
                    onChange={(event) => setPullInput(event.target.value)}
                  />
                  <span>회</span>
                </div>
              </label>
              <label>
                <span>
                  실제 획득 수
                  <small>확정 획득 포함</small>
                </span>
                <div className="dream-input-suffix">
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    step="1"
                    inputMode="numeric"
                    value={acquiredInput}
                    onChange={(event) => setAcquiredInput(event.target.value)}
                  />
                  <span>개</span>
                </div>
              </label>
              <label>
                <span>
                  확정 획득 수
                  <small>선택·교환·확정 보상</small>
                </span>
                <div className="dream-input-suffix">
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    step="1"
                    inputMode="numeric"
                    value={guaranteedInput}
                    onChange={(event) => setGuaranteedInput(event.target.value)}
                  />
                  <span>개</span>
                </div>
              </label>
            </div>

            {!calculator.valid ? (
              <div className="dream-calculator-placeholder" role="status">
                <Sparkles size={27} aria-hidden="true" />
                <strong>입력값을 확인해 주세요</strong>
                <p>
                  뽑기 수는 1 이상, 획득 수는 0 이상 정수로 입력하고 실제 획득
                  수는 확정 획득 수 이상이어야 합니다.
                </p>
                <span>확률은 선택한 게임 내 제공 비율로 자동 적용됩니다.</span>
              </div>
            ) : (
              <>
                <div
                  className={`dream-luck-result tone-${calculator.luck.tone}`}
                  aria-live="polite"
                >
                  <div>
                    <span>나의 운 상위 퍼센트</span>
                    <strong>{calculator.topPercent.toFixed(1)}%</strong>
                    <small>운 백분위 {calculator.luckPercentile.toFixed(1)}</small>
                  </div>
                  <div>
                    <Trophy size={25} aria-hidden="true" />
                    <strong>{calculator.luck.label}</strong>
                    <p>
                      확정분을 뺀 {calculator.naturalAcquired}개 획득 결과를 같은
                      확률의 다른 결과와 비교했습니다.
                    </p>
                  </div>
                </div>

                <div className="dream-metric-grid">
                  <article>
                    <span>1개 이상 획득</span>
                    <strong>{formatProbability(calculator.atLeastOne)}</strong>
                    <small>{calculator.trials}회 기준</small>
                  </article>
                  <article>
                    <span>기대 획득 수</span>
                    <strong>{formatExpected(calculator.expectedTotal)}개</strong>
                    <small>
                      확률분 {formatExpected(calculator.expectedNatural)} + 확정{" "}
                      {calculator.guaranteed}
                    </small>
                  </article>
                  <article>
                    <span>정확히 {calculator.naturalAcquired}개</span>
                    <strong>{formatProbability(calculator.exact)}</strong>
                    <small>확정분 제외</small>
                  </article>
                  <article>
                    <span>{calculator.naturalAcquired}개 이상</span>
                    <strong>{formatProbability(calculator.atLeastObserved)}</strong>
                    <small>이만큼 잘 나올 확률</small>
                  </article>
                </div>
              </>
            )}
          </div>

          <aside className="dream-calculator-side">
            <div className="dream-rate-board">
              <div className="dream-side-heading">
                <Sparkles size={18} aria-hidden="true" />
                <div>
                  <strong>확인된 기본 제공 비율</strong>
                  <span>
                    {payload.gachaRates.sourceLabel} · {gachaVerifiedDate} 확인
                  </span>
                </div>
              </div>
              <div className="dream-rarity-rates" aria-label="등급별 기본 제공 비율">
                <span>
                  <small>★3</small>
                  <strong>{payload.gachaRates.normalRates.star3}%</strong>
                </span>
                <span>
                  <small>★4</small>
                  <strong>{payload.gachaRates.normalRates.star4}%</strong>
                </span>
                <span>
                  <small>★5</small>
                  <strong>{payload.gachaRates.normalRates.star5}%</strong>
                </span>
              </div>
              <div className="dream-guaranteed-rate">
                <span>10연 ★4 이상 확정칸</span>
                <strong>
                  ★4 {payload.gachaRates.guaranteedTenthRates.star4}% · ★5{" "}
                  {payload.gachaRates.guaranteedTenthRates.star5}%
                </strong>
              </div>
              <div className="dream-rate-links">
                <a
                  href={payload.gachaRates.rateReferenceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  일반·확정칸 근거
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
                <a
                  href={payload.gachaRates.screenshotReferenceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  게임 화면 확인
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
                <a
                  href={payload.gachaRates.pickupReferenceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  픽업 비율 근거
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
              </div>
            </div>

            <div className="dream-chance-table">
              <div className="dream-side-heading">
                <BarChart3 size={18} aria-hidden="true" />
                <div>
                  <strong>뽑기 횟수별 1개 이상 확률</strong>
                  <span>
                    {selectedRatePreset?.shortLabel ?? "선택 대상"} · 1회{" "}
                    {formatRatePercent(selectedRatePercent)}%
                  </span>
                </div>
              </div>
              <div className="dream-chance-rows">
                {[10, 30, 50, 100].map((pulls) => {
                  const chance =
                    1 - Math.pow(1 - selectedProbability, pulls);
                  return (
                    <div key={pulls}>
                      <strong>{pulls}회</strong>
                      <i aria-hidden="true">
                        <b style={{ width: `${chance * 100}%` }} />
                      </i>
                      <span>{formatProbability(chance)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="dream-caution-card">
              <Info size={19} aria-hidden="true" />
              <div>
                <strong>계산 전에 확인해 주세요</strong>
                <p>
                  수치는 게임 내 제공 비율 화면을 기준으로 {gachaVerifiedDate}
                  확인했습니다. 공식 웹 공지는 상세 확률을 게임 안에서 확인하도록
                  안내하며, 배너가 바뀌면 수치도 달라질 수 있습니다.
                </p>
                <p>
                  10연 확정칸의 ★5 전체 확률도 5%입니다. 천장·교환·최초 재뽑기
                  등 확률 외 획득은 ‘확정 획득 수’에 따로 입력해 주세요.
                </p>
                <a
                  href={payload.gachaRates.officialNoticeUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  공식 게임 공지
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
              </div>
            </div>

            <div className="dream-official-card">
              <span className="dream-official-icon" aria-hidden="true">
                <Gamepad2 size={21} />
              </span>
              <div>
                <small>OFFICIAL GAME</small>
                <strong>hololive Dreams</strong>
                <p>새 배너의 최신 제공 비율은 게임 안에서 확인할 수 있습니다.</p>
              </div>
              <a
                href={payload.game.officialUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="hololive Dreams 공식 사이트 새 창에서 열기"
              >
                공식 사이트
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            </div>
          </aside>
        </div>
      )}

      <a
        className="dream-source-link"
        href={payload.sourceUrl}
        target="_blank"
        rel="noreferrer"
      >
        공식 캐릭터 명단 기준
        <ChevronRight size={14} aria-hidden="true" />
      </a>
    </section>
  );
}

export default DreamPage;
