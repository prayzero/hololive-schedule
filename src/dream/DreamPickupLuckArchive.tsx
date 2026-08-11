import {
  BarChart3,
  Check,
  ChevronDown,
  LockKeyhole,
  Save,
  Trash2,
  Trophy,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DreamPickup } from "../types";
import {
  calculateLuck,
  formatExpected,
  formatRatePercent,
  formatTopPercent,
  summarizeLuckRecords,
} from "./luck";

const LUCK_STORAGE_KEY = "holo-now:dream-pickup-luck:v1";

interface PickupLuckRecord {
  pickupId: string;
  pulls: number;
  acquired: number;
  guaranteed: number;
  ratePercentSnapshot: number;
  pickupTitleSnapshot: string;
  rateLabelSnapshot: string;
  updatedAt: string;
}

interface PickupLuckStore {
  version: 1;
  records: Record<string, PickupLuckRecord>;
}

interface PickupLuckDraft {
  ratePercent: string;
  pulls: string;
  acquired: string;
  guaranteed: string;
}

interface DreamPickupLuckArchiveProps {
  pickups: DreamPickup[];
}

const EMPTY_DRAFT: PickupLuckDraft = {
  ratePercent: "",
  pulls: "",
  acquired: "0",
  guaranteed: "0",
};

function validStoredRecord(value: unknown): value is PickupLuckRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<PickupLuckRecord>;
  return (
    typeof record.pickupId === "string" &&
    typeof record.pulls === "number" &&
    Number.isInteger(record.pulls) &&
    typeof record.acquired === "number" &&
    Number.isInteger(record.acquired) &&
    typeof record.guaranteed === "number" &&
    Number.isInteger(record.guaranteed) &&
    typeof record.ratePercentSnapshot === "number" &&
    Number.isFinite(record.ratePercentSnapshot) &&
    record.ratePercentSnapshot > 0 &&
    record.ratePercentSnapshot <= 100 &&
    typeof record.pickupTitleSnapshot === "string" &&
    typeof record.rateLabelSnapshot === "string" &&
    typeof record.updatedAt === "string" &&
    record.pulls > 0 &&
    record.pulls <= 10_000 &&
    record.acquired >= 0 &&
    record.acquired <= 10_000 &&
    record.guaranteed >= 0 &&
    record.guaranteed <= 10_000 &&
    record.acquired >= record.guaranteed &&
    record.acquired - record.guaranteed <= record.pulls
  );
}

function readLuckRecords(): Record<string, PickupLuckRecord> {
  if (typeof window === "undefined") {
    return {} as Record<string, PickupLuckRecord>;
  }

  try {
    const stored = window.localStorage.getItem(LUCK_STORAGE_KEY);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") return {};
    const store = parsed as Partial<PickupLuckStore>;
    if (
      store.version !== 1 ||
      !store.records ||
      typeof store.records !== "object" ||
      Array.isArray(store.records)
    ) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(store.records).filter(
        ([pickupId, value]) =>
          validStoredRecord(value) && pickupId === value.pickupId,
      ),
    );
  } catch {
    return {};
  }
}

function draftForPickup(
  pickup: DreamPickup,
  record?: PickupLuckRecord,
): PickupLuckDraft {
  return {
    ratePercent:
      typeof record?.ratePercentSnapshot === "number"
        ? String(record.ratePercentSnapshot)
        : typeof pickup.targetRatePercent === "number"
          ? String(pickup.targetRatePercent)
          : "",
    pulls: record ? String(record.pulls) : "",
    acquired: record ? String(record.acquired) : "0",
    guaranteed: record ? String(record.guaranteed) : "0",
  };
}

function formatSavedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "저장됨";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function DreamPickupLuckArchive({
  pickups,
}: DreamPickupLuckArchiveProps) {
  const [records, setRecords] =
    useState<Record<string, PickupLuckRecord>>(readLuckRecords);
  const [drafts, setDrafts] = useState<Record<string, PickupLuckDraft>>({});
  const [editingPickupId, setEditingPickupId] = useState<string | null>(null);
  const [savedPickupId, setSavedPickupId] = useState<string | null>(null);
  const [deletePendingPickupId, setDeletePendingPickupId] = useState<
    string | null
  >(null);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    try {
      const store: PickupLuckStore = { version: 1, records };
      window.localStorage.setItem(LUCK_STORAGE_KEY, JSON.stringify(store));
    } catch {
      // 저장 공간이 차단돼도 현재 탭에서 계산 기능은 계속 동작합니다.
    }
  }, [records]);

  useEffect(() => {
    const syncStorage = (event: StorageEvent) => {
      if (event.key !== LUCK_STORAGE_KEY) return;
      const nextRecords = readLuckRecords();
      setRecords(nextRecords);
      setDrafts({});
      setSavedPickupId(null);
    };
    window.addEventListener("storage", syncStorage);
    return () => window.removeEventListener("storage", syncStorage);
  }, []);

  const summary = useMemo(
    () =>
      summarizeLuckRecords(
        Object.values(records).map((record) => ({
          trials: record.pulls,
          acquired: record.acquired,
          guaranteed: record.guaranteed,
          ratePercent: record.ratePercentSnapshot,
        })),
      ),
    [records],
  );

  const openEditor = (pickup: DreamPickup) => {
    const nextId = editingPickupId === pickup.id ? null : pickup.id;
    if (nextId) {
      setDrafts((current) =>
        current[pickup.id]
          ? current
          : {
              ...current,
              [pickup.id]: draftForPickup(pickup, records[pickup.id]),
            },
      );
    }
    setSavedPickupId(null);
    setDeletePendingPickupId(null);
    setEditingPickupId(nextId);
  };

  const updateDraft = (
    pickupId: string,
    field: keyof PickupLuckDraft,
    value: string,
  ) => {
    setDrafts((current) => ({
      ...current,
      [pickupId]: {
        ...(current[pickupId] ?? EMPTY_DRAFT),
        [field]: value,
      },
    }));
    setSavedPickupId(null);
    setDeletePendingPickupId(null);
  };

  const saveRecord = (
    pickup: DreamPickup,
    calculation: ReturnType<typeof calculateLuck>,
  ) => {
    if (!calculation.valid || calculation.trials <= 0) {
      return;
    }

    const record: PickupLuckRecord = {
      pickupId: pickup.id,
      pulls: calculation.trials,
      acquired: calculation.acquired,
      guaranteed: calculation.guaranteed,
      ratePercentSnapshot: calculation.ratePercent,
      pickupTitleSnapshot: pickup.title,
      rateLabelSnapshot: pickup.rateLabel ?? "픽업 대상",
      updatedAt: new Date().toISOString(),
    };
    setRecords((current) => ({ ...current, [pickup.id]: record }));
    setDrafts((current) => ({
      ...current,
      [pickup.id]: draftForPickup(pickup, record),
    }));
    setSavedPickupId(pickup.id);
    setDeletePendingPickupId(null);
    setStatusMessage(`${pickup.title} 운 기록을 저장했습니다.`);
  };

  const deleteRecord = (pickup: DreamPickup) => {
    if (deletePendingPickupId !== pickup.id) {
      setDeletePendingPickupId(pickup.id);
      setStatusMessage(
        `${pickup.title} 기록을 삭제하려면 삭제 버튼을 한 번 더 누르세요.`,
      );
      return;
    }

    setRecords((current) => {
      const next = { ...current };
      delete next[pickup.id];
      return next;
    });
    setDrafts((current) => ({
      ...current,
      [pickup.id]: draftForPickup(pickup),
    }));
    setSavedPickupId(null);
    setDeletePendingPickupId(null);
    setStatusMessage(`${pickup.title} 운 기록을 삭제했습니다.`);
    window.requestAnimationFrame(() => {
      document
        .getElementById(`pickup-luck-toggle-${pickup.id}`)
        ?.focus();
    });
  };

  return (
    <section
      className={`dream-pickup-luck${
        summary.recordCount ? "" : " is-empty"
      }`}
      aria-labelledby="dream-pickup-luck-title"
    >
      <span className="sr-only" role="status">
        {statusMessage}
      </span>
      <div className="dream-pickup-luck__summary">
        <div className="dream-pickup-luck__lead">
          <span aria-hidden="true">
            <Trophy size={22} />
          </span>
          <div>
            <small>MY PICKUP LUCK</small>
            <h3 id="dream-pickup-luck-title">역대 나의 운</h3>
            {summary.topPercent === null ? (
              <p>픽업별 결과를 기록하면 누적 운을 확인할 수 있습니다.</p>
            ) : (
              <p>
                확정 획득을 제외한 결과를 픽업별 실제 확률로 합산했습니다.
              </p>
            )}
          </div>
        </div>

        {summary.topPercent === null ? (
          <div className="dream-pickup-luck__empty-result">
            <BarChart3 size={19} aria-hidden="true" />
            <span>
              아래 일정에서 <strong>운 기록</strong>을 눌러 시작하세요.
            </span>
          </div>
        ) : (
          <div
            className={`dream-pickup-luck__result tone-${
              summary.luck?.tone ?? "normal"
            }`}
          >
            <small>{summary.approximate ? "누적 추정 상위" : "역대 종합 상위"}</small>
            <strong>{formatTopPercent(summary.topPercent)}</strong>
            <span>{summary.luck?.label}</span>
          </div>
        )}

        <div className="dream-pickup-luck__metrics">
          <span>
            <small>기록 픽업</small>
            <strong>{summary.recordCount}건</strong>
          </span>
          <span>
            <small>누적 뽑기</small>
            <strong>{summary.totalPulls.toLocaleString("ko-KR")}회</strong>
          </span>
          <span>
            <small>자연 획득</small>
            <strong>{summary.naturalAcquired}개</strong>
          </span>
          <span>
            <small>자연 기대값</small>
            <strong>{formatExpected(summary.expectedNatural)}개</strong>
          </span>
        </div>

        <div className="dream-pickup-luck__storage">
          <LockKeyhole size={15} aria-hidden="true" />
          로그인 없이 이 브라우저에만 저장됩니다.
        </div>
      </div>

      <div className="dream-pickup-luck__records">
        {pickups.map((pickup) => {
          const record = records[pickup.id];
          const usesManualRate =
            typeof pickup.targetRatePercent !== "number";
          const draft =
            drafts[pickup.id] ?? draftForPickup(pickup, record);
          const rate = usesManualRate
            ? Number(draft.ratePercent)
            : (record?.ratePercentSnapshot ?? pickup.targetRatePercent ?? 0);
          const rateLabel =
            record?.rateLabelSnapshot ?? pickup.rateLabel ?? "픽업 대상";
          const calculation = calculateLuck(
            rate,
            draft.pulls,
            draft.acquired,
            draft.guaranteed,
          );
          const savedCalculation = record
            ? calculateLuck(
                record.ratePercentSnapshot,
                String(record.pulls),
                String(record.acquired),
                String(record.guaranteed),
              )
            : null;
          const isEditing = editingPickupId === pickup.id;
          const draftStarted = draft.pulls.trim() !== "";
          const manualRateStarted = draft.ratePercent.trim() !== "";
          const missingManualRate = usesManualRate && !manualRateStarted;
          const invalidManualRate =
            usesManualRate &&
            manualRateStarted &&
            (!Number.isFinite(rate) || rate <= 0 || rate > 100);
          const invalidDraft =
            (draftStarted || manualRateStarted) && !calculation.valid;
          const guideHasError =
            invalidManualRate ||
            (draftStarted && missingManualRate) ||
            (draftStarted && !calculation.valid);
          const editorId = `pickup-luck-editor-${pickup.id}`;
          const guideId = `pickup-luck-guide-${pickup.id}`;

          return (
            <article className="dream-pickup-luck-record" key={pickup.id}>
              <div className="dream-pickup-luck-record__row">
                <div className="dream-pickup-luck-record__meta">
                  <small>
                    {pickup.startsOn.replace(/-/g, ".")} ·{" "}
                    {rate ? `${formatRatePercent(rate)}%` : "확률 확인 중"}
                  </small>
                  <strong>{pickup.title}</strong>
                </div>

                {record && savedCalculation?.valid ? (
                  <div
                    className={`dream-pickup-luck-record__score tone-${savedCalculation.luck.tone}`}
                  >
                    <small>나의 기록</small>
                    <strong>
                      상위 {formatTopPercent(savedCalculation.topPercent)}
                    </strong>
                    <span>
                      {record.pulls}회 · 자연{" "}
                      {record.acquired - record.guaranteed}개
                    </span>
                  </div>
                ) : (
                  <div className="dream-pickup-luck-record__none">
                    아직 저장한 결과가 없습니다.
                  </div>
                )}

                <button
                  id={`pickup-luck-toggle-${pickup.id}`}
                  type="button"
                  className="dream-pickup-luck-record__toggle"
                  aria-expanded={isEditing}
                  aria-controls={editorId}
                  onClick={() => openEditor(pickup)}
                >
                  {record ? "기록 수정" : "운 기록"}
                  <ChevronDown
                    size={15}
                    aria-hidden="true"
                    className={isEditing ? "is-open" : ""}
                  />
                </button>
              </div>

              {isEditing ? (
                <form
                  className="dream-pickup-luck-editor"
                  id={editorId}
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveRecord(pickup, calculation);
                  }}
                >
                  <div className="dream-pickup-luck-editor__heading">
                    <div>
                      <small>{usesManualRate ? "MANUAL RATE" : "AUTO RATE"}</small>
                      {usesManualRate ? (
                        <strong>
                          공식 X에 제공 비율이 없어 게임 내 확률을 직접 입력합니다.
                        </strong>
                      ) : (
                        <strong>
                          {rateLabel} {formatRatePercent(rate)}% 자동 적용
                        </strong>
                      )}
                    </div>
                    {record ? (
                      <span>{formatSavedAt(record.updatedAt)} 저장</span>
                    ) : null}
                  </div>

                  <div
                    className={`dream-pickup-luck-form${
                      usesManualRate ? " has-manual-rate" : ""
                    }`}
                  >
                    {usesManualRate ? (
                      <label className="dream-pickup-luck-form__manual-rate">
                        <span>
                          픽업 대상 합계 제공 비율
                          <small>게임 내 공지 기준</small>
                        </span>
                        <div>
                          <input
                            type="number"
                            min="0.0001"
                            max="100"
                            step="0.0001"
                            inputMode="decimal"
                            value={draft.ratePercent}
                            aria-invalid={
                              invalidManualRate ||
                              (draftStarted && missingManualRate) ||
                              undefined
                            }
                            aria-describedby={guideId}
                            onChange={(event) =>
                              updateDraft(
                                pickup.id,
                                "ratePercent",
                                event.target.value,
                              )
                            }
                          />
                          <span>%</span>
                        </div>
                      </label>
                    ) : null}
                    <label>
                      <span>
                        확률 적용 뽑기 수
                        <small>최대 10,000회</small>
                      </span>
                      <div>
                        <input
                          type="number"
                          min="1"
                          max="10000"
                          step="1"
                          inputMode="numeric"
                          value={draft.pulls}
                          aria-invalid={invalidDraft || undefined}
                          aria-describedby={
                            !calculation.valid ? guideId : undefined
                          }
                          onChange={(event) =>
                            updateDraft(
                              pickup.id,
                              "pulls",
                              event.target.value,
                            )
                          }
                        />
                        <span>회</span>
                      </div>
                    </label>
                    <label>
                      <span>
                        실제 대상 획득 수
                        <small>확정 획득 포함</small>
                      </span>
                      <div>
                        <input
                          type="number"
                          min="0"
                          max="10000"
                          step="1"
                          inputMode="numeric"
                          value={draft.acquired}
                          aria-invalid={invalidDraft || undefined}
                          aria-describedby={
                            !calculation.valid ? guideId : undefined
                          }
                          onChange={(event) =>
                            updateDraft(
                              pickup.id,
                              "acquired",
                              event.target.value,
                            )
                          }
                        />
                        <span>개</span>
                      </div>
                    </label>
                    <label>
                      <span>
                        확정 획득 수
                        <small>천장·교환·확정 보상</small>
                      </span>
                      <div>
                        <input
                          type="number"
                          min="0"
                          max="10000"
                          step="1"
                          inputMode="numeric"
                          value={draft.guaranteed}
                          aria-invalid={invalidDraft || undefined}
                          aria-describedby={
                            !calculation.valid ? guideId : undefined
                          }
                          onChange={(event) =>
                            updateDraft(
                              pickup.id,
                              "guaranteed",
                              event.target.value,
                            )
                          }
                        />
                        <span>개</span>
                      </div>
                    </label>
                  </div>

                  {calculation.valid && calculation.trials > 0 ? (
                    <div
                      className={`dream-pickup-luck-preview tone-${calculation.luck.tone}`}
                    >
                      <div>
                        <small>이번 픽업 나의 운</small>
                        <strong>
                          상위 {formatTopPercent(calculation.topPercent)}
                        </strong>
                        <span>{calculation.luck.label}</span>
                      </div>
                      <div>
                        <span>
                          자연 획득
                          <strong>{calculation.naturalAcquired}개</strong>
                        </span>
                        <span>
                          자연 기대값
                          <strong>
                            {formatExpected(calculation.expectedNatural)}개
                          </strong>
                        </span>
                        <span>
                          기대 대비
                          <strong>
                            {calculation.naturalAcquired -
                              calculation.expectedNatural >=
                            0
                              ? "+"
                              : ""}
                            {formatExpected(
                              calculation.naturalAcquired -
                                calculation.expectedNatural,
                            )}
                            개
                          </strong>
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div
                      id={guideId}
                      className={`dream-pickup-luck-editor__guide${
                        guideHasError ? " is-error" : ""
                      }`}
                      role={guideHasError ? "alert" : "status"}
                    >
                      {missingManualRate
                        ? "게임 내 가챠 상세의 픽업 대상 합계 제공 비율(%)을 먼저 입력하세요."
                        : invalidDraft
                          ? "제공 비율은 0보다 크고 100 이하여야 합니다. 뽑기 수는 1 이상, 나머지는 0 이상 정수로 입력하고 실제 획득 수는 확정 획득 수보다 작을 수 없습니다."
                          : "뽑기 횟수를 입력하면 상위 퍼센트가 바로 계산됩니다."}
                    </div>
                  )}

                  <div className="dream-pickup-luck-actions">
                    {record ? (
                      <button
                        type="button"
                        className="is-delete"
                        onClick={() => deleteRecord(pickup)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                        {deletePendingPickupId === pickup.id
                          ? "한 번 더 눌러 삭제"
                          : "기록 삭제"}
                      </button>
                    ) : null}
                    <button
                      type="submit"
                      className="is-save"
                      disabled={!calculation.valid || calculation.trials <= 0}
                    >
                      {savedPickupId === pickup.id ? (
                        <Check size={14} aria-hidden="true" />
                      ) : (
                        <Save size={14} aria-hidden="true" />
                      )}
                      {savedPickupId === pickup.id
                        ? "저장 완료"
                        : record
                          ? "기록 업데이트"
                          : "기록 저장"}
                    </button>
                  </div>
                </form>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default DreamPickupLuckArchive;
