import { z } from "zod";
export declare const BLUEPRINT_STATUS: readonly ["draft", "planned", "in-progress", "completed", "parked", "archived"];
export declare const BLUEPRINT_COMPLEXITY: readonly ["XS", "S", "M", "L", "XL"];
export declare const TASK_STATUS: readonly ["todo", "in-progress", "blocked", "done", "dropped"];
export declare const TECH_DEBT_STATUS: readonly ["accepted", "needs-remediation", "monitoring", "resolved"];
export declare const SEVERITY: readonly ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
export declare const TECH_DEBT_SEVERITY: readonly ["critical", "high", "medium", "low"];
export declare const TECH_DEBT_CATEGORY_VALUES: readonly ["documentation", "architecture", "testing", "performance", "security", "maintenance", "dependencies"];
export declare const REVIEW_CADENCE: readonly ["weekly", "biweekly", "monthly", "quarterly"];
export declare const VISIBILITY: readonly ["public", "private"];
export declare const TASK_FILE_OP: readonly ["create", "modify", "delete"];
export declare const blueprintStatusSchema: z.ZodEnum<{
    draft: "draft";
    planned: "planned";
    parked: "parked";
    "in-progress": "in-progress";
    completed: "completed";
    archived: "archived";
}>;
export declare const blueprintComplexitySchema: z.ZodEnum<{
    XS: "XS";
    S: "S";
    M: "M";
    L: "L";
    XL: "XL";
}>;
export declare const taskStatusSchema: z.ZodEnum<{
    "in-progress": "in-progress";
    todo: "todo";
    blocked: "blocked";
    done: "done";
    dropped: "dropped";
}>;
export declare const techDebtStatusSchema: z.ZodEnum<{
    accepted: "accepted";
    "needs-remediation": "needs-remediation";
    monitoring: "monitoring";
    resolved: "resolved";
}>;
export declare const severitySchema: z.ZodEnum<{
    CRITICAL: "CRITICAL";
    HIGH: "HIGH";
    MEDIUM: "MEDIUM";
    LOW: "LOW";
}>;
export declare const techDebtSeveritySchema: z.ZodEnum<{
    low: "low";
    medium: "medium";
    high: "high";
    critical: "critical";
}>;
export declare const techDebtCategorySchema: z.ZodEnum<{
    dependencies: "dependencies";
    testing: "testing";
    security: "security";
    documentation: "documentation";
    performance: "performance";
    architecture: "architecture";
    maintenance: "maintenance";
}>;
export declare const reviewCadenceSchema: z.ZodEnum<{
    weekly: "weekly";
    biweekly: "biweekly";
    monthly: "monthly";
    quarterly: "quarterly";
}>;
export declare const visibilitySchema: z.ZodEnum<{
    public: "public";
    private: "private";
}>;
export declare const taskFileOpSchema: z.ZodEnum<{
    delete: "delete";
    create: "create";
    modify: "modify";
}>;
//# sourceMappingURL=enums.d.ts.map