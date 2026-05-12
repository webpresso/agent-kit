import type { CAC } from 'cac';
export interface RunDoctorOptions {
    root?: string;
    docsRoot?: string;
    fix?: boolean;
    legacyOmx?: boolean;
}
export declare function runDoctor(options?: RunDoctorOptions): Promise<number>;
export declare function registerDoctorCommand(cli: CAC): void;
//# sourceMappingURL=doctor.d.ts.map