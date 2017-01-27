﻿// see: https://webpack.js.org/configuration/
// Ref: https://github.com/AngularClass/angular2-webpack-starter
// Ref: https://github.com/MarkPieszak/aspnetcore-angular2-universal
// Ref: https://github.com/aspnet/JavaScriptServices/tree/dev/templates/Angular2Spa
// Ref: https://github.com/angular/angular-cli

import * as path from 'path';
import * as fs from 'fs';

// ReSharper disable InconsistentNaming
// Webpack built-in plugins
const CommonsChunkPlugin = require('webpack/lib/optimize/CommonsChunkPlugin');
const DefinePlugin = require('webpack/lib/DefinePlugin');
const DllPlugin = require('webpack/lib/DllPlugin');
const DllReferencePlugin = require('webpack/lib/DllReferencePlugin');
const IgnorePlugin = require('webpack/lib/IgnorePlugin');
const LoaderOptionsPlugin = require('webpack/lib/LoaderOptionsPlugin');
const NormalModuleReplacementPlugin = require('webpack/lib/NormalModuleReplacementPlugin');
const ProgressPlugin = require('webpack/lib/ProgressPlugin');
const ProvidePlugin = require('webpack/lib/ProvidePlugin');
const UglifyJsPlugin = require('webpack/lib/optimize/UglifyJsPlugin');

// Thrid-party plugins
const autoprefixer = require('autoprefixer');
const postcssDiscardComments = require('postcss-discard-comments');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const CompressionPlugin = require('compression-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const WebpackMd5Hash = require('webpack-md5-hash');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpackMerge = require('webpack-merge');
//var StatsPlugin = require('stats-webpack-plugin');
// ReSharper restore InconsistentNaming

// Internal plugins
//import { ResolvePublicPathHtmlWebpackPlugin } from './plugins/resolve-public-path-html-webpack-plugin';
import { IconWebpackPlugin, IconPluginOptions } from './plugins/icon-webpack-plugin';
import { SuppressEntryChunksWebpackPlugin } from './plugins/suppress-entry-chunks-webpack-plugin';
import { CustomizeAssetsHtmlWebpackPlugin } from './plugins/customize-assets-html-webpack-plugin';
import { TryBundleDllWebpackPlugin } from './plugins/try-bundle-dll-webpack-plugin';

import { AppConfig, BuildOptions, GlobalScopedEntry, ProductionReplacementEntry } from './models';
import { readJsonSync, parseDllEntries, packageChunkSort, isWebpackDevServer, getEnv } from './helpers';

export function getWebpackCommonConfig(projectRoot: string, appConfig: AppConfig, buildOptions: BuildOptions) {
    if (buildOptions.dll) {
        return getWebpackDllConfig(projectRoot, appConfig, buildOptions);
    } else {
        const ebpackSharedConfig = getWebpackSharedConfigPartial(projectRoot, appConfig, buildOptions);
        return webpackMerge(ebpackSharedConfig,
            getWebpackNonDllConfigPartial(projectRoot, appConfig, buildOptions));
    }
}

export function getWebpackDllConfig(projectRoot: string, appConfig: AppConfig, buildOptions: BuildOptions) {
    const webpackSharedConfig = getWebpackSharedConfigPartial(projectRoot, appConfig, buildOptions);
    return webpackMerge(webpackSharedConfig,
        getWebpackDllConfigPartial(projectRoot, appConfig, buildOptions));
}

// Partials
export function getWebpackSharedConfigPartial(projectRoot: string, appConfig: AppConfig, buildOptions: BuildOptions) {
    const appRoot = path.resolve(projectRoot, appConfig.root);
    // Set defaults
    appConfig.scripts = appConfig.scripts || ([] as string[]);
    appConfig.styles = appConfig.styles || ([] as string[]);
    appConfig.dllOutChunkName = appConfig.dllOutChunkName || 'vendor';
    if (appConfig.publicPath || appConfig.publicPath === '') {
        appConfig.publicPath = /\/$/.test(appConfig.publicPath) ? appConfig.publicPath : appConfig.publicPath + '/';
    }
    appConfig.target = appConfig.target || 'web';

    const sourceMap = buildOptions.debug || (!buildOptions.debug && buildOptions.sourceMapOnProduction);
    const appendHash = (buildOptions.debug && appConfig.appendOutputHashOnDevelopment) ||
        (!buildOptions.debug && appConfig.appendOutputHashOnProduction);

    const commonPlugins: any[] = [];

    // ProgressPlugin
    //
    if (buildOptions.progress) {
        commonPlugins.push(new ProgressPlugin());
    }

    // Generate stats
    //
    //if (emitStats) {
    //  commonPlugins.push(new StatsPlugin(path.resolve(appConfig.outDir, 'webpack-stats.json'),
    //    {
    //      chunkModules: true
    //    }));
    //}

    // Copy assets
    //
    let shouldCopyAssets = typeof appConfig.assets !== 'undefined' && Array.isArray(appConfig.assets);
    if (shouldCopyAssets && buildOptions.dll && !buildOptions.copyAssetsOnDllBuild) {
        shouldCopyAssets = false;
    }
    if (shouldCopyAssets && !buildOptions.dll && buildOptions.copyAssetsOnDllBuild && ((buildOptions.debug && appConfig.referenceDllsOnDevelopment) ||
        (!buildOptions.debug && appConfig.referenceDllsOnProduction))) {
        shouldCopyAssets = false;
    }
    if (shouldCopyAssets) {
        commonPlugins.push(getCopyAssetPlugin(appRoot, appConfig.assets));
    }

    // Production plugins
    //

    if (buildOptions.debug === false) {
        const prodPlugins = [
            new WebpackMd5Hash(),
            new LoaderOptionsPlugin({ debug: false, minimize: true }),
            new UglifyJsPlugin({
                beautify: false,
                mangle: {
                    screw_ie8: true,
                    keep_fnames: true
                },
                compress: {
                    screw_ie8: true
                },
                comments: false,
                sourceMap: sourceMap
            })
        ];

        if (appConfig.compressAssetsOnProduction) {

            prodPlugins.push(new CompressionPlugin({
                asset: '[path].gz[query]',
                algorithm: 'gzip',
                test: /\.js$|\.html$|\.css$/,
                threshold: 10240,
                minRatio: 0.8
            }));
        }

        // Production replacement modules
        if (!buildOptions.dll && appConfig.productionReplacementModules && appConfig.productionReplacementModules.length) {
            appConfig.productionReplacementModules.forEach((entry: ProductionReplacementEntry) => {
                prodPlugins.push(new NormalModuleReplacementPlugin(
                    new RegExp(entry.resourceRegExp, 'i'),
                    entry.newResource
                ));
            });
        }
        commonPlugins.push(...prodPlugins);
    }

    const webpackSharedConfig = {
        target: appConfig.target === 'node' ? 'node' : 'web',
        devtool: buildOptions.debug ? 'source-map' : false,
        context: projectRoot,
        output: {
            path: path.resolve(projectRoot, appConfig.outDir),
            publicPath: appConfig.publicPath,
            filename: appendHash
                ? '[name].[chunkhash].js'
                : '[name].js',
            sourceMapFilename: appendHash
                ? '[name].[chunkhash].map'
                : '[name].map',
            chunkFilename: appendHash
                ? '[id].[chunkhash].js'
                : '[id].js',
            // For dll only
            // The name of the global variable which the library's
            // require() function will be assigned to
            library: '[name]_[chunkhash]' //'[name]_lib' || '[name]_[hash]'
        },
        plugins: commonPlugins,
        // >= version 2.2
        performance: {
            hints: buildOptions.performanceHints ? 'warning' : false, // boolean | "error" | "warning"
            maxAssetSize: 320000, // int (in bytes),
            maxEntrypointSize: 400000, // int (in bytes)
            assetFilter(assetFilename: string) {
                // Function predicate that provides asset filenames
                return assetFilename.endsWith('.css') || assetFilename.endsWith('.js');
            }
        },
        node: {
            fs: 'empty',
            global: true,
            crypto: 'empty',
            tls: 'empty',
            net: 'empty',
            process: true,
            module: false,
            clearImmediate: false,
            setImmediate: false
        },
        stats: {
            colors: true,
            hash: true,
            timings: true,
            errors: true,
            errorDetails: true,
            warnings: true,

            publicPath: false,
            chunkModules: false, // TODO: set to true when console to file output is fixed

            reasons: buildOptions.debug,
            children: buildOptions.debug,
            assets: buildOptions.debug,
            version: buildOptions.debug,
            chunks: buildOptions.debug // make sure 'chunks' is false or it will add 5-10 seconds to your build and incremental build time, due to excessive output.
        }
    };

    return webpackSharedConfig;
}

export function getWebpackDllConfigPartial(projectRoot: string, appConfig: AppConfig, buildOptions: BuildOptions) {
    appConfig.dllOutChunkName = appConfig.dllOutChunkName || 'vendor';
    const appRoot = path.resolve(projectRoot, appConfig.root);
    const debug = buildOptions.debug;
    const env = getEnv(debug);
    // Entry
    const entries: string[] = [];
    const dllEntries = parseDllEntries(appRoot, appConfig.dlls, appConfig.target, env);
    dllEntries.forEach(de => {
        if (Array.isArray(de.entry)) {
            entries.push(...de.entry);
        } else {
            entries.push(de.entry);
        }
    });

    const entryPoints: { [key: string]: string[] } = {};
    entryPoints[appConfig.dllOutChunkName] = entries;

    // Rules
    const rules: any[] = [];

    // Plugins
    const plugins = [
        new DllPlugin({
            path: path.resolve(projectRoot, appConfig.outDir, `[name]-manifest.json`),
            name: '[name]_[chunkhash]' //'[name]_lib' || [name]_[chunkhash]' || '[name]_[hash]'
        }),

        // Workaround for https://github.com/stefanpenner/es6-promise/issues/100
        new IgnorePlugin(/^vertx$/)

        // Workaround for https://github.com/andris9/encoding/issues/16
        //new NormalModuleReplacementPlugin(/\/iconv-loader$/, require.resolve('node-noop')))
    ];

    // Favicons plugins
    const shouldGenerateIcons = typeof appConfig.faviconConfig !== 'undefined' &&
        appConfig.faviconConfig !== null &&
        buildOptions.generateIconsOnDllBuild;
    if (shouldGenerateIcons) {
        const faviconPlugins = getFaviconPlugins(projectRoot, appConfig, debug, false);
        if (faviconPlugins.length) {
            plugins.push(...faviconPlugins);

            // remove starting slash
            plugins.push(new CustomizeAssetsHtmlWebpackPlugin({
                removeStartingSlash: true
            }));
        }
    }

    const webpackDllConfig = {
        resolve: {
            extensions: ['.js']
        },
        entry: entryPoints,
        output: {
            libraryTarget: appConfig.target === 'node' ? 'commonjs2' : 'var'
        },
        module: {
            rules: rules
        },
        plugins: plugins
    };

    return webpackDllConfig;
}

export function getWebpackNonDllConfigPartial(projectRoot: string, appConfig: AppConfig, buildOptions: BuildOptions) {
    let entryPoints: { [key: string]: string[] } = {};
    let extraPlugins: any[] = [];
    let extraRules: any[] = [];
    let lazyChunks: string[] = [];

    // Try bundle dlls
    if (((buildOptions.debug && appConfig.referenceDllsOnDevelopment) ||
        (!buildOptions.debug && appConfig.referenceDllsOnProduction)) &&
        appConfig.tryBundleDlls) {
        const dllManifestFile = path.resolve(projectRoot, appConfig.outDir, `${appConfig.dllOutChunkName || 'vendor'}-manifest.json`);
        const webpackDllConfig = getWebpackDllConfig(projectRoot, appConfig, buildOptions);
        extraPlugins.push(new TryBundleDllWebpackPlugin({
            debug: buildOptions.debug,
            manifestFile: dllManifestFile,
            webpackDllConfig: webpackDllConfig
        }));
    }


    const nodeModulesPath = path.resolve(projectRoot, 'node_modules');
    const appRoot = path.resolve(projectRoot, appConfig.root);

    const debug = buildOptions.debug;
    const sourceMap = buildOptions.debug || (!buildOptions.debug && buildOptions.sourceMapOnProduction);
    const env = getEnv(debug);
    const envLong = getEnv(debug, true);
    const metadata = {
        'ENV': JSON.stringify(envLong),
        'process.env': {
            ENV: JSON.stringify(envLong),
            NODE_ENV: JSON.stringify(process.env.NODE_ENV)
        }
    };

    appConfig.dllOutChunkName = appConfig.dllOutChunkName || 'vendor';

    // Global scripts
    //
    if (appConfig.scripts && appConfig.scripts.length > 0) {
        const globalScripts = parseGlobalScopedEntry(appConfig.scripts, appRoot, 'scripts');

        // Add entry points and lazy chunks
        globalScripts.forEach(script => {
            if (script.lazy) {
                lazyChunks.push(script.entry);
            }
            entryPoints[script.entry] = (entryPoints[script.entry] || []).concat(script.path);
        });

        // Load global scripts using script-loader
        extraRules.push({
            include: globalScripts.map((script) => script.path),
            test: /\.js$/,
            loader: 'script-loader'
        });
    }

    // Global styles
    //
    if (appConfig.styles && appConfig.styles.length > 0) {
        const globalStyles = parseGlobalScopedEntry(appConfig.styles, appRoot, 'styles');
        let extractedCssEntryPoints: string[] = [];

        // Add entry points and lazy chunks
        globalStyles.forEach(style => {
            if (style.lazy) {
                lazyChunks.push(style.entry);
            }

            if (!entryPoints[style.entry]) {
                // Since this entry point doesn't exist yet, it's going to only have
                // extracted css and we can supress the entry point
                extractedCssEntryPoints.push(style.entry);
                entryPoints[style.entry] = (entryPoints[style.entry] || []).concat(style.path);
            } else {
                // Existing entry point, just push the css in
                entryPoints[style.entry].push(style.path);
            }
        });

        // Create css loaders for component css and for global css
        extraRules.push(...makeCssLoaders(globalStyles.map((style) => style.path)));

        if (extractedCssEntryPoints.length > 0) {
            // Don't emit the .js entry point for extracted styles
            extraPlugins.push(new SuppressEntryChunksWebpackPlugin({
                chunks: extractedCssEntryPoints,
                supressPattern: /\.js$/i,
                assetTagsFilterFunc: (tag: any) => !(tag.tagName === 'script' && tag.attributes.src && tag.attributes.src.match(/\.css$/i))

            }));
        }
    } else {
        // Non global styles
        // create css loaders for component css
        extraRules.push(...makeCssLoaders());
    }

    // Main entry
    //

    // Rules
    const rules: any = [
        // js source map
        {
            enforce: 'pre',
            test: /\.js$/,
            loader: 'source-map-loader',
            exclude: [nodeModulesPath]
        },

        // .json files are now supported without the json-loader, webpack >= 2.2
        {
            test: /\.json$/,
            loader: 'json-loader'
        },

        // html
        {
            test: /\.html$/,
            loader: 'raw-loader',
            exclude: [path.resolve(projectRoot, appConfig.root, appConfig.index || 'index.html')]
        },

        // font loaders
        {
            test: /\.(otf|ttf|woff|woff2)(\?v=\d+\.\d+\.\d+)?$/,
            loader: 'url-loader?limit=10000&name=assets/[name].[ext]'
        },
        {
            test: /\.eot(\?v=\d+\.\d+\.\d+)?$/,
            loader: 'file-loader?name=assets/[name].[ext]'
        },

        // Image loaders
        {
            test: /\.(jpg|png|gif)$/,
            loader: 'url-loader?limit=10000&name=assets/[name].[ext]'
        },
        {
            test: /\.(jpe?g|png|gif|svg)(\?{0}(?=\?|$))/,
            use: [
                'file-loader?name=assets/[name].[ext]',
                {
                    loader: 'image-webpack-loader',
                    options: {
                        progressive: true,
                        optimizationLevel: 7,
                        interlaced: false
                    }
                }
            ]
        }
    ].concat(extraRules);

    // Plugins
    const plugins: any = [
        new ExtractTextPlugin({
            filename: ((debug && appConfig.appendOutputHashOnDevelopment) ||
                (!debug && appConfig.appendOutputHashOnProduction))
                ? '[name].[chunkhash].css'
                : '[name].css',
            disable: false,
            allChunks: true
        }),
        new LoaderOptionsPlugin({
            test: /\.(css|scss|sass|less|styl)$/,
            options: {
                postcss: debug
                    ? [autoprefixer()]
                    : [
                        autoprefixer(),
                        postcssDiscardComments
                    ],
                cssLoader: { sourceMap: debug ? true : sourceMap },
                sassLoader: { sourceMap: debug ? true : sourceMap },
                lessLoader: { sourceMap: debug ? true : sourceMap },
                stylusLoader: { sourceMap: debug ? true : sourceMap },
                // context needed as a workaround https://github.com/jtangelder/sass-loader/issues/285
                context: projectRoot
            }
        })
    ].concat(extraPlugins);

    // Provide plugin
    //
    if (appConfig.provide && typeof appConfig.provide === 'object') {
        plugins.push(
            // NOTE: when adding more properties make sure you include them in custom-typings.d.ts
            new ProvidePlugin(appConfig.provide)
        );
    }

    // DefinePlugin
    //
    plugins.push(
        // NOTE: when adding more properties make sure you include them in custom-typings.d.ts
        new DefinePlugin(metadata)
    );

    // Replace environment
    //
    if (appConfig.environments && appConfig.environments[env]) {
        plugins.push(new NormalModuleReplacementPlugin(
            // This plugin is responsible for swapping the environment files.
            // Since it takes a RegExp as first parameter, we need to escape the path.
            // See https://webpack.github.io/docs/list-of-plugins.html#normalmodulereplacementplugin
            new RegExp(path.resolve(appRoot, appConfig.environments['source'])
                .replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&')),
            path.resolve(appRoot, appConfig.environments[env])
        ));
    }

    // htmlAttributes
    //
    let customTagAttributes: any = null;
    if (appConfig.htmlInjectOptions && (appConfig.htmlInjectOptions.customScriptAttributes || appConfig.htmlInjectOptions.customLinkAttributes)) {
        customTagAttributes = {
            scriptAttributes: appConfig.htmlInjectOptions.customScriptAttributes,
            linkAttributes: appConfig.htmlInjectOptions.customLinkAttributes
        };
    }

    // Styles Inject
    const separateStylesOut = appConfig.htmlInjectOptions && appConfig.htmlInjectOptions.stylesInjectOutFileName && entryPoints['styles'];
    const stylesHtmlWebpackPluginId = separateStylesOut ? 'StylesHtmlWebpackPlugin' : null;
    if (separateStylesOut) {
        plugins.push(new HtmlWebpackPlugin({
            templateContent: ' ',
            filename: path.resolve(projectRoot, appConfig.outDir, appConfig.htmlInjectOptions.stylesInjectOutFileName),
            title: '',
            chunks: ['styles'],
            customAttributes: customTagAttributes,
            inject: true,
            id: stylesHtmlWebpackPluginId
        }));

        // custom link attributes
        if (customTagAttributes) {
            plugins.push(new CustomizeAssetsHtmlWebpackPlugin({
                targetHtmlWebpackPluginId: stylesHtmlWebpackPluginId,
                customLinkAttributes: customTagAttributes.linkAttributes
            }));
        }

        // move head assets to body
        if (customTagAttributes) {
            plugins.push(new CustomizeAssetsHtmlWebpackPlugin({
                targetHtmlWebpackPluginId: stylesHtmlWebpackPluginId,
                moveHeadAssetsToBody: true
            }));
        }
    }

    // Favicons inject
    let shouldGenerateIcons = typeof appConfig.faviconConfig !== 'undefined' &&
        appConfig.faviconConfig !== null &&
        !(buildOptions.generateIconsOnDllBuild &&
            ((buildOptions.debug && appConfig.referenceDllsOnDevelopment) ||
                (!buildOptions.debug && appConfig.referenceDllsOnProduction)));
    if (shouldGenerateIcons) {
        const faviconPlugins = getFaviconPlugins(projectRoot, appConfig, debug, false, stylesHtmlWebpackPluginId);
        if (faviconPlugins.length) {
            plugins.push(...faviconPlugins);
        }
    }

    // Default inject
    if (appConfig.index || appConfig.indexOutFileName) {
        const defaultHtmlWebpackPluginId = 'DefaultHtmlWebpackPlugin';
        const excludeChunks = lazyChunks;
        if (separateStylesOut) {
            excludeChunks.push('styles');
        }

        if (appConfig.index && appConfig.index.trim()) {
            plugins.push(new HtmlWebpackPlugin({
                template: path.resolve(appRoot, appConfig.index),
                filename: path.resolve(projectRoot, appConfig.outDir, appConfig.indexOutFileName || appConfig.index),
                chunksSortMode: packageChunkSort(['inline', 'styles', 'scripts', appConfig.dllOutChunkName, 'main']),
                excludeChunks: excludeChunks,
                title: '',
                isDevServer: isWebpackDevServer(),
                metadata: metadata,
                customAttributes: customTagAttributes,
                id: defaultHtmlWebpackPluginId
                //hot:
                //hash: false,
                //favicon: false,
                //minify: false,
                //cache: true,
                //compile: true,
                //chunks: "all",
                //inject: 'body' //'head' || 'body' || true || false
            }));
        } else {
            plugins.push(new HtmlWebpackPlugin({
                templateContent: ' ',
                filename: path.resolve(projectRoot, appConfig.outDir, appConfig.indexOutFileName || appConfig.index),
                chunksSortMode: packageChunkSort(['inline', 'styles', 'scripts', appConfig.dllOutChunkName, 'main']),
                excludeChunks: excludeChunks,
                title: '',
                customAttributes: customTagAttributes,
                id: defaultHtmlWebpackPluginId,
                inject: true
            }));

            // move head assets to body
            if (customTagAttributes) {
                plugins.push(new CustomizeAssetsHtmlWebpackPlugin({
                    targetHtmlWebpackPluginId: defaultHtmlWebpackPluginId,
                    moveHeadAssetsToBody: true
                }));
            }
        }

        // add dll entry - vendor.js
        if ((debug && appConfig.referenceDllsOnDevelopment) ||
            (!debug && appConfig.referenceDllsOnProduction)) {
            const dllRefScript = `${appConfig.dllOutChunkName}.js`;
            plugins.push(new CustomizeAssetsHtmlWebpackPlugin({
                targetHtmlWebpackPluginId: defaultHtmlWebpackPluginId,
                scriptSrcToBodyAssets: [dllRefScript],
                customScriptAttributes: customTagAttributes ? customTagAttributes.scriptAttributes : [],
                addPublicPath: true
            }));
        }

        // ** Order is import
        // custom script/link attributes
        if (customTagAttributes) {
            plugins.push(new CustomizeAssetsHtmlWebpackPlugin({
                targetHtmlWebpackPluginId: defaultHtmlWebpackPluginId,
                customScriptAttributes: customTagAttributes.scriptAttributes,
                customLinkAttributes: customTagAttributes.linkAttributes
            }));
        }
    }

    // remove starting slash
    plugins.push(new CustomizeAssetsHtmlWebpackPlugin({
        removeStartingSlash: true
    }));

    // DllReferencePlugin, CommonsChunkPlugin
    //
    if ((debug && appConfig.referenceDllsOnDevelopment) || (!debug && appConfig.referenceDllsOnProduction)) {
        if (appConfig.target === 'node') {
            plugins.push(
                new DllReferencePlugin({
                    context: projectRoot, // or '.'
                    sourceType: 'commonjs2',
                    manifest: require(path.resolve(projectRoot, appConfig.outDir, `${appConfig.dllOutChunkName}-manifest.json`)),
                    name: `./${appConfig.dllOutChunkName}`
                })
            );
        } else {
            plugins.push(
                new DllReferencePlugin({
                    context: projectRoot, //'.',
                    manifest: require(path.resolve(projectRoot, appConfig.outDir, `${appConfig.dllOutChunkName}-manifest.json`))
                })
            );
        }

        plugins.push(new CommonsChunkPlugin({
            minChunks: Infinity,
            name: 'inline'
        }));

    } else {
        plugins.push(new CommonsChunkPlugin({
            minChunks: Infinity,
            name: 'inline'
        }));

        // This enables tree shaking of the vendor modules
        plugins.push(new CommonsChunkPlugin({
            name: appConfig.dllOutChunkName,
            chunks: ['main'],
            minChunks: (module: any) => module.userRequest && module.userRequest.startsWith(nodeModulesPath)
        }));
    }

    const webpackNonDllConfig = {
        resolve: {
            extensions: ['.js', '.json'],
            modules: [appRoot, nodeModulesPath]
        },
        entry: entryPoints,
        module: {
            rules: rules
        },
        plugins: plugins
    };

    return webpackNonDllConfig;
}


// Private methods
function getFaviconPlugins(projectRoot: string, appConfig: AppConfig, debug: boolean, emitStats: boolean, targetHtmlWebpackPluginId?: string) {
    const appRoot = path.resolve(projectRoot, appConfig.root);

    const plugins: any[] = [];
    let iconConfig: IconPluginOptions = null;
    let customTagAttributes: any = null;
    if (appConfig.htmlInjectOptions && (appConfig.htmlInjectOptions.customScriptAttributes || appConfig.htmlInjectOptions.customLinkAttributes)) {
        customTagAttributes = {
            scriptAttributes: appConfig.htmlInjectOptions.customScriptAttributes,
            linkAttributes: appConfig.htmlInjectOptions.customLinkAttributes
        };
    }

    if (typeof appConfig.faviconConfig === 'string' && appConfig.faviconConfig.match(/\.json$/i)) {
        iconConfig = readJsonSync(path.resolve(appRoot, appConfig.faviconConfig));
    }

    if (!iconConfig || !iconConfig.masterPicture) {
        return plugins;
    }

    iconConfig.masterPicture = path.resolve(appRoot, iconConfig.masterPicture);
    if (!iconConfig.iconsPath) {
        iconConfig.iconsPath = ((debug && appConfig.appendOutputHashOnDevelopment) ||
            (!debug && appConfig.appendOutputHashOnProduction))
            ? 'icons-[hash]/'
            : 'icons/';
    }
    if (!iconConfig.statsFilename) {
        iconConfig.statsFilename = ((debug && appConfig.appendOutputHashOnDevelopment) ||
            (!debug && appConfig.appendOutputHashOnProduction))
            ? 'iconstats-[hash].json'
            : 'iconstats.json';
    }
    if (typeof iconConfig.emitStats === 'undefined') {
        iconConfig.emitStats = emitStats;
    }

    let iconsInjectOutFileName: string = null;
    if (appConfig.htmlInjectOptions && appConfig.htmlInjectOptions.iconsInjectOutFileName) {
        iconsInjectOutFileName = appConfig.htmlInjectOptions.iconsInjectOutFileName;
    }

    let iconHtmlSeparateOut = iconsInjectOutFileName !== null &&
        ((iconsInjectOutFileName !== appConfig.indexOutFileName) ||
            (iconsInjectOutFileName !== appConfig.index));

    if (typeof iconConfig.inject === 'undefined') {
        if (appConfig.index || appConfig.indexOutFileName || iconHtmlSeparateOut) {
            iconConfig.inject = true;
        } else {
            iconConfig.inject = true;
        }
    }

    const iconsHtmlWebpackPluginId = (iconConfig.inject && iconHtmlSeparateOut)
        ? 'IconsHtmlWebpackPlugin'
        : targetHtmlWebpackPluginId;

    let seperateOutput = false;
    // Seperate inject output
    if (iconConfig.inject && iconHtmlSeparateOut) {
        seperateOutput = true;

        plugins.push(new HtmlWebpackPlugin({
            templateContent: ' ',
            filename: path.resolve(projectRoot, appConfig.outDir, iconsInjectOutFileName),
            chunks: [],
            title: '',
            customAttributes: customTagAttributes,
            inject: true,
            id: iconsHtmlWebpackPluginId
        }));
    }

    iconConfig.targetHtmlWebpackPluginId = iconsHtmlWebpackPluginId;
    iconConfig.seperateOutput = seperateOutput;

    plugins.push(
        new IconWebpackPlugin(iconConfig)
    );

    return plugins;
}

function getCopyAssetPlugin(baseDir: string, assetEntries: any[]) {
    const assets = assetEntries.map((asset: any) => {
        if (typeof asset === 'string') {
            // convert dir patterns to globs
            if (asset.lastIndexOf('*') === -1 && fs.existsSync(path.resolve(baseDir, asset)) && fs.statSync(path.resolve(baseDir, asset)).isDirectory()) {
                asset += '/**/*';
            }

            return {
                from: {
                    glob: asset,
                    dot: true
                },
                context: baseDir
            };
        } else if (typeof asset === 'object' && asset.from) {
            if (!asset.context) {
                asset.context = baseDir;
            }
            if (typeof asset.from === 'string') {
                let fromGlob = asset.from;
                if (asset.from.lastIndexOf('*') === -1 && fs.statSync(path.resolve(baseDir, asset.from)).isDirectory()) {
                    fromGlob += '/**/*';
                }

                asset.from = {
                    glob: fromGlob,
                    dot: true
                };
            }
            return asset;
        } else {
            throw new Error(`Invalid 'assets' value in appConfig.`);
        }
    });

    const plugin = new CopyWebpackPlugin(assets,
        {
            ignore: ['**/.gitkeep']
            //copyUnmodified: false
        });
    return plugin;
}
// create array of css loaders
// Ref: https://github.com/angular/angular-cli
function makeCssLoaders(stylePaths: string[] = []) {
    const baseRules = [
        { test: /\.css$/, loaders: <any[]>[] },
        { test: /\.scss$|\.sass$/, loaders: ['sass-loader'] },
        { test: /\.less$/, loaders: ['less-loader'] },
        { test: /\.styl$/, loaders: ['stylus-loader'] }
    ];

    const commonLoaders = ['postcss-loader'];

    // load component css as raw strings
    const cssLoaders: any = baseRules.map(({test, loaders}) => ({
        exclude: stylePaths, test, loaders: ['raw-loader'].concat(commonLoaders).concat(loaders)
    }));

    if (stylePaths && stylePaths.length > 0) {
        // load global css as css files
        cssLoaders.push(...baseRules.map(({test, loaders}) => ({
            include: stylePaths, test, loaders: ExtractTextPlugin.extract({
                remove: false,
                loader: ['css-loader'].concat(commonLoaders).concat(loaders),
                fallbackLoader: 'style-loader'
            })
        })));
    }

    return cssLoaders;
}

// convert all extra entries into the object representation, fill in defaults
// Ref: https://github.com/angular/angular-cli
function parseGlobalScopedEntry(
    extraEntries: (string | GlobalScopedEntry)[],
    appRoot: string,
    defaultEntry: string
): GlobalScopedEntry[] {
    if (!extraEntries || !extraEntries.length) {
        return [];
    }
    return extraEntries
        .map((extraEntry: string | GlobalScopedEntry) =>
            typeof extraEntry === 'string' ? { input: extraEntry } : extraEntry)
        .map((extraEntry: GlobalScopedEntry) => {
            extraEntry.path = path.resolve(appRoot, extraEntry.input);
            if (extraEntry.output) {
                extraEntry.entry = extraEntry.output.replace(/\.(js|css)$/i, '');
            } else if (extraEntry.lazy) {
                extraEntry.entry = extraEntry.input.replace(/\.(js|css|scss|sass|less|styl)$/i, '');
            } else {
                extraEntry.entry = defaultEntry;
            }
            return extraEntry;
        });
}

