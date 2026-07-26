import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  BarChart3,
  Calculator,
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
import type { HololiveDreamsPayload, Talent, TalentBranch } from "../types";
import "./dream.css";

const STORAGE_KEY = "holo-now:dream-owned:v1";

type DreamPanel = "collection" | "calculator";
type BranchFilter = "ALL" | TalentBranch;
type OwnedFilter = "all" | "owned" | "missing";

interface DreamPageProps {
  payload: HololiveDreamsPayload;
  talents: Talent[];
  query: string;
  panel: DreamPanel;
  onPanelChange: (panel: DreamPanel) => void;
}

const BRANCHES: Array<{ value: BranchFilter; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: "JP", label: "JP" },
  { value: "DEV_IS", label: "DEV_IS" },
  { value: "EN", label: "EN" },
  { value: "ID", label: "ID" },
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

const LUCK_LABELS = [
  { max: 5, label: "아주 아쉬운 편", tone: "low" },
  { max: 20, label: "조금 아쉬운 편", tone: "low" },
  { max: 80, label: "평균적인 범위", tone: "normal" },
  { max: 95, label: "운이 좋은 편", tone: "high" },
  { max: Number.POSITIVE_INFINITY, label: "매우 운이 좋은 편", tone: "high" },
] as const;

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

function toInteger(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function binomialDistribution(trials: number, probability: number) {
  const result = new Float64Array(trials + 1);

  if (probability <= 0) {
    result[0] = 1;
    return result;
  }
  if (probability >= 1) {
    result[trials] = 1;
    return result;
  }

  const q = 1 - probability;
  const mode = clamp(Math.floor((trials + 1) * probability), 0, trials);
  result[mode] = 1;

  for (let k = mode; k > 0; k -= 1) {
    result[k - 1] =
      result[k] * (k / (trials - k + 1)) * (q / probability);
  }
  for (let k = mode; k < trials; k += 1) {
    result[k + 1] =
      result[k] * ((trials - k) / (k + 1)) * (probability / q);
  }

  let total = 0;
  for (const value of result) total += value;
  if (total > 0) {
    for (let index = 0; index < result.length; index += 1) {
      result[index] /= total;
    }
  }

  return result;
}

function formatProbability(value: number) {
  const percent = clamp(value * 100, 0, 100);
  if (percent > 0 && percent < 0.01) return "<0.01%";
  if (percent < 100 && percent > 99.99) return ">99.99%";
  return `${percent.toFixed(2)}%`;
}

function formatExpected(value: number) {
  return value.toLocaleString("ko-KR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}

export function DreamPage({
  payload,
  talents,
  query,
  panel,
  onPanelChange,
}: DreamPageProps) {
  const [ownedIds, setOwnedIds] = useState<Set<string>>(readOwnedCharacters);
  const [branchFilter, setBranchFilter] = useState<BranchFilter>("ALL");
  const [ownedFilter, setOwnedFilter] = useState<OwnedFilter>("all");
  const [rateInput, setRateInput] = useState("");
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
  const characters = useMemo(
    () =>
      [...payload.characters].sort(
        (left, right) =>
          DREAM_BRANCH_ORDER[left.branch] - DREAM_BRANCH_ORDER[right.branch] ||
          (DREAM_GENERATION_ORDER[`${left.branch}:${left.generation}`] ?? 999) -
            (DREAM_GENERATION_ORDER[`${right.branch}:${right.generation}`] ??
              999) ||
          left.nameKo.localeCompare(right.nameKo, "ko"),
      ),
    [payload.characters],
  );
  const validCharacterIds = useMemo(
    () => new Set(characters.map((character) => character.id)),
    [characters],
  );
  const ownedCount = useMemo(
    () => [...ownedIds].filter((id) => validCharacterIds.has(id)).length,
    [ownedIds, validCharacterIds],
  );
  const completion = characters.length
    ? Math.round((ownedCount / characters.length) * 100)
    : 0;

  const branchProgress = useMemo(
    () =>
      BRANCHES.slice(1).map(({ value, label }) => {
        const branchCharacters = characters.filter(
          (character) => character.branch === value,
        );
        const owned = branchCharacters.filter((character) =>
          ownedIds.has(character.id),
        ).length;
        return { value, label, owned, total: branchCharacters.length };
      }),
    [characters, ownedIds],
  );

  const filteredCharacters = useMemo(
    () =>
      characters.filter((character) => {
        const talent = talentById.get(character.talentId);
        const matchesBranch =
          branchFilter === "ALL" || character.branch === branchFilter;
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
            talent?.aliases.join(" "),
          ]
            .filter(Boolean)
            .join(" "),
        );
        return matchesBranch && matchesOwned && searchable.includes(normalizedQuery);
      }),
    [
      branchFilter,
      characters,
      normalizedQuery,
      ownedFilter,
      ownedIds,
      talentById,
    ],
  );

  const calculator = useMemo(() => {
    const ratePercent = Number(rateInput);
    const rawTrials = Number(pullInput);
    const rawAcquired = Number(acquiredInput);
    const rawGuaranteed = Number(guaranteedInput);
    const trials = clamp(toInteger(pullInput), 0, 10_000);
    const acquired = clamp(toInteger(acquiredInput), 0, 10_000);
    const guaranteed = clamp(toInteger(guaranteedInput), 0, 10_000);
    const naturalAcquired = Math.max(0, acquired - guaranteed);
    const isRateValid =
      rateInput.trim() !== "" &&
      Number.isFinite(ratePercent) &&
      ratePercent > 0 &&
      ratePercent <= 100;
    const isCountValid =
      pullInput.trim() !== "" &&
      acquiredInput.trim() !== "" &&
      guaranteedInput.trim() !== "" &&
      Number.isInteger(rawTrials) &&
      Number.isInteger(rawAcquired) &&
      Number.isInteger(rawGuaranteed) &&
      rawTrials >= 0 &&
      rawTrials <= 10_000 &&
      rawAcquired >= 0 &&
      rawAcquired <= 10_000 &&
      rawGuaranteed >= 0 &&
      rawGuaranteed <= 10_000 &&
      acquired >= guaranteed &&
      naturalAcquired <= trials;

    if (!isRateValid || !isCountValid) {
      return {
        valid: false as const,
        ratePercent,
        trials,
        acquired,
        guaranteed,
        naturalAcquired,
      };
    }

    const probability = ratePercent / 100;
    const distribution = binomialDistribution(trials, probability);
    const exact = distribution[naturalAcquired] ?? 0;
    let below = 0;
    for (let index = 0; index < naturalAcquired; index += 1) {
      below += distribution[index] ?? 0;
    }
    let atLeastObserved = 0;
    for (let index = naturalAcquired; index < distribution.length; index += 1) {
      atLeastObserved += distribution[index] ?? 0;
    }

    const luckPercentile = clamp((below + exact * 0.5) * 100, 0, 100);
    const luck = LUCK_LABELS.find((item) => luckPercentile < item.max)!;

    return {
      valid: true as const,
      ratePercent,
      probability,
      trials,
      acquired,
      guaranteed,
      naturalAcquired,
      atLeastOne: 1 - Math.pow(1 - probability, trials),
      expectedNatural: trials * probability,
      expectedTotal: trials * probability + guaranteed,
      exact,
      atLeastObserved,
      luckPercentile,
      luck,
    };
  }, [acquiredInput, guaranteedInput, pullInput, rateInput]);

  const toggleOwned = (id: string) => {
    setOwnedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
            뽑은 캐릭터와
            <br />
            나의 운을 한곳에서
          </h2>
          <p>
            공식 출시 명단 {characters.length}명을 체크하고, 배너의 실제 제공
            비율로 뽑기 결과를 계산해 보세요.
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
            className={panel === "calculator" ? "is-active" : ""}
            aria-current={panel === "calculator" ? "page" : undefined}
            onClick={() => onPanelChange("calculator")}
          >
            <Calculator size={17} aria-hidden="true" />
            확률 · 운 계산기
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
                  <small> / {characters.length}명</small>
                </strong>
                <p>
                  캐릭터를 누르면 보유 상태가 바뀝니다. 모두 모을 때까지 한 명씩
                  채워 보세요.
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
            <div className="dream-branch-tabs" aria-label="지부 선택">
              {BRANCHES.map((branch) => (
                <button
                  type="button"
                  key={branch.value}
                  className={branchFilter === branch.value ? "is-active" : ""}
                  aria-pressed={branchFilter === branch.value}
                  onClick={() => setBranchFilter(branch.value)}
                >
                  {branch.label}
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
            <strong className="dream-result-count">{filteredCharacters.length}명</strong>
          </div>

          {filteredCharacters.length ? (
            <div className="dream-character-grid">
              {filteredCharacters.map((character) => {
                const isOwned = ownedIds.has(character.id);
                const talent = talentById.get(character.talentId);
                const accent = character.accent || talent?.accent || "#7c83ee";

                return (
                  <button
                    type="button"
                    key={character.id}
                    className={`dream-character-card${isOwned ? " is-owned" : ""}`}
                    style={{ "--dream-accent": accent } as CSSProperties}
                    aria-pressed={isOwned}
                    aria-label={`${character.nameKo} ${isOwned ? "보유 중. 미보유로 변경" : "미보유. 보유로 변경"}`}
                    onClick={() => toggleOwned(character.id)}
                  >
                    <span className="dream-character-image">
                      <img
                        src={character.imageUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                      <span className="dream-owned-check" aria-hidden="true">
                        <Check size={16} strokeWidth={3} />
                      </span>
                      <span className="dream-owned-label">
                        {isOwned ? "보유" : "미보유"}
                      </span>
                    </span>
                    <span className="dream-character-copy">
                      <small>
                        {character.branch} · {character.generation}
                      </small>
                      <strong>{character.nameKo}</strong>
                      <span>{character.name}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="dream-empty">
              <SearchX size={30} aria-hidden="true" />
              <strong>조건에 맞는 캐릭터가 없습니다</strong>
              <p>검색어나 지부·보유 필터를 바꿔 주세요.</p>
            </div>
          )}
        </>
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

            <div className="dream-input-grid">
              <label>
                <span>
                  대상 1회 확률
                  <small>게임 내 제공 비율</small>
                </span>
                <div className="dream-input-suffix">
                  <input
                    type="number"
                    min="0.0001"
                    max="100"
                    step="0.01"
                    inputMode="decimal"
                    value={rateInput}
                    placeholder="예: 1.5"
                    onChange={(event) => setRateInput(event.target.value)}
                  />
                  <span>%</span>
                </div>
              </label>
              <label>
                <span>
                  확률 적용 뽑기 수
                  <small>최대 10,000회</small>
                </span>
                <div className="dream-input-suffix">
                  <input
                    type="number"
                    min="0"
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
                <strong>배너의 대상 확률을 입력해 주세요</strong>
                <p>
                  실제 게임의 뽑기 화면에 표시된 제공 비율을 넣으면 결과를 바로
                  계산합니다.
                </p>
                {rateInput.trim() !== "" && (
                  <span>
                    확률은 0% 초과 100% 이하, 실제 획득 수는 확정 획득 수 이상이어야
                    합니다.
                  </span>
                )}
              </div>
            ) : (
              <>
                <div
                  className={`dream-luck-result tone-${calculator.luck.tone}`}
                  aria-live="polite"
                >
                  <div>
                    <span>나의 운 백분위</span>
                    <strong>{calculator.luckPercentile.toFixed(1)}</strong>
                    <small>상위 {(100 - calculator.luckPercentile).toFixed(1)}%</small>
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
            <div className="dream-chance-table">
              <div className="dream-side-heading">
                <BarChart3 size={18} aria-hidden="true" />
                <div>
                  <strong>뽑기 횟수별 1개 이상 확률</strong>
                  <span>
                    {calculator.valid
                      ? `1회 ${calculator.ratePercent}% 기준`
                      : "확률을 입력하면 표시됩니다"}
                  </span>
                </div>
              </div>
              <div className="dream-chance-rows">
                {[10, 30, 50, 100].map((pulls) => {
                  const chance = calculator.valid
                    ? 1 - Math.pow(1 - calculator.probability, pulls)
                    : 0;
                  return (
                    <div key={pulls}>
                      <strong>{pulls}회</strong>
                      <i aria-hidden="true">
                        <b style={{ width: `${chance * 100}%` }} />
                      </i>
                      <span>
                        {calculator.valid ? formatProbability(chance) : "—"}
                      </span>
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
                  공식 공개 웹사이트에는 모든 배너에 공통으로 적용되는 제공 비율이
                  안내되어 있지 않습니다. 게임 내 해당 배너의 수치를 직접 입력해
                  주세요.
                </p>
                <p>
                  계산은 각 뽑기가 서로 독립이라는 이항분포를 사용합니다. 천장,
                  스텝업, 픽업 확정 및 보정 규칙은 자동 반영하지 않습니다.
                </p>
              </div>
            </div>

            <div className="dream-official-card">
              <span className="dream-official-icon" aria-hidden="true">
                <Gamepad2 size={21} />
              </span>
              <div>
                <small>OFFICIAL GAME</small>
                <strong>hololive Dreams</strong>
                <p>정확한 배너 정보와 제공 비율은 게임 안에서 확인해 주세요.</p>
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
