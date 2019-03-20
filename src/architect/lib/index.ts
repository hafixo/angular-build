import { BuilderContext, BuilderOutput, createBuilder } from '@angular-devkit/architect/src/index2';
import { runWebpack } from '@angular-devkit/build-webpack/src/webpack/index2';
import { json } from '@angular-devkit/core';
import { NodeJsSyncHost } from '@angular-devkit/core/node';

import { from, Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { createWebpackLoggingCallback, getWebpackConfigFromContext } from '../helpers';

import { LibBuilderOptions } from '../models';
export type LibBuilderSchema = json.JsonObject & LibBuilderOptions;

export function buildApp(options: LibBuilderSchema, context: BuilderContext): Observable<BuilderOutput> {
    const startTime = Date.now();
    const host = new NodeJsSyncHost();

    return of(null).pipe(
        // tslint:disable-next-line: no-unsafe-any
        switchMap(() => from(getWebpackConfigFromContext('lib', options, context, host, startTime))),
        switchMap(webpackConfigFromContext => {
            if (webpackConfigFromContext.webpackConfig == null) {
                return of({ success: true });
            }

            const verbose = webpackConfigFromContext.buildOptions.logLevel === 'debug';

            const webpackConfig = webpackConfigFromContext.webpackConfig;
            const loggingFn = createWebpackLoggingCallback(verbose, context.logger);

            return runWebpack(webpackConfig, context, { logging: loggingFn });
        })
    );
}

// tslint:disable-next-line: no-default-export
export default createBuilder<json.JsonObject & LibBuilderSchema>(buildApp);
