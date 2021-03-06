// Ref: https://github.com/angular/angular-cli

import * as path from 'path';

import * as autoprefixer from 'autoprefixer';
import { Configuration, Loader, loader as loaderWebpack, Plugin, RuleSetRule } from 'webpack';

// tslint:disable-next-line:import-name
import PostcssCliResources from '../../plugins/postcss-cli-resources';
import { RawCssLoader } from '../../plugins/raw-css-loader';
import { RemoveHashWebpacklugin } from '../../plugins/remove-hash-webpack-plugin';
import { SuppressEntryChunksWebpackPlugin } from '../../plugins/suppress-entry-chunks-webpack-plugin';

import { AngularBuildContext } from '../../build-context';
import { outputHashFormat, resolveLoaderPath } from '../../helpers';
import { InternalError } from '../../models/errors';
import { AppProjectConfigInternal } from '../../models/internals';

// tslint:disable-next-line: no-var-requires no-require-imports variable-name
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
// tslint:disable-next-line: no-var-requires no-require-imports
const postcssImports = require('postcss-import');

// tslint:disable:max-func-body-length
export async function
    getAppStylesWebpackConfigPartial(angularBuildContext: AngularBuildContext<AppProjectConfigInternal>): Promise<Configuration> {
    const logLevel = angularBuildContext.buildOptions.logLevel;

    const appConfig = angularBuildContext.projectConfig;

    if (!appConfig._projectRoot) {
        throw new InternalError("The 'appConfig._projectRoot' is not set.");
    }

    const projectRoot = appConfig._projectRoot;

    const extractCss = appConfig.extractCss;
    const isDll = appConfig._isDll;

    const extractedAssetsHashFormat = (!appConfig.platformTarget || appConfig.platformTarget === 'web') &&
        appConfig._outputHashing &&
        appConfig._outputHashing.extractedAssets !== false
        ? outputHashFormat.extractedAssets
        : '';
    const extractedCssHashFormat = (!appConfig.platformTarget || appConfig.platformTarget === 'web') &&
        appConfig._outputHashing &&
        (appConfig._outputHashing.bundles || appConfig._outputHashing.chunks)
        ?
        // Note: MiniCssExtractPlugin doesn't support contenthash
        outputHashFormat.extractedAssets
        : '';

    const includePaths: string[] = [];
    if (appConfig.stylePreprocessorOptions &&
        appConfig.stylePreprocessorOptions.includePaths &&
        appConfig.stylePreprocessorOptions.includePaths.length > 0
    ) {
        appConfig.stylePreprocessorOptions.includePaths.forEach((includePath: string) => {
            const includePathAbs = path.resolve(projectRoot, includePath);
            includePaths.push(includePathAbs);
        });
    }

    // const cssSourceMap = extractCss && appConfig.sourceMap;
    const cssSourceMap = appConfig.sourceMap;
    const deployUrl = appConfig.publicPath || '';
    const baseHref = appConfig.baseHref || '';

    const rawLoader = await resolveLoaderPath('raw-loader');
    const postcssLoader = await resolveLoaderPath('postcss-loader');
    const sassLoader = await resolveLoaderPath('sass-loader');
    const styleLoader = await resolveLoaderPath('style-loader');

    const postcssPluginCreator = (loader: loaderWebpack.LoaderContext) => [
        // tslint:disable-next-line: no-unsafe-any
        postcssImports({
            resolve: (url: string) => (url.startsWith('~') ? url.substr(1) : url),
            load: async (filename: string) => {
                return new Promise<string>((resolve, reject) => {
                    // tslint:disable-next-line: no-unsafe-any
                    loader.fs.readFile(filename, (err: Error, data: Buffer) => {
                        if (err) {
                            reject(err);

                            return;
                        }

                        const content = data.toString();
                        resolve(content);
                    });
                });
            },
        }),
        PostcssCliResources({
            baseHref,
            deployUrl,
            resourcesOutputPath: appConfig.resourcesOutputPath,
            loader,
            filename: `[name]${extractedAssetsHashFormat}.[ext]`
        }),
        autoprefixer()
    ];

    let sassImplementation: {} | undefined;
    try {
        // tslint:disable-next-line:no-implicit-dependencies no-require-imports no-unsafe-any
        sassImplementation = require('node-sass');
    } catch {
        // tslint:disable-next-line:no-implicit-dependencies no-require-imports no-unsafe-any
        sassImplementation = require('sass');
    }

    const baseRules: RuleSetRule[] = [
        { test: /\.css$/, use: [] },
        {
            test: /\.scss$|\.sass$/,
            use: [
                {
                    loader: sassLoader,
                    options: {
                        implementation: sassImplementation,
                        sourceMap: cssSourceMap,
                        sassOptions: {
                            // bootstrap-sass requires a minimum precision of 8
                            precision: 8,
                            includePaths,
                        }
                    }
                }
            ]
        }
    ];

    const entrypoints: { [key: string]: string[] } = {};
    const rules: RuleSetRule[] = [];
    const plugins: Plugin[] = [];
    const globalStylePaths: string[] = [];

    let shouldSuppressChunk = false;
    if (isDll) {
        if (appConfig.vendors && appConfig.vendors.length > 0) {
            if (!appConfig._dllParsedResult) {
                throw new InternalError("The 'appConfig._dllParsedResult' is not set.");
            }

            const dllResult = appConfig._dllParsedResult;

            dllResult.styleEntries.forEach(styleEntry => {
                globalStylePaths.push(styleEntry);
            });

            shouldSuppressChunk = !dllResult.scriptEntries.length && !dllResult.tsEntries.length;
        }
    } else {
        if (appConfig.styles && Array.isArray(appConfig.styles) && appConfig.styles.length > 0) {
            if (!appConfig._styleParsedEntries) {
                throw new InternalError("The 'appConfig._styleParsedEntries' is not set.");
            }

            const chunkNames: string[] = [];

            appConfig._styleParsedEntries.forEach(style => {
                if (style.lazy) {
                    chunkNames.push(style.entry);
                }

                globalStylePaths.push(...style.paths);

                entrypoints[style.entry]
                    ? entrypoints[style.entry].push(...style.paths)
                    : entrypoints[style.entry] = style.paths;
            });

            if (chunkNames.length > 0) {
                // Add plugin to remove hashes from lazy styles.
                plugins.push(new RemoveHashWebpacklugin({ chunkNames, hashFormats: [extractedCssHashFormat] }));
            }

            shouldSuppressChunk = true;
        }
    }

    // rules for global styles
    if (globalStylePaths.length > 0) {
        rules.push(...baseRules.map(({ test, use }) => {
            return {
                include: globalStylePaths,
                test,
                use: [
                    // TODO: to review for appConfig.platformTarget === 'node'
                    // tslint:disable-next-line: no-unsafe-any
                    extractCss ? MiniCssExtractPlugin.loader : styleLoader,
                    RawCssLoader,
                    {
                        loader: postcssLoader,
                        options: {
                            ident: extractCss ? 'extracted' : 'embedded',
                            plugins: postcssPluginCreator,
                            sourceMap: cssSourceMap && !extractCss ? 'inline' : cssSourceMap
                        }
                    },
                    ...(use as Loader[])
                ]
            };
        }));

        if (extractCss) {
            // extract global css from js files into own css file
            plugins.push(
                // tslint:disable-next-line: no-unsafe-any
                new MiniCssExtractPlugin({
                    filename: `[name]${extractedCssHashFormat}.css`
                }));

            if (shouldSuppressChunk) {
                const vendorChunkName = appConfig.vendorChunkName || 'vendor';
                const chunks = isDll ? [vendorChunkName] : Object.keys(entrypoints);
                // suppress empty .js files in css only entry points
                plugins.push(new SuppressEntryChunksWebpackPlugin({
                    chunks: chunks,
                    supressPattern: /\.js(\.map)?$/,
                    logLevel: logLevel
                }));
            }
        }
    }

    // inline styles
    const componentStyleRules = baseRules.map(({ test, use }) => ({
        exclude: globalStylePaths,
        test,
        use: [
            {
                loader: rawLoader
            },
            {
                loader: postcssLoader,
                options: {
                    ident: 'embedded',
                    plugins: postcssPluginCreator,
                    sourceMap: cssSourceMap ? 'inline' : false
                }
            },
            ...(use as Loader[])
        ]
    }));

    rules.push(...componentStyleRules);

    return {
        entry: Object.keys(entrypoints).length ? entrypoints : undefined,
        module: { rules: rules },
        plugins: plugins
    };
}
