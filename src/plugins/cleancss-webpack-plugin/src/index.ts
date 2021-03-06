// tslint:disable:no-any
// tslint:disable:no-unsafe-any
// tslint:disable:no-require-imports
// tslint:disable:no-var-requires

import { Compiler } from 'webpack';
import { RawSource, SourceMapSource } from 'webpack-sources';

// tslint:disable-next-line:variable-name
const CleanCSS = require('clean-css');

interface Chunk {
    files: string[];
}

export interface CleanCssWebpackPluginOptions {
    sourceMap: boolean;
    test(file: string): boolean;
}

function hook(
    compiler: Compiler,
    action: (compilation: any, chunks: Chunk[]) => Promise<void | void[]>,
): void {
    compiler.hooks.compilation.tap('cleancss-webpack-plugin', (compilation: any) => {
        compilation.hooks.optimizeChunkAssets.tapPromise(
            'cleancss-webpack-plugin',
            async (chunks: Chunk[]) => action(compilation, chunks)
        );
    });
}

export class CleanCssWebpackPlugin {
    private readonly _options: CleanCssWebpackPluginOptions;

    constructor(options: Partial<CleanCssWebpackPluginOptions>) {
        this._options = {
            sourceMap: false,
            test: (file) => file.endsWith('.css'),
            ...options,
        };
    }

    apply(compiler: Compiler): void {
        hook(compiler, async (compilation: any, chunks: Chunk[]) => {
            const cleancss = new CleanCSS({
                compatibility: 'ie9',
                level: {
                    2: {
                        skipProperties: [
                            'transition', // Fixes #12408
                            'font', // Fixes #9648
                        ]
                    }
                },
                inline: false,
                returnPromise: true,
                sourceMap: this._options.sourceMap,
            });

            const files: string[] = [...compilation.additionalChunkAssets];

            chunks.forEach(chunk => {
                if (chunk.files && chunk.files.length > 0) {
                    files.push(...chunk.files);
                }
            });

            const actions = files
                .filter(file => this._options.test(file))
                .map(async (file) => {
                    const asset = compilation.assets[file];
                    if (!asset) {
                        return Promise.resolve();
                    }

                    let content: string;
                    let map: any;
                    if (this._options.sourceMap && asset.sourceAndMap) {
                        const sourceAndMap = asset.sourceAndMap();
                        content = sourceAndMap.source;
                        map = sourceAndMap.map;
                    } else {
                        content = asset.source();
                    }

                    if (content.length === 0) {
                        return Promise.resolve();
                    }

                    return Promise.resolve()
                        .then(() => map ? cleancss.minify(content, map) : cleancss.minify(content))
                        .then((output: any) => {
                            let hasWarnings = false;
                            if (output.warnings && output.warnings.length > 0) {
                                compilation.warnings.push(...output.warnings);
                                hasWarnings = true;
                            }

                            if (output.errors && output.errors.length > 0) {
                                output.errors
                                    .forEach((error: string) => compilation.errors.push(new Error(error)));

                                return;
                            }

                            // generally means invalid syntax so bail
                            if (hasWarnings && output.stats.minifiedSize === 0) {
                                return;
                            }

                            let newSource: any;
                            if (output.sourceMap) {
                                newSource = new SourceMapSource(
                                    output.styles,
                                    file,
                                    output.sourceMap.toString(),
                                    content,
                                    map,
                                );
                            } else {
                                newSource = new RawSource(output.styles);
                            }

                            compilation.assets[file] = newSource;
                        });
                });

            return Promise.all(actions);
        });
    }
}
