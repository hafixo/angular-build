import * as path from 'path';

import { ensureDir, writeFile } from 'fs-extra';
import * as minimatch from 'minimatch';
import * as webpack from 'webpack';

import { InternalError } from '../../../models/errors';
import { Logger, LogLevelString } from '../../../utils';

export interface WriteAssetsToDiskWebpackPluginOptions {
    outputPath?: string;
    emittedPaths?: string[];
    exclude?: string[];
    logLevel?: LogLevelString;
}

export class WriteAssetsToDiskWebpackPlugin {
    private readonly _options: WriteAssetsToDiskWebpackPluginOptions;
    private readonly _logger: Logger;
    private readonly _persistedOutputFileSystemNames = ['NodeOutputFileSystem'];

    get name(): string {
        return 'write-assets-to-disk-webpack-plugin';
    }

    constructor(options: Partial<WriteAssetsToDiskWebpackPluginOptions>) {
        this._options = {
            ...options
        };

        this._logger = new Logger({
            name: `[${this.name}]`,
            logLevel: this._options.logLevel || 'info'
        });
    }

    apply(compiler: webpack.Compiler): void {
        let outputPath = this._options.outputPath;
        if (!outputPath && compiler.options.output && compiler.options.output.path) {
            outputPath = compiler.options.output.path;
        }

        compiler.hooks.afterEmit.tapPromise(this.name, async (compilation: webpack.compilation.Compilation) => {
            if (this._persistedOutputFileSystemNames.includes(compiler.outputFileSystem.constructor.name)) {
                return;
            }

            if (!outputPath || outputPath === '/' || !path.isAbsolute(outputPath)) {
                compilation.errors.push(new InternalError(
                    `[${this.name}] Absolute output path must be specified in webpack config -> output -> path.`));

                return;
            }

            await this.writeAssets(outputPath, compilation);
            if (!this._options.emittedPaths || !this._options.emittedPaths.length) {
                return;
            }

            const emittedPaths = this._options.emittedPaths;
            await this.writeMemoryEmittedFiles(outputPath, emittedPaths, compiler);

        });
    }

    private async writeAssets(outputPath: string, compilation: webpack.compilation.Compilation): Promise<void> {
        await Promise.all(Object.keys(compilation.assets as { [key: string]: string }).map(async assetName => {
            // check the ignore list
            let shouldIgnore = false;
            const ignores = this._options.exclude || [];
            let il = ignores.length;
            while (il--) {
                const ignoreGlob = ignores[il];
                if (minimatch(assetName, ignoreGlob, { dot: true, matchBase: true })) {
                    shouldIgnore = true;
                    break;
                }
            }

            if (shouldIgnore) {
                return;
            }

            // tslint:disable-next-line: no-unsafe-any
            const asset = compilation.assets[assetName];
            // tslint:disable-next-line: no-unsafe-any
            const assetSource = Array.isArray(asset.source()) ? asset.source().join('\n') : asset.source();

            this._logger.debug(`Writing ${assetName} to disk`);

            const assetFilePath = path.resolve(outputPath, assetName);
            await ensureDir(path.dirname(assetFilePath));
            await writeFile(assetFilePath, assetSource);
        }));

    }

    private async writeMemoryEmittedFiles(outputPath: string, emittedPaths: string[], compiler: webpack.Compiler):
        Promise<void> {
        await Promise.all(emittedPaths.map(async (targetPath: string) => {
            const content = await new Promise((resolve, reject) => {
                // TODO: to review
                compiler.inputFileSystem.readFile(targetPath,
                    (err, data: Buffer) => {
                        if (err) {
                            reject(err);

                            return;
                        }

                        resolve(data);
                    });
            });

            this._logger.debug(`Writing ${path.relative(outputPath, targetPath)} to disk`);
            await writeFile(targetPath, content);
        }));
    }
}
