﻿//require('ts-node').register({
//  compilerOptions: {
//    target: "es6",
//    module: "commonjs",
//    moduleResolution: "node",
//    sourceMap: true,
//    skipDefaultLibCheck: true,
//    lib: ["es2015"]
//  }
//});
import { getWebpackConfigs } from '@bizappframework/angular-build';
const configs = getWebpackConfigs(__dirname);
if (!configs || !configs.length) {
    throw new Error('No webpack config available.');
}
module.exports = configs;