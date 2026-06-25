export interface ProvenanceEntry {
  readonly sectionSlug: string;
  readonly sourcePath: string;
  readonly op: string;
  readonly layerIndex: number;
}

export interface ProvenanceMap {
  readonly generatedAt: string;
  readonly sourceFiles: readonly string[];
  readonly sections: readonly ProvenanceEntry[];
}

export function buildProvenance(
  entries: readonly ProvenanceEntry[],
  sourceFiles: readonly string[],
): ProvenanceMap {
  return {
    generatedAt: new Date().toISOString(),
    sourceFiles,
    sections: entries,
  };
}
