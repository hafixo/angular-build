import * as path from 'path';

import { writeFile } from 'fs-extra';

import { AngularBuildContext } from '../../../build-context';
import { JsonObject } from '../../../models';
import { InvalidConfigError } from '../../../models/errors';
import { LibProjectConfigInternal } from '../../../models/internals';

const versionPlaceholderRegex = new RegExp('0.0.0-PLACEHOLDER', 'i');

export async function performPackageJsonCopy(angularBuildContext: AngularBuildContext<LibProjectConfigInternal>): Promise<void> {
    const libConfig = angularBuildContext.projectConfig;
    if (!libConfig.packageJsonCopy) {
        return;
    }

    // validation
    if (!libConfig._packageJsonOutDir || !libConfig.outputPath) {
        throw new InvalidConfigError(`The 'projects[${libConfig.name || libConfig._index
            }].outputPath' value is required.`);
    }

    if (!libConfig._packageJson) {
        throw new InvalidConfigError('Could not detect package.json file.');
    }

    const logger = AngularBuildContext.logger;

    logger.info('Copying and updating package.json');

    // merge config
    const rootPackageJson = libConfig._rootPackageJson || {};
    const packageJson: JsonObject = {
        ...JSON.parse(JSON.stringify(libConfig._packageJson)),
        ...(libConfig._packageEntryPoints || {})
    };

    if (packageJson.devDependencies) {
        delete packageJson.devDependencies;
    }

    if (rootPackageJson.description &&
        (packageJson.description === '' ||
            packageJson.description === '[PLACEHOLDER]')) {
        packageJson.description = rootPackageJson.description;
    }
    if (rootPackageJson.keywords &&
        (packageJson.keywords === '' ||
            packageJson.keywords === '[PLACEHOLDER]' ||
            (packageJson.keywords && !(packageJson.keywords as string[]).length))) {
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
    if (packageJson.sideEffects == null) {
        packageJson.sideEffects = false;
    }

    if (libConfig._projectVersion && packageJson.version == null) {
        packageJson.version = libConfig._projectVersion;
    }

    if (libConfig.replaceVersionPlaceholder !== false && libConfig._projectVersion) {
        if (versionPlaceholderRegex.test(packageJson.version as string)) {
            packageJson.version = libConfig._projectVersion;
        }
        if (packageJson.peerDependencies) {
            const peerDependencies = packageJson.peerDependencies as JsonObject;
            const peerKeys = Object.keys(peerDependencies);
            for (const key of peerKeys) {
                const peerPkgVer = peerDependencies[key] as string;
                if (versionPlaceholderRegex.test(peerPkgVer)) {
                    peerDependencies[key] = peerPkgVer.replace(versionPlaceholderRegex, libConfig._projectVersion);
                }
            }

            packageJson.peerDependencies = peerDependencies;

        }
    }

    // write package config
    await writeFile(path.resolve(libConfig._packageJsonOutDir, 'package.json'),
        JSON.stringify(packageJson, null, 2));
}
