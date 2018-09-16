// tslint:disable:no-unsafe-any

import { existsSync } from 'fs';
import * as path from 'path';

import { ModuleKind, ScriptTarget } from 'typescript';

import { InternalError, InvalidConfigError } from '../error-models';
import { LibProjectConfigInternal, TsTranspilationOptionsInternal } from '../interfaces/internals';
import { isInFolder, isSamePaths, normalizeRelativePath } from '../utils';

import { loadTsConfig } from './load-ts-config';
import { toTsScriptTarget } from './to-ts-script-target';

// tslint:disable-next-line:max-func-body-length
export function initTsTranspilationOptions(tsConfigPath: string,
    tsTranspilation: Partial<TsTranspilationOptionsInternal>,
    i: number,
    libConfig: LibProjectConfigInternal):
    TsTranspilationOptionsInternal {
    loadTsConfig(tsConfigPath, tsTranspilation, libConfig);
    if (!tsTranspilation._tsCompilerConfig) {
        throw new InternalError("The 'tsTranspilation._tsCompilerConfig' is not set.");
    }
    const compilerOptions = tsTranspilation._tsCompilerConfig.options;

    // scriptTarget
    let scriptTarget: ScriptTarget = ScriptTarget.ES2015;
    if (tsTranspilation.target) {
        const tsScriptTarget = toTsScriptTarget(tsTranspilation.target as string);
        if (tsScriptTarget) {
            scriptTarget = tsScriptTarget;
        }
    } else if (compilerOptions.target) {
        scriptTarget = compilerOptions.target;
    }

    // declaration
    let declaration = true;
    if (tsTranspilation.declaration === false) {
        declaration = false;
    } else if (!tsTranspilation.declaration && !compilerOptions.declaration) {
        declaration = false;
    }

    // tsOutDir
    const outputRootDir = libConfig._outputPath;
    let tsOutDir: string;
    if (tsTranspilation.outDir) {
        if (!outputRootDir) {
            throw new InvalidConfigError(
                `The 'projects[${libConfig.name || libConfig._index}].outputPath' value is required.`);
        }

        tsOutDir =
            path.resolve(outputRootDir, tsTranspilation.outDir);
        tsTranspilation._customTsOutDir = tsOutDir;
    } else {
        if (compilerOptions.outDir) {
            tsOutDir = path.isAbsolute(compilerOptions.outDir)
                ? path.resolve(compilerOptions.outDir)
                : path.resolve(path.dirname(tsConfigPath), compilerOptions.outDir);
        } else {
            if (!outputRootDir) {
                throw new InvalidConfigError(
                    `The 'projects[${libConfig.name || libConfig._index}].outputPath' value is required.`);
            }

            tsOutDir = outputRootDir;
            tsTranspilation._customTsOutDir = tsOutDir;
        }
    }
    if (compilerOptions.rootDir &&
        !isSamePaths(compilerOptions.rootDir, path.dirname(tsConfigPath))) {
        const relSubDir = isInFolder(compilerOptions.rootDir, path.dirname(tsConfigPath))
            ? normalizeRelativePath(
                path.relative(compilerOptions.rootDir, path.dirname(tsConfigPath)))
            : normalizeRelativePath(path.relative(path.dirname(tsConfigPath), compilerOptions.rootDir));
        tsOutDir = path.resolve(tsOutDir, relSubDir);
    }

    // typingsOutDir
    if (tsTranspilation.moveTypingFilesToPackageRoot) {
        tsTranspilation._typingsOutDir = libConfig._packageJsonOutDir;
    } else {
        tsTranspilation._typingsOutDir = tsOutDir;
    }

    // detect entry
    if (libConfig.packageEntryFileForTsTranspilation) {
        tsTranspilation._detectedEntryName =
            libConfig.packageEntryFileForTsTranspilation.replace(/\.(js|ts)$/i, '');
    } else {
        const flatModuleOutFile =
            !tsTranspilation.useTsc &&
                tsTranspilation._angularCompilerOptions &&
                tsTranspilation._angularCompilerOptions.flatModuleOutFile
                ? tsTranspilation._angularCompilerOptions.flatModuleOutFile as string
                : null;

        if (flatModuleOutFile) {
            tsTranspilation._detectedEntryName = flatModuleOutFile.replace(/\.js$/i, '');
        } else {
            const tsSrcDir = path.dirname(tsConfigPath);
            if (existsSync(path.resolve(tsSrcDir, 'index.ts'))) {
                tsTranspilation._detectedEntryName = 'index';
            } else if (existsSync(path.resolve(tsSrcDir, 'main.ts'))) {
                tsTranspilation._detectedEntryName = 'main';
            }
        }
    }

    // package entry points
    if (libConfig._packageJsonOutDir && tsTranspilation._detectedEntryName) {
        libConfig._packageEntryPoints = libConfig._packageEntryPoints || {};
        const packageEntryPoints = libConfig._packageEntryPoints;
        const packageJsonOutDir = libConfig._packageJsonOutDir;

        const entryFileAbs =
            path.resolve(tsOutDir, `${tsTranspilation._detectedEntryName}.js`);

        if ((compilerOptions.module === ModuleKind.ES2015 ||
            compilerOptions.module === ModuleKind.ESNext) &&
            (tsTranspilation.target === 'es2015' ||
                (!tsTranspilation.target && compilerOptions.target === ScriptTarget.ES2015))) {
            packageEntryPoints.es2015 = normalizeRelativePath(path.relative(packageJsonOutDir,
                entryFileAbs));
            packageEntryPoints.esm2015 = normalizeRelativePath(path.relative(packageJsonOutDir,
                entryFileAbs));
        } else if ((compilerOptions.module === ModuleKind.ES2015 ||
            compilerOptions.module === ModuleKind.ESNext) &&
            (tsTranspilation.target === 'es5' ||
                (!tsTranspilation.target && compilerOptions.target === ScriptTarget.ES5))) {
            packageEntryPoints.esm5 = normalizeRelativePath(path.relative(packageJsonOutDir,
                entryFileAbs));
            packageEntryPoints.module = normalizeRelativePath(path.relative(packageJsonOutDir,
                entryFileAbs));
        } else if (compilerOptions.module === ModuleKind.UMD ||
            compilerOptions.module === ModuleKind.CommonJS) {
            packageEntryPoints.main = normalizeRelativePath(path.relative(packageJsonOutDir,
                entryFileAbs));
        }

        if (compilerOptions._declaration && tsTranspilation._typingsOutDir) {
            packageEntryPoints.typings = normalizeRelativePath(path.relative(packageJsonOutDir,
                path.join(tsTranspilation._typingsOutDir, `${tsTranspilation._detectedEntryName}.d.ts`)));
        }
    }

    return {
        ...tsTranspilation,
        _index: i,
        _scriptTarget: scriptTarget,
        _tsConfigPath: tsConfigPath,
        // tslint:disable-next-line:no-any
        _tsConfigJson: tsTranspilation._tsConfigJson as { [key: string]: any },
        _tsCompilerConfig: tsTranspilation._tsCompilerConfig,
        _declaration: declaration,
        _tsOutDirRootResolved: tsOutDir
    };
}