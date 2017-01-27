import { DllEntry } from './models';
export * from '../utils';
export declare function parseDllEntries(baseDir: string, dlls: (string | DllEntry)[], target: string, env: string): DllEntry[];
export declare function parseDllEntryValues(baseDir: string, entryValue: any, env: string): string[];
export declare function packageChunkSort(packages: string[]): (left: any, right: any) => 1 | -1;
export declare function isWebpackDevServer(): boolean;
export declare function hasProdArg(): boolean;
export declare function getEnv(debug: boolean, longName?: boolean): string;
export declare function isDllBuildFromNpmEvent(eventName?: string): boolean;
export declare function isAoTBuildFromNpmEvent(eventName?: string): boolean;
