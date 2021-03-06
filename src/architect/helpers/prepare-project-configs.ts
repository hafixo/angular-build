import * as path from 'path';

import { AppProjectConfigInternal, LibProjectConfigInternal } from '../../models/internals';

import { JsonObject } from '../../models';

import { AppBuilderOptions, AssetPatternObjectCompat, LibBuilderOptions } from '../models';

export function toAppConfigInternal(workspaceRoot: string, options: AppBuilderOptions): AppProjectConfigInternal {
    applyAppBuilderOptionsCompat(options);

    const appConfig: AppProjectConfigInternal = {
        _index: 0,
        _projectType: 'app',
        _configPath: path.resolve(workspaceRoot, 'angular.json'),
        ...options
    };

    // Delete empty
    deleteEmpty(appConfig);

    return appConfig;
}

export function toLibConfigInternal(workspaceRoot: string, options: LibBuilderOptions): LibProjectConfigInternal {
    const libConfig: LibProjectConfigInternal = {
        _index: 0,
        _projectType: 'lib',
        _configPath: path.resolve(workspaceRoot, 'angular.json'),
        ...options
    };

    // Delete empty
    deleteEmpty(libConfig);

    return libConfig;
}

// tslint:disable-next-line: max-func-body-length
export function applyAppBuilderOptionsCompat(appConfig: AppBuilderOptions): void {
    if (appConfig.platform && !appConfig.platformTarget) {
        appConfig.platformTarget = appConfig.platform === 'server' ? 'node' : 'web';
        delete appConfig.platform;
    }
    if (appConfig.main && !appConfig.entry) {
        appConfig.entry = appConfig.main;
        delete appConfig.main;
    }
    if (appConfig.index && !appConfig.htmlInject) {
        appConfig.htmlInject = {
            index: appConfig.index
        };
        delete appConfig.index;
    }
    if (appConfig.evalSourceMap && !appConfig.sourceMapDevTool) {
        appConfig.sourceMapDevTool = 'eval';
        delete appConfig.evalSourceMap;
    }
    if (appConfig.deployUrl && !appConfig.publicPath) {
        appConfig.publicPath = appConfig.deployUrl;
        delete appConfig.deployUrl;
    }
    if (appConfig.assets &&
        Array.isArray(appConfig.assets) &&
        (!appConfig.copy || (Array.isArray(appConfig.copy) && !appConfig.copy.length))) {
        appConfig.copy = appConfig.assets.map((assetEntry: string | AssetPatternObjectCompat) => {
            if (typeof assetEntry === 'string') {
                return assetEntry;
            }

            return {
                from: path.join(assetEntry.input, assetEntry.glob || ''),
                to: assetEntry.output,
                exclude: assetEntry.ignore
            };
        });
        delete appConfig.assets;
    }
    if (appConfig.deleteOutputPath && !appConfig.clean) {
        appConfig.clean = {
            beforeBuild: {
                cleanOutDir: true
            }
        };
        delete appConfig.deleteOutputPath;
    }
    if (appConfig.statsJson && !appConfig.bundleAnalyzer) {
        appConfig.bundleAnalyzer = {
            generateStatsFile: true
        };
        delete appConfig.statsJson;
    }
}

// tslint:disable-next-line: no-any
function isDefaultObject(obj: { [key: string]: any }): boolean {
    let hasData = false;
    /* tslint:disable:no-unsafe-any */
    Object.keys(obj)
        .forEach(key => {
            if (obj[key] && Array.isArray(obj[key]) && obj[key].length === 0) {
                // do nothing
            } else if (obj[key] && typeof obj[key] === 'object' && Object.keys(obj[key]).length === 0) {
                // do nothing
            } else {
                hasData = true;
            }
        });
    /* tslint:enable:no-unsafe-any */

    return !hasData;
}

function deleteEmpty(projectConfig: AppProjectConfigInternal | LibProjectConfigInternal): void {
    Object.keys(projectConfig)
        .forEach(key => {
            const configAny = projectConfig as unknown as JsonObject;
            const configValue = configAny[key];
            if (configValue && Array.isArray(configValue) && configValue.length === 0) {
                // tslint:disable-next-line: no-dynamic-delete
                delete configAny[key];
            } else if (configValue && typeof configValue === 'object' &&
                (Object.keys(configValue).length === 0 || isDefaultObject(configValue))) {
                // tslint:disable-next-line: no-dynamic-delete
                delete configAny[key];
            }
        });
}
