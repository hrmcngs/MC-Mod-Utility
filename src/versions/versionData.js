const VERSION_DATA = {
    '1.20.1': {
        javaVersion: '17',
        gradleVersion: '8.1.1',
        packFormat: '15',
        forge: {
            forgeVersion: '47.2.0',
            loaderVersionRange: '[47,)',
            forgeGradleVersion: '6.0',
            mappingsChannel: 'official',
            mappingsVersion: '1.20.1',
        },
        fabric: {
            fabricLoaderVersion: '0.15.11',
            fabricApiVersion: '0.92.2+1.20.1',
            yarnMappings: '1.20.1+build.10',
            loomVersion: '1.6',
        },
        neoforge: null,
    },
    '1.20.4': {
        javaVersion: '17',
        gradleVersion: '8.1.1',
        packFormat: '26',
        forge: {
            forgeVersion: '49.0.30',
            loaderVersionRange: '[49,)',
            forgeGradleVersion: '6.0',
            mappingsChannel: 'official',
            mappingsVersion: '1.20.4',
        },
        fabric: {
            fabricLoaderVersion: '0.15.11',
            fabricApiVersion: '0.97.0+1.20.4',
            yarnMappings: '1.20.4+build.3',
            loomVersion: '1.6',
        },
        neoforge: {
            neoVersion: '20.4.237',
            loaderVersionRange: '[2,)',
            modDevGradleVersion: '1.0.11',
        },
    },
    '1.21.1': {
        javaVersion: '21',
        gradleVersion: '8.8',
        packFormat: '34',
        forge: {
            forgeVersion: '52.0.16',
            loaderVersionRange: '[52,)',
            forgeGradleVersion: '6.0',
            mappingsChannel: 'official',
            mappingsVersion: '1.21.1',
        },
        fabric: {
            fabricLoaderVersion: '0.16.0',
            fabricApiVersion: '0.102.0+1.21.1',
            yarnMappings: '1.21.1+build.3',
            loomVersion: '1.7',
        },
        neoforge: {
            neoVersion: '21.1.77',
            loaderVersionRange: '[4,)',
            modDevGradleVersion: '2.0.28',
        },
    },
};

/**
 * 指定ローダーがサポートするMCバージョン一覧を返す
 */
function getSupportedVersions(loader) {
    return Object.entries(VERSION_DATA)
        .filter(([, data]) => data[loader] != null)
        .map(([version]) => version);
}

/**
 * MC バージョン + ローダーのバージョン情報を返す
 */
function getLoaderVersionData(minecraftVersion, loader) {
    return VERSION_DATA[minecraftVersion]?.[loader] ?? null;
}

/**
 * MC バージョンに対応する Java バージョンを返す
 */
function getJavaVersion(minecraftVersion) {
    return VERSION_DATA[minecraftVersion]?.javaVersion ?? '17';
}

/**
 * MC バージョンに対応する Gradle バージョンを返す
 */
function getGradleVersion(minecraftVersion) {
    return VERSION_DATA[minecraftVersion]?.gradleVersion ?? '8.1.1';
}

/**
 * MC バージョンに対応する pack_format を返す
 */
function getPackFormat(minecraftVersion) {
    return VERSION_DATA[minecraftVersion]?.packFormat ?? '15';
}

module.exports = { VERSION_DATA, getSupportedVersions, getLoaderVersionData, getJavaVersion, getGradleVersion, getPackFormat };
