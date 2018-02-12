import * as path from 'path';

import { copy, remove, writeFile } from 'fs-extra';
import { ModuleKind, ScriptTarget } from 'typescript';

import {
    AngularBuildContext,
    BundleOptionsInternal,
    InvalidConfigError,
    LibProjectConfigInternal,
    TsTranspilationOptionsInternal
} from '../models';

import { Logger } from '../utils/logger';
import { isSamePaths, normalizeRelativePath } from '../utils/path-helpers';

const { exists } = require('fs-extra');

export async function performPackageJsonCopy(angularBuildContext: AngularBuildContext, customLogger?: Logger):
    Promise<void> {
    const libConfig = angularBuildContext.projectConfig as LibProjectConfigInternal;
    if (!libConfig.packageOptions) {
        return;
    }

    if (!angularBuildContext.packageJson) {
        throw new InvalidConfigError(`The 'libs[${libConfig._index
            }].packageOptions.packageJsonFile' value is required.`);
    }

    const projectRoot = AngularBuildContext.projectRoot;
    const logger = customLogger || AngularBuildContext.logger;

    const outDir = path.resolve(projectRoot, libConfig.outDir);
    let packageJsonOutDir = path.resolve(outDir, libConfig.packageOptions.packageJsonFileOutDir || '');
    packageJsonOutDir = replaceOutputTokens(packageJsonOutDir, angularBuildContext);

    const mainFields: {
        main?: string;
        module?: string;
        es2015?: string;
        typings?: string;
    } = {};

    let typingsEntryFileAbs = '';
    let flatModuleId = '';

    if (libConfig.tsTranspilation) {
        const tsTranspilation = libConfig.tsTranspilation as TsTranspilationOptionsInternal;
        if (tsTranspilation._tsCompilerConfig && tsTranspilation._tsOutDir) {
            const compilerOptions = tsTranspilation._tsCompilerConfig.options;
            const bundles = libConfig.bundles || [];
            let expectedMainEntryFile = '';
            let foundBundle = bundles.find(b => b.entryRoot === 'tsOutDir');
            if (foundBundle && foundBundle.entry) {
                expectedMainEntryFile = foundBundle.entry;
            } else if (!expectedMainEntryFile && await exists(path.resolve(tsTranspilation._tsOutDir, 'index.js'))) {
                expectedMainEntryFile = 'index.js';
            }

            if (tsTranspilation._angularCompilerOptions && tsTranspilation._angularCompilerOptions.flatModuleId) {
                flatModuleId = tsTranspilation._angularCompilerOptions.flatModuleId;
            }

            if (expectedMainEntryFile) {
                if (compilerOptions.module === ModuleKind.ES2015 &&
                    compilerOptions.target === ScriptTarget.ES2015) {
                    mainFields.es2015 = normalizeRelativePath(path.relative(packageJsonOutDir,
                        path.join(tsTranspilation._tsOutDir, expectedMainEntryFile)));
                } else if (compilerOptions.module === ModuleKind.ES2015 &&
                    compilerOptions.target === ScriptTarget.ES5) {
                    mainFields.module = normalizeRelativePath(path.relative(packageJsonOutDir,
                        path.join(tsTranspilation._tsOutDir, expectedMainEntryFile)));
                } else if ((compilerOptions.module === ModuleKind.UMD ||
                    compilerOptions.module === ModuleKind.CommonJS) &&
                    (compilerOptions.target === ScriptTarget.ES5 ||
                        compilerOptions.target === ScriptTarget.ES2015)) {
                    mainFields.main = normalizeRelativePath(path.relative(packageJsonOutDir,
                        path.join(tsTranspilation._tsOutDir, expectedMainEntryFile)));
                }

                const expectedTypingEntryFile = expectedMainEntryFile.replace(/\.js$/i, '.d.ts');
                if (compilerOptions.declaration &&
                    await exists(path.resolve(tsTranspilation._tsOutDir, expectedTypingEntryFile))) {
                    mainFields.typings = normalizeRelativePath(path.relative(packageJsonOutDir,
                        path.join(tsTranspilation._tsOutDir, expectedTypingEntryFile)));

                    typingsEntryFileAbs = path.resolve(tsTranspilation._tsOutDir, expectedTypingEntryFile);
                }
            }
        }
    }

    if (libConfig.bundles && libConfig.bundles.length) {
        for (let b of libConfig.bundles) {
            const bundle = b as BundleOptionsInternal;
            if (bundle._outputFilePath &&
                bundle.libraryTarget === 'es' &&
                bundle._expectedScriptTarget === ScriptTarget.ES2015) {
                mainFields.es2015 =
                    normalizeRelativePath(path.relative(packageJsonOutDir, bundle._outputFilePath));
            } else if (bundle._outputFilePath &&
                bundle.libraryTarget === 'es' &&
                bundle._expectedScriptTarget === ScriptTarget.ES5) {
                mainFields.module =
                    normalizeRelativePath(path.relative(packageJsonOutDir, bundle._outputFilePath));
            } else if (bundle._outputFilePath &&
                bundle.libraryTarget === 'umd' &&
                bundle._expectedScriptTarget === ScriptTarget.ES5) {
                mainFields.main =
                    normalizeRelativePath(path.relative(packageJsonOutDir, bundle._outputFilePath));
            }
        }
    }

    // typings entry or re-export
    if (libConfig.packageOptions.reExportTypingsAndMetaDataAs && typingsEntryFileAbs) {
        let reEportTypingsFileName = libConfig.packageOptions.reExportTypingsAndMetaDataAs;
        if (/\.metadata\.json$/i.test(reEportTypingsFileName)) {
            reEportTypingsFileName = reEportTypingsFileName.replace(/\.metadata\.json$/i, '');
        }
        if (!/\.d\.ts$/i.test(reEportTypingsFileName)) {
            reEportTypingsFileName = reEportTypingsFileName + '.d.ts';
        }
        reEportTypingsFileName = replaceOutputTokens(reEportTypingsFileName, angularBuildContext);

        let reEportTypingsFileAbs = path.resolve(packageJsonOutDir, reEportTypingsFileName);
        let reExportTypingsFileRelToPackageJson =
            normalizeRelativePath(path.relative(packageJsonOutDir, reEportTypingsFileAbs));
        mainFields.typings = reExportTypingsFileRelToPackageJson;

        if (isSamePaths(path.dirname(reEportTypingsFileAbs), path.dirname(typingsEntryFileAbs))) {
            // just rename

            // dts
            await copy(typingsEntryFileAbs, reEportTypingsFileAbs);
            await remove(typingsEntryFileAbs);

            // metadata
            await copy(typingsEntryFileAbs.replace(/\.d\.ts$/i, '.metadata.json'),
                reEportTypingsFileAbs.replace(/\.d\.ts$/i, '.metadata.json'));
            await remove(typingsEntryFileAbs.replace(/\.d\.ts$/i, '.metadata.json'));
        } else {
            // add banner to index
            let bannerContent = angularBuildContext.bannerText ? angularBuildContext.bannerText + '\n' : '';

            // typings re-exports
            let typingsEntryExportFromRel =
                `./${normalizeRelativePath(path.relative(path.dirname(reEportTypingsFileAbs), typingsEntryFileAbs))}`;
            typingsEntryExportFromRel = typingsEntryExportFromRel.replace(/\.d\.ts$/i, '');
            const reExportTypingsContent =
                `${bannerContent}export * from '${typingsEntryExportFromRel}';\n`;
            await writeFile(reEportTypingsFileAbs, reExportTypingsContent);

            // metadata re-exports
            const metaDataEntryExportFromRel = typingsEntryExportFromRel.replace(/\.d\.ts$/i, '');
            const metadataJson: any = {
                __symbolic: 'module',
                version: 3,
                metadata: {},
                exports: [{ from: metaDataEntryExportFromRel }]
            };

            if (flatModuleId) {
                metadataJson.flatModuleIndexRedirect = true;
                // metadataJson.importAs = flatModuleId;
            }

            const reEportMetaDataFileAbs = reEportTypingsFileAbs.replace(/\.d\.ts$/i, '.metadata.json');
            await writeFile(reEportMetaDataFileAbs, JSON.stringify(metadataJson));
        }
    }

    logger.info(`Copying and updating package.json`);

    // merge config
    const rootPackageJson = angularBuildContext.packageJson;
    const packageJson: any = Object.assign(JSON.parse(JSON.stringify(angularBuildContext.packageJson)), mainFields);
    if (packageJson.devDependencies) {
        delete packageJson.devDependencies;
    }
    if (angularBuildContext.projectVersion) {
        packageJson.version = angularBuildContext.projectVersion;
    }
    if (rootPackageJson.description &&
        (packageJson.description === '' ||
            packageJson.description === '[PLACEHOLDER]')) {
        packageJson.description = rootPackageJson.description;
    }
    if (rootPackageJson.keywords &&
        (packageJson.keywords === '' ||
            packageJson.keywords === '[PLACEHOLDER]' ||
            (packageJson.keywords && !packageJson.keywords.length))) {
        packageJson.keywords = rootPackageJson.keywords;
    }
    if (rootPackageJson.author &&
        (packageJson.author === '' ||
            packageJson.author === '[PLACEHOLDER]')) {
        packageJson.author = rootPackageJson.author;
    }
    if (rootPackageJson.license &&
        (packageJson.license === '' ||
            packageJson.license === '[PLACEHOLDER]')) {
        packageJson.license = rootPackageJson.license;
    }
    if (rootPackageJson.repository &&
        (packageJson.repository === '' ||
            packageJson.repository === '[PLACEHOLDER]')) {
        packageJson.repository = rootPackageJson.repository;
    }
    if (rootPackageJson.homepage &&
        (packageJson.homepage === '' ||
            packageJson.homepage === '[PLACEHOLDER]')) {
        packageJson.homepage = rootPackageJson.homepage;
    }

    // write package config
    await writeFile(path.resolve(packageJsonOutDir, 'package.json'),
        JSON.stringify(packageJson, null, 2));
}

function replaceOutputTokens(input: string, angularBuildContext: AngularBuildContext): string {
    input = input
        .replace(/\[package-?scope\]/g, angularBuildContext.packageScope || '')
        .replace(/\[parent-?package-?name\]/g, angularBuildContext.parentPackageName || '')
        .replace(/\[package-?name\]/g, angularBuildContext.packageNameWithoutScope || '');
    return input;
}
