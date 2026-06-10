export interface VisionInterviewInput {
    repoName: string;
    isTTY?: boolean;
    yesFlag?: boolean;
    visionExists: boolean;
    inputStream?: NodeJS.ReadableStream;
    outputStream?: NodeJS.WritableStream;
}
export interface VisionAnswers {
    oneLiner: string;
    tagline: string;
    problem: string;
    inScope: readonly string[];
    outOfScope: readonly string[];
    principles: readonly string[];
}
/**
 * Returns answers to interpolate into the template, or `null` if the
 * interview should not run (non-TTY, --yes, or VISION.md already exists).
 */
export declare function maybeRunVisionInterview(input: VisionInterviewInput): Promise<VisionAnswers | null>;
//# sourceMappingURL=interview.d.ts.map