export const AGENT_KIT_TARBALL_SIZE_BUDGET_BYTES = 29_704_296;
export const AGENT_KIT_TARBALL_UNPACKED_SIZE_BUDGET_BYTES = 86_643_227;

export interface TarballSizeBudgetInput {
  readonly size?: number;
  readonly unpackedSize?: number;
}

export interface TarballSizeBudgetResult {
  readonly sizeOk: boolean;
  readonly unpackedOk: boolean;
  readonly size: number;
  readonly unpackedSize: number;
}

export function evaluateAgentKitTarballSizeBudget(
  packSummary: TarballSizeBudgetInput,
): TarballSizeBudgetResult {
  const size = packSummary.size ?? 0;
  const unpackedSize = packSummary.unpackedSize ?? 0;
  return {
    sizeOk: size <= AGENT_KIT_TARBALL_SIZE_BUDGET_BYTES,
    unpackedOk: unpackedSize <= AGENT_KIT_TARBALL_UNPACKED_SIZE_BUDGET_BYTES,
    size,
    unpackedSize,
  };
}
