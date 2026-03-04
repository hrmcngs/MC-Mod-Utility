/**
 * プロジェクト生成時のファイルマニフェストを返す
 * @param {object} config - ProjectConfig
 * @returns {Array<{templateFile: string, outputPath: string}>}
 */
function getProjectFileManifest(config) {
    const { loader, language, packagePath } = config;
    const ext = language === 'kotlin' ? 'kt' : 'java';
    const srcDir = language === 'kotlin' ? 'kotlin' : 'java';

    const common = [
        { templateFile: `${loader}/project/${language}/build.gradle.template`, outputPath: 'build.gradle' },
        { templateFile: `${loader}/project/${language}/settings.gradle.template`, outputPath: 'settings.gradle' },
        { templateFile: `${loader}/project/${language}/gradle.properties.template`, outputPath: 'gradle.properties' },
        { templateFile: `${loader}/project/${language}/MainClass.${ext}.template`, outputPath: `src/main/${srcDir}/${packagePath}/${config.mainClassName}.${ext}` },
        { templateFile: 'shared/gitignore.template', outputPath: '.gitignore' },
        { templateFile: 'shared/gradle-wrapper.properties.template', outputPath: 'gradle/wrapper/gradle-wrapper.properties' },
        { templateFile: 'shared/pack.mcmeta.template', outputPath: 'src/main/resources/pack.mcmeta' },
    ];

    const metadataMap = {
        forge: { templateFile: `forge/project/${language}/mods.toml.template`, outputPath: 'src/main/resources/META-INF/mods.toml' },
        fabric: { templateFile: `fabric/project/${language}/fabric.mod.json.template`, outputPath: 'src/main/resources/fabric.mod.json' },
        neoforge: { templateFile: `neoforge/project/${language}/neoforge.mods.toml.template`, outputPath: 'src/main/resources/META-INF/neoforge.mods.toml' },
    };

    return [...common, metadataMap[loader]];
}

/**
 * コンポーネント生成時のファイルマニフェストを返す
 * @param {object} config - ComponentConfig
 * @returns {Array<{templateFile: string, outputPath: string}>}
 */
function getComponentFileManifest(config) {
    const { loader, language, packagePath, componentType, componentName } = config;
    const ext = language === 'kotlin' ? 'kt' : 'java';
    const srcDir = language === 'kotlin' ? 'kotlin' : 'java';

    const subDirMap = {
        block: 'block',
        item: 'item',
        entity: 'entity',
        blockentity: 'block/entity',
        creativetab: 'init',
    };

    const templateNameMap = {
        block: 'Block',
        item: 'Item',
        entity: 'Entity',
        blockentity: 'BlockEntity',
        creativetab: 'CreativeTab',
    };

    const suffixMap = {
        block: 'Block',
        item: 'Item',
        entity: 'Entity',
        blockentity: 'BlockEntity',
        creativetab: 'CreativeTab',
    };

    const subDir = subDirMap[componentType];
    const templateName = templateNameMap[componentType];
    const suffix = suffixMap[componentType];

    return [
        {
            templateFile: `${loader}/components/${language}/${templateName}.${ext}.template`,
            outputPath: `src/main/${srcDir}/${packagePath}/${subDir}/${componentName}${suffix}.${ext}`,
        },
    ];
}

module.exports = { getProjectFileManifest, getComponentFileManifest };
