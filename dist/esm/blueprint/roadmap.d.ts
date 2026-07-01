export interface RoadmapLike {
    name: string;
    type: "blueprint" | "parent-roadmap";
    status: string;
    parentRoadmap?: string;
}
export interface RoadmapRollup {
    children: number;
    done: number;
    inProgress: number;
    planned: number;
    draft: number;
}
export interface RoadmapNode {
    roadmap: RoadmapLike;
    children: RoadmapLike[];
    rollup: RoadmapRollup;
}
export interface RoadmapModel {
    roadmaps: RoadmapNode[];
    orphanChildren: RoadmapLike[];
}
export declare function buildRoadmapModel<T extends RoadmapLike>(blueprints: readonly T[]): RoadmapModel;
//# sourceMappingURL=roadmap.d.ts.map