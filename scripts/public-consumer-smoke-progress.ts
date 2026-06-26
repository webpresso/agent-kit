const PHASE_PROGRESS_PREFIX = "[public-consumer-smoke]";

export function formatPhaseProgressLine(
  phase: string,
  event: "start" | "finish",
  detail?: string,
): string {
  const verb = event === "start" ? "START" : "FINISH";
  return detail
    ? `${PHASE_PROGRESS_PREFIX} ${verb} ${phase} :: ${detail}`
    : `${PHASE_PROGRESS_PREFIX} ${verb} ${phase}`;
}
