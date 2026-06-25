export const METRIC_CLASSES = [
  "byte_proxy",
  "provider_tokens_cost",
  "recall",
  "hook_latency",
  "native_speedup",
  "replacement_parity",
  "rtk_context_mode",
] as const;

export type MetricClass = (typeof METRIC_CLASSES)[number];

type ClaimPattern = {
  readonly pattern: RegExp;
  readonly cls: MetricClass;
  readonly exclude?: RegExp;
};

const CLAIM_PATTERNS: readonly ClaimPattern[] = [
  {
    pattern: /gainBytes|approxTokensSaved|bytes saved|byte reduction/iu,
    cls: "byte_proxy",
  },
  {
    pattern: /token savings|tokens saved|cost savings|provider tokens|99%|cost reduction/iu,
    cls: "provider_tokens_cost",
  },
  {
    pattern: /recall@|search quality|recall score|accuracy/iu,
    cls: "recall",
  },
  {
    pattern:
      /hook latency|preToolUse|postToolCapture|hook timing|startup latency|resume injection/iu,
    cls: "hook_latency",
    exclude: /wall time|end-to-end duration/iu,
  },
  {
    pattern: /native speedup|Rust speedup|NAPI|native backend|faster native/iu,
    cls: "native_speedup",
  },
  {
    pattern: /drop-in replacement|parity|compatible replacement/iu,
    cls: "replacement_parity",
  },
  {
    pattern: /RTK|context mode|context compression|rtk_context/iu,
    cls: "rtk_context_mode",
  },
];

type CardMetricRow = {
  readonly name: string;
  readonly value: string | number;
  readonly unit?: string;
};

type CardPattern = {
  readonly pattern: RegExp;
  readonly cls: MetricClass;
};

const CARD_PATTERNS: readonly CardPattern[] = [
  { pattern: /gainBytes|approxTokensSaved|bytesSaved|byteReduction/iu, cls: "byte_proxy" },
  {
    pattern: /tokensSaved|providerTokens|costSavings|costReduction/iu,
    cls: "provider_tokens_cost",
  },
  { pattern: /recall|searchQuality|accuracy/iu, cls: "recall" },
  {
    pattern: /hookLatency|preToolUse|postToolCapture|hookTiming|startupLatency|resumeInjection/iu,
    cls: "hook_latency",
  },
  { pattern: /nativeSpeedup|rustSpeedup|napi|nativeBackend|fasterNative/iu, cls: "native_speedup" },
  { pattern: /dropIn|parity|compatibleReplacement/iu, cls: "replacement_parity" },
  { pattern: /rtkContext|contextMode|contextCompression/iu, cls: "rtk_context_mode" },
];

export function classifyClaimLine(text: string): readonly MetricClass[] {
  const results: MetricClass[] = [];
  for (const { pattern, cls, exclude } of CLAIM_PATTERNS) {
    if (pattern.test(text) && !(exclude?.test(text) ?? false)) {
      results.push(cls);
    }
  }
  return results;
}

export function classifyCardMetric(metricRow: CardMetricRow): MetricClass {
  for (const { pattern, cls } of CARD_PATTERNS) {
    if (pattern.test(metricRow.name)) {
      return cls;
    }
  }
  return "byte_proxy";
}
