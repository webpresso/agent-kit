import type { CAC } from 'cac';
export interface SecretsDoctorOptions {
    readonly cwd?: string;
    readonly json?: boolean;
    readonly profile?: string;
    readonly stdout?: Pick<NodeJS.WriteStream, 'write'>;
}
export declare function runSecretsDoctorCommand(options?: SecretsDoctorOptions): Promise<number>;
export declare function runSecretsCommand(action: string | undefined, options?: SecretsDoctorOptions): Promise<number>;
export declare function registerSecretsCommand(cli: CAC): void;
//# sourceMappingURL=secrets.d.ts.map