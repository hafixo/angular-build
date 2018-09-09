import * as path from 'path';

import { pathExists, writeFile } from 'fs-extra';
import { ScriptTarget } from 'typescript';

import { AngularBuildContext, LibProjectConfigInternal, TsTranspilationOptionsInternal } from '../../../build-context';
import { TypescriptCompileError } from '../../../error-models';
import { globCopyFiles, Logger, normalizeRelativePath } from '../../../utils';

import { processNgResources } from './process-ng-resources';
import { replaceVersion } from './replace-version';

const spawn = require('cross-spawn');

export async function
  performTsTranspile<TConfig extends LibProjectConfigInternal>(angularBuildContext: AngularBuildContext<TConfig>,
    customLogger?: Logger): Promise<void> {
  const libConfig = angularBuildContext.projectConfig as LibProjectConfigInternal;
  if (!libConfig._tsTranspilations || !libConfig._tsTranspilations.length) {
    return;
  }

  const logger = customLogger ? customLogger : AngularBuildContext.logger;

  const tscCliPath = await getTscCliPath();
  const ngcCliPath = await getNgcCliPath();

  for (const tsTranspilation of libConfig._tsTranspilations) {
    const tsConfigPath = tsTranspilation._tsConfigPath;
    const compilerOptions = tsTranspilation._tsCompilerConfig!.options;

    const commandArgs: string[] = ['-p', tsConfigPath];

    if (tsTranspilation._customTsOutDir) {
      commandArgs.push('--outDir');
      commandArgs.push(tsTranspilation._customTsOutDir);
    }

    if (tsTranspilation.target) {
      commandArgs.push('--target');
      commandArgs.push(tsTranspilation.target);
    } else if (tsTranspilation._scriptTarget && !compilerOptions.target) {
      commandArgs.push('--target');
      commandArgs.push(ScriptTarget[tsTranspilation._scriptTarget]);
    }

    if (tsTranspilation._declaration !== compilerOptions.declaration) {
      commandArgs.push('--declaration');

      if (tsTranspilation._declaration === false) {
        commandArgs.push('false');
      }
    }

    logger.info(
      `Compiling typescript with ${tsTranspilation.useTsc ? 'tsc' : 'ngc'}, tsconfig: ${path.relative(
        AngularBuildContext.workspaceRoot,
        tsConfigPath)
      }`);

    await new Promise((resolve, reject) => {
      const errors: string[] = [];
      const commandPath = tsTranspilation.useTsc ? tscCliPath : ngcCliPath;
      const child = spawn(commandPath, commandArgs, {});
      child.stdout.on('data',
        (data: any) => {
          logger.debug(`${data}`);
        });
      child.stderr.on('data', (data: any) => errors.push(data.toString().trim()));
      child.on('error', (err: Error) => reject(err));
      child.on('exit',
        (exitCode: number) => {
          if (exitCode === 0) {
            afterTsTranspileTask(angularBuildContext, tsTranspilation, customLogger).then(() => {
              resolve();
            }).catch(err => {
              reject(err);
            });
          } else {
            reject(new TypescriptCompileError(errors.join('\n')));
          }
        });
    });
  }
}

async function afterTsTranspileTask<TConfig extends LibProjectConfigInternal>(angularBuildContext:
  AngularBuildContext<TConfig>,
  tsTranspilation: TsTranspilationOptionsInternal,
  customLogger?: Logger): Promise<void> {
  const logger = customLogger ? customLogger : AngularBuildContext.logger;
  const libConfig = angularBuildContext.projectConfig as LibProjectConfigInternal;
  const projectRoot = path.resolve(AngularBuildContext.workspaceRoot, libConfig.root || '');

  const outputRootDir = libConfig.outputPath
    ? path.resolve(AngularBuildContext.workspaceRoot, libConfig.outputPath)
    : null;

  const stylePreprocessorOptions = libConfig.stylePreprocessorOptions;
  const flatModuleOutFile =
    !tsTranspilation.useTsc &&
      tsTranspilation._angularCompilerOptions &&
      tsTranspilation._angularCompilerOptions.flatModuleOutFile
      ? tsTranspilation._angularCompilerOptions!.flatModuleOutFile as string
      : '';
  const projectVersion = libConfig._projectVersion;

  // replace version
  if (tsTranspilation.replaceVersionPlaceholder !== false && projectVersion) {
    logger.debug('Updating version placeholder');

    await replaceVersion(tsTranspilation._tsOutDirRootResolved,
      projectVersion,
      `${path.join(tsTranspilation._tsOutDirRootResolved, '**/version.js')}`);
  }

  // inline assets
  if (tsTranspilation.inlineAssets !== false) {
    logger.debug('Inlining template and style urls');

    let stylePreprocessorIncludePaths: string[] = [];
    if (stylePreprocessorOptions &&
      stylePreprocessorOptions.includePaths) {
      stylePreprocessorIncludePaths =
        stylePreprocessorOptions.includePaths
          .map(p => path.resolve(projectRoot, p));
    }

    await processNgResources(
      projectRoot,
      tsTranspilation._tsOutDirRootResolved,
      `${path.join(tsTranspilation._tsOutDirRootResolved, '**/*.js')}`,
      stylePreprocessorIncludePaths,
      flatModuleOutFile
        ? flatModuleOutFile.replace(/\.js$/i, '.metadata.json')
        : '');
  }

  // move typings and metadata files
  if (tsTranspilation.moveTypingFilesToPackageRoot &&
    tsTranspilation._declaration &&
    tsTranspilation._typingsOutDir &&
    tsTranspilation._typingsOutDir !== tsTranspilation._tsOutDirRootResolved) {
    if (tsTranspilation.useTsc) {
      logger.debug('Moving typing files to output root');

      await globCopyFiles(tsTranspilation._tsOutDirRootResolved,
        '**/*.+(d.ts)',
        tsTranspilation._typingsOutDir,
        true);
    } else {
      logger.debug('Moving typing and metadata files to output root');

      await globCopyFiles(tsTranspilation._tsOutDirRootResolved,
        '**/*.+(d.ts|metadata.json)',
        tsTranspilation._typingsOutDir,
        true);
    }
  }

  // Re-export
  if (tsTranspilation.reExportTypingEntryToOutputRoot !== false &&
    tsTranspilation._detectedEntryName &&
    outputRootDir &&
    tsTranspilation._typingsOutDir &&
    outputRootDir !== tsTranspilation._typingsOutDir) {

    const relPath = normalizeRelativePath(path.relative(outputRootDir, tsTranspilation._typingsOutDir));

    // add banner to index
    const bannerContent = libConfig._bannerText ? libConfig._bannerText + '\n' : '';

    if (tsTranspilation.useTsc) {
      logger.debug('Re-exporting typing files to output root');
    } else {
      logger.debug('Re-exporting typing and metadata entry files to output root');
    }

    const reExportTypingsContent =
      `${bannerContent}export * from './${relPath}/${tsTranspilation._detectedEntryName}';\n`;
    const reEportTypingsFileAbs = path.resolve(outputRootDir, `${tsTranspilation._detectedEntryName}.d.ts`);
    await writeFile(reEportTypingsFileAbs, reExportTypingsContent);

    if (!tsTranspilation.useTsc) {
      const metadataJson: any = {
        __symbolic: 'module',
        version: 3,
        metadata: {},
        exports: [{ from: `./${relPath}/${tsTranspilation._detectedEntryName}` }],
        flatModuleIndexRedirect: true,
      };

      const reEportMetaDataFileAbs = reEportTypingsFileAbs.replace(/\.d\.ts$/i, '.metadata.json');
      await writeFile(reEportMetaDataFileAbs, JSON.stringify(metadataJson, null, 2));
    }
  }
}

async function getNgcCliPath(): Promise<string> {
  const ngcCli = '.bin/ngc';

  if (AngularBuildContext.nodeModulesPath &&
    await pathExists(path.join(AngularBuildContext.nodeModulesPath, ngcCli))) {
    return path.join(AngularBuildContext.nodeModulesPath, ngcCli);
  }

  if (AngularBuildContext.cliRootPath &&
    await pathExists(path.join(AngularBuildContext.cliRootPath, 'node_modules', ngcCli))) {
    return path.join(AngularBuildContext.cliRootPath, 'node_modules', ngcCli);
  }

  if (AngularBuildContext.nodeModulesPath &&
    await pathExists(path.join(AngularBuildContext.nodeModulesPath,
      '@bizappframework/angular-build/node_modules',
      ngcCli))) {
    return path.join(AngularBuildContext.nodeModulesPath,
      '@bizappframework/angular-build/node_modules',
      ngcCli);
  }

  try {
    let internalNodeModulePath = path.dirname(require.resolve('@angular/compiler-cli'));
    while (internalNodeModulePath &&
      !/node_modules$/i.test(internalNodeModulePath) &&
      internalNodeModulePath !== path.dirname(internalNodeModulePath)) {
      internalNodeModulePath = path.dirname(internalNodeModulePath);
    }

    return path.join(internalNodeModulePath, ngcCli);
  } catch (err) {
    return 'ngc';
  }
}

async function getTscCliPath(): Promise<string> {
  const tscCli = '.bin/tsc';

  if (AngularBuildContext.nodeModulesPath &&
    await pathExists(path.join(AngularBuildContext.nodeModulesPath, tscCli))) {
    return path.join(AngularBuildContext.nodeModulesPath, tscCli);
  }

  if (AngularBuildContext.cliRootPath &&
    await pathExists(path.join(AngularBuildContext.cliRootPath, 'node_modules', tscCli))) {
    return path.join(AngularBuildContext.cliRootPath, 'node_modules', tscCli);
  }

  if (AngularBuildContext.nodeModulesPath &&
    await pathExists(path.join(AngularBuildContext.nodeModulesPath,
      '@bizappframework/angular-build/node_modules',
      tscCli))) {
    return path.join(AngularBuildContext.nodeModulesPath,
      '@bizappframework/angular-build/node_modules',
      tscCli);
  }

  return 'tsc';
}