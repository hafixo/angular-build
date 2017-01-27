"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
const path = require("path");
const fs = require("fs");
const utils_1 = require("../utils");
__export(require("../utils"));
function parseDllEntries(baseDir, dlls, target, env) {
    if (!dlls || !dlls.length) {
        return [];
    }
    const envShort = env;
    const envLong = env === 'prod' ? 'production' : 'development';
    const parsedDllEntries = [];
    dlls.map((e) => {
        if (typeof e === 'string') {
            return {
                entry: e
            };
        }
        return e;
    }).filter((e) => e &&
        e.entry &&
        e.entry.length &&
        // targets
        (!e.targets || e.targets.length === 0 || e.targets.indexOf(target) > -1) &&
        // env
        (!e.env || e.env === envShort || e.env === envLong))
        .forEach((e) => {
        const entry = parseDllEntryValues(baseDir, e.entry, envLong);
        parsedDllEntries.push({
            entry: entry,
            targets: e.targets,
            env: e.env,
            importToMain: e.importToMain
        });
    });
    return parsedDllEntries;
}
exports.parseDllEntries = parseDllEntries;
function parseDllEntryValues(baseDir, entryValue, env) {
    const dllList = [];
    if (Array.isArray(entryValue)) {
        entryValue.forEach((value) => {
            const list = parseDllEntryValue(baseDir, value, env);
            dllList.push(...list);
        });
    }
    else if (typeof entryValue === 'string' && entryValue.length) {
        let list = parseDllEntryValue(baseDir, entryValue, env);
        dllList.push(...list);
    }
    return dllList;
}
exports.parseDllEntryValues = parseDllEntryValues;
function parseDllEntryValue(baseDir, entryValue, env) {
    const dllPath = path.resolve(baseDir, entryValue);
    if (fs.existsSync(dllPath)) {
        if (dllPath.match(/\.json$/)) {
            const dataArray = utils_1.readJsonSync(dllPath);
            if (Array.isArray(dataArray)) {
                return dataArray;
            }
            else {
                throw new Error(`Invalid 'entry' value in dllEntry, file: ${dllPath}.`);
            }
        }
        if (dllPath.match(/\.(js|ts)$/)) {
            try {
                const data = require(dllPath);
                if (data && data.default && typeof data.default === 'function') {
                    //return data.default(env);
                    const dataArray = data.default(env);
                    if (Array.isArray(dataArray)) {
                        return dataArray;
                    }
                    else {
                        throw new Error(`Invalid 'entry' value in dllEntry, file: ${dllPath}.`);
                    }
                }
                if (data && typeof data === 'function') {
                    const dataArray = data(env);
                    if (Array.isArray(dataArray)) {
                        return dataArray;
                    }
                    else {
                        throw new Error(`Invalid 'entry' value in dllEntry, file: ${dllPath}.`);
                    }
                }
                if (Array.isArray(data)) {
                    return data;
                }
                else {
                    return [entryValue];
                }
            }
            catch (ex) {
                return [entryValue];
            }
        }
    }
    else {
        return [entryValue];
    }
    throw new Error(`Invalid 'entry' value in dllEntry.`);
}
// Ref: https://github.com/angular/angular-cli
function packageChunkSort(packages) {
    return (left, right) => {
        const leftIndex = packages.indexOf(left.names[0]);
        const rightindex = packages.indexOf(right.names[0]);
        if (leftIndex < 0 || rightindex < 0) {
            // Unknown packages are loaded last
            return 1;
        }
        if (leftIndex > rightindex) {
            return 1;
        }
        return -1;
    };
}
exports.packageChunkSort = packageChunkSort;
function isWebpackDevServer() {
    return process.argv[1] && !!(/webpack-dev-server/.exec(process.argv[1]));
}
exports.isWebpackDevServer = isWebpackDevServer;
function hasProdArg() {
    return (process.env.ASPNETCORE_ENVIRONMENT && process.env.ASPNETCORE_ENVIRONMENT.toLowerCase() === 'production') ||
        process.argv.indexOf('--env.prod') > -1 ||
        process.argv.indexOf('--env.production') > -1 ||
        process.argv.indexOf('--env.Production') > -1 ||
        (process.env.NODE_ENV &&
            (process.env.NODE_ENV.toLowerCase() === 'prod' ||
                process.env.NODE_ENV.toLowerCase() === 'production'));
}
exports.hasProdArg = hasProdArg;
function getEnv(debug, longName) {
    return longName ? debug ? 'development' : 'production' : debug ? 'dev' : 'prod';
}
exports.getEnv = getEnv;
function isDllBuildFromNpmEvent(eventName) {
    const lcEvent = process.env.npm_lifecycle_event;
    if (!lcEvent) {
        return false;
    }
    if (eventName) {
        return lcEvent.includes(eventName);
    }
    else {
        return lcEvent.includes('build:dll') ||
            lcEvent.includes('dll:build') ||
            lcEvent.includes(':dll') ||
            lcEvent === 'dll';
    }
}
exports.isDllBuildFromNpmEvent = isDllBuildFromNpmEvent;
function isAoTBuildFromNpmEvent(eventName) {
    const lcEvent = process.env.npm_lifecycle_event;
    if (!lcEvent) {
        return false;
    }
    if (eventName) {
        return lcEvent.includes(eventName);
    }
    else {
        return lcEvent.includes('build:aot') ||
            lcEvent.includes('aot:build') ||
            lcEvent.includes(':aot') ||
            lcEvent === 'aot';
    }
}
exports.isAoTBuildFromNpmEvent = isAoTBuildFromNpmEvent;
//export function findNpmScriptCommandName(baseDir: string, keyFilter: RegExp, valueFilter?: RegExp): string {
//  let pkgConfigPath = path.resolve(baseDir, 'package.json');
//  if (!fs.existsSync(pkgConfigPath)) {
//    pkgConfigPath = path.resolve(baseDir, '../package.json');
//  }
//  if (!fs.existsSync(pkgConfigPath)) {
//    return null;
//  }
//  const pkgConfig = readJsonSync(pkgConfigPath);
//  if (!pkgConfig.scripts) {
//    return null;
//  }
//  const foundKey = Object.keys(pkgConfig.scripts).find((key: string) => {
//    return keyFilter.test(key) && (!valueFilter || (valueFilter && valueFilter.test(pkgConfig.scripts[key])));
//  });
//  return foundKey;
//}
//export function tryBuildDll(manifestFiles: string[], debug: boolean, baseDir: string, command?: string, commandArgs?: string[]): void {
//  try {
//    manifestFiles
//      .forEach((manifestFile: string) => {
//        fs.accessSync(manifestFile);
//      });
//  } catch (err) {
//    if (!command) {
//      const npmScriptName = findNpmScriptCommandName(baseDir, /(dll([:\-]build)?)|((build[:\-])?dll)/i, /\s*webpack\s*/i);
//      if (npmScriptName) {
//        // 'npm', ['run', 'build:dll']
//        command = 'npm';
//        commandArgs = ['run', npmScriptName];
//      } else {
//        let webpackConfigFile = null;
//        if (fs.existsSync(path.resolve(baseDir, 'webpack.config.dll.js'))) {
//          webpackConfigFile = 'webpack.config.dll.js';
//        } else if (fs.existsSync(path.resolve(baseDir, 'webpack.dll.js'))) {
//          webpackConfigFile = 'webpack.dll.js';
//        } else if (fs.existsSync(path.resolve(baseDir, 'webpackfile.dll.js'))) {
//          webpackConfigFile = 'webpackfile.dll.js';
//        } else if (fs.existsSync(path.resolve(baseDir, 'webpack.config.vendor.js'))) {
//          webpackConfigFile = 'webpack.config.vendor.js';
//        } else if (fs.existsSync(path.resolve(baseDir, 'webpack.vendor.js'))) {
//          webpackConfigFile = 'webpack.vendor.js';
//        } else if (fs.existsSync(path.resolve(baseDir, 'webpackfile.vendor.js'))) {
//          webpackConfigFile = 'webpackfile.vendor.js';
//        } else if (fs.existsSync(path.resolve(baseDir, 'webpack.config.dll.ts'))) {
//          webpackConfigFile = 'webpack.config.dll.ts';
//        } else if (fs.existsSync(path.resolve(baseDir, 'webpack.dll.ts'))) {
//          webpackConfigFile = 'webpack.dll.ts';
//        } else if (fs.existsSync(path.resolve(baseDir, 'webpackfile.dll.ts'))) {
//          webpackConfigFile = 'webpackfile.dll.ts';
//        } else if (fs.existsSync(path.resolve(baseDir, 'webpack.config.vendor.ts'))) {
//          webpackConfigFile = 'webpack.config.vendor.ts';
//        } else if (fs.existsSync(path.resolve(baseDir, 'webpack.vendor.ts'))) {
//          webpackConfigFile = 'webpack.vendor.ts';
//        } else if (fs.existsSync(path.resolve(baseDir, 'webpackfile.vendor.ts'))) {
//          webpackConfigFile = 'webpackfile.vendor.ts';
//        }
//        if (webpackConfigFile) {
//          command = 'node';
//          const env = debug ? '--env.dev' : '--env.prod';
//          commandArgs = ['node_modules/webpack/bin/webpack.js', '--config', webpackConfigFile, env];
//        }
//      }
//    }
//    tryToSpawn(command, commandArgs);
//  }
//}
//export function tryToSpawn(command: string, commandArgs: string[]) {
//  const spawn: any = require('cross-spawn');
//  spawn.sync(command, commandArgs, { stdio: 'inherit' });
//  return;
//}
// Ref: https://github.com/AngularClass/angular2-webpack-starter 
//# sourceMappingURL=helpers.js.map