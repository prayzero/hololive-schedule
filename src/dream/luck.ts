export type LuckTone = "low" | "normal" | "high";

export interface LuckLabel {
  label: string;
  tone: LuckTone;
}

export interface InvalidLuckCalculation {
  valid: false;
  ratePercent: number;
  trials: number;
  acquired: number;
  guaranteed: number;
  naturalAcquired: number;
}

export interface ValidLuckCalculation
  extends Omit<InvalidLuckCalculation, "valid"> {
  valid: true;
  probability: number;
  atLeastOne: number;
  expectedNatural: number;
  expectedTotal: number;
  exact: number;
  atLeastObserved: number;
  luckPercentile: number;
  topPercent: number;
  luck: LuckLabel;
}

export type LuckCalculation =
  | InvalidLuckCalculation
  | ValidLuckCalculation;

export interface LuckRecordInput {
  trials: number;
  acquired: number;
  guaranteed: number;
  ratePercent: number;
}

export interface LuckRecordSummary {
  recordCount: number;
  totalPulls: number;
  totalAcquired: number;
  totalGuaranteed: number;
  naturalAcquired: number;
  expectedNatural: number;
  expectedTotal: number;
  luckPercentile: number | null;
  topPercent: number | null;
  luck: LuckLabel | null;
  approximate: boolean;
}

const LUCK_LABELS = [
  { max: 5, label: "아주 아쉬운 편", tone: "low" },
  { max: 20, label: "조금 아쉬운 편", tone: "low" },
  { max: 80, label: "평균적인 범위", tone: "normal" },
  { max: 95, label: "운이 좋은 편", tone: "high" },
  { max: Number.POSITIVE_INFINITY, label: "매우 운이 좋은 편", tone: "high" },
] as const;

function toInteger(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function luckLabel(percentile: number): LuckLabel {
  const match = LUCK_LABELS.find((item) => percentile < item.max);
  return {
    label: match?.label ?? "평균적인 범위",
    tone: match?.tone ?? "normal",
  };
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

function calculateLuckFromNumbers(
  ratePercent: number,
  trials: number,
  acquired: number,
  guaranteed: number,
): LuckCalculation {
  const naturalAcquired = Math.max(0, acquired - guaranteed);
  const isRateValid =
    Number.isFinite(ratePercent) && ratePercent > 0 && ratePercent <= 100;
  const isCountValid =
    Number.isInteger(trials) &&
    Number.isInteger(acquired) &&
    Number.isInteger(guaranteed) &&
    trials > 0 &&
    trials <= 10_000 &&
    acquired >= 0 &&
    acquired <= 10_000 &&
    guaranteed >= 0 &&
    guaranteed <= 10_000 &&
    acquired >= guaranteed &&
    naturalAcquired <= trials;

  if (!isRateValid || !isCountValid) {
    return {
      valid: false,
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
  const topPercent = clamp(100 - luckPercentile, 0, 100);

  return {
    valid: true,
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
    topPercent,
    luck: luckLabel(luckPercentile),
  };
}

export function calculateLuck(
  ratePercent: number,
  pullInput: string,
  acquiredInput: string,
  guaranteedInput: string,
): LuckCalculation {
  const rawTrials = Number(pullInput);
  const rawAcquired = Number(acquiredInput);
  const rawGuaranteed = Number(guaranteedInput);
  const trials = clamp(toInteger(pullInput), 0, 10_000);
  const acquired = clamp(toInteger(acquiredInput), 0, 10_000);
  const guaranteed = clamp(toInteger(guaranteedInput), 0, 10_000);

  const hasValidInput =
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
    rawGuaranteed <= 10_000;

  if (!hasValidInput) {
    return {
      valid: false,
      ratePercent,
      trials,
      acquired,
      guaranteed,
      naturalAcquired: Math.max(0, acquired - guaranteed),
    };
  }

  return calculateLuckFromNumbers(
    ratePercent,
    trials,
    acquired,
    guaranteed,
  );
}

function normalCdf(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    sign *
    (1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
        0.284496736) *
        t +
        0.254829592) *
        t *
        Math.exp(-x * x));
  return 0.5 * (1 + erf);
}

export function summarizeLuckRecords(
  records: LuckRecordInput[],
): LuckRecordSummary {
  const validRecords = records.filter((record) => {
    const result = calculateLuckFromNumbers(
      record.ratePercent,
      record.trials,
      record.acquired,
      record.guaranteed,
    );
    return result.valid && result.trials > 0;
  });

  const base = validRecords.reduce(
    (summary, record) => {
      const probability = record.ratePercent / 100;
      summary.totalPulls += record.trials;
      summary.totalAcquired += record.acquired;
      summary.totalGuaranteed += record.guaranteed;
      summary.naturalAcquired += record.acquired - record.guaranteed;
      summary.expectedNatural += record.trials * probability;
      summary.variance += record.trials * probability * (1 - probability);
      return summary;
    },
    {
      totalPulls: 0,
      totalAcquired: 0,
      totalGuaranteed: 0,
      naturalAcquired: 0,
      expectedNatural: 0,
      variance: 0,
    },
  );

  if (!validRecords.length || base.totalPulls === 0) {
    return {
      recordCount: 0,
      totalPulls: 0,
      totalAcquired: 0,
      totalGuaranteed: 0,
      naturalAcquired: 0,
      expectedNatural: 0,
      expectedTotal: 0,
      luckPercentile: null,
      topPercent: null,
      luck: null,
      approximate: false,
    };
  }

  let luckPercentile = 50;
  let approximate = false;
  const maxObserved = base.naturalAcquired;
  const groupedByRate = new Map<number, LuckRecordInput>();
  for (const record of validRecords) {
    const grouped = groupedByRate.get(record.ratePercent);
    if (grouped) {
      grouped.trials += record.trials;
      grouped.acquired += record.acquired;
      grouped.guaranteed += record.guaranteed;
    } else {
      groupedByRate.set(record.ratePercent, { ...record });
    }
  }
  const groupedRecords = [...groupedByRate.values()];
  const estimatedOperations = groupedRecords.reduce(
    (total, record) =>
      total + (maxObserved + 1) * (Math.min(record.trials, maxObserved) + 1),
    0,
  );

  if (groupedRecords.length === 1 && base.totalPulls <= 200_000) {
    const distribution = binomialDistribution(
      base.totalPulls,
      groupedRecords[0].ratePercent / 100,
    );
    let below = 0;
    for (let index = 0; index < maxObserved; index += 1) {
      below += distribution[index] ?? 0;
    }
    const exact = distribution[maxObserved] ?? 0;
    luckPercentile = clamp((below + exact * 0.5) * 100, 0, 100);
  } else if (
    base.totalPulls <= 20_000 &&
    maxObserved <= 600 &&
    estimatedOperations <= 4_000_000
  ) {
    let combined = new Float64Array(maxObserved + 1);
    combined[0] = 1;
    let currentMax = 0;

    for (const record of groupedRecords) {
      const distribution = binomialDistribution(
        record.trials,
        record.ratePercent / 100,
      );
      const next = new Float64Array(maxObserved + 1);
      const groupMax = Math.min(record.trials, maxObserved);

      for (let left = 0; left <= currentMax; left += 1) {
        const leftProbability = combined[left] ?? 0;
        if (leftProbability === 0) continue;
        const remaining = maxObserved - left;
        for (
          let right = 0;
          right <= Math.min(groupMax, remaining);
          right += 1
        ) {
          next[left + right] += leftProbability * (distribution[right] ?? 0);
        }
      }

      combined = next;
      currentMax = Math.min(maxObserved, currentMax + groupMax);
    }

    let below = 0;
    for (let index = 0; index < maxObserved; index += 1) {
      below += combined[index] ?? 0;
    }
    const exact = combined[maxObserved] ?? 0;
    luckPercentile = clamp((below + exact * 0.5) * 100, 0, 100);
  } else {
    approximate = true;
    if (base.variance > 0) {
      const z =
        (base.naturalAcquired - base.expectedNatural) /
        Math.sqrt(base.variance);
      luckPercentile = clamp(normalCdf(z) * 100, 0, 100);
    } else if (base.naturalAcquired < base.expectedNatural) {
      luckPercentile = 0;
    } else if (base.naturalAcquired > base.expectedNatural) {
      luckPercentile = 100;
    }
  }

  return {
    recordCount: validRecords.length,
    totalPulls: base.totalPulls,
    totalAcquired: base.totalAcquired,
    totalGuaranteed: base.totalGuaranteed,
    naturalAcquired: base.naturalAcquired,
    expectedNatural: base.expectedNatural,
    expectedTotal: base.expectedNatural + base.totalGuaranteed,
    luckPercentile,
    topPercent: clamp(100 - luckPercentile, 0, 100),
    luck: luckLabel(luckPercentile),
    approximate,
  };
}

export function formatProbability(value: number) {
  const percent = clamp(value * 100, 0, 100);
  if (percent > 0 && percent < 0.01) return "<0.01%";
  if (percent < 100 && percent > 99.99) return ">99.99%";
  return `${percent.toFixed(2)}%`;
}

export function formatExpected(value: number) {
  return value.toLocaleString("ko-KR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}

export function formatRatePercent(value: number) {
  return value.toLocaleString("ko-KR", {
    maximumFractionDigits: 4,
    minimumFractionDigits: 0,
  });
}

export function formatTopPercent(value: number) {
  const percent = clamp(value, 0, 100);
  if (percent > 0 && percent < 0.1) return "<0.1%";
  if (percent < 100 && percent > 99.9) return ">99.9%";
  return `${percent.toFixed(1)}%`;
}
