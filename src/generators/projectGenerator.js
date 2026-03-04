const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { renderTemplate, getTemplatePath } = require('../templates/templateEngine');
const { getProjectFileManifest } = require('../templates/templateRegistry');
const { getLoaderVersionData, getJavaVersion, getGradleVersion, getPackFormat } = require('../versions/versionData');

/**
 * テンプレート変数マップを構築する
 */
function buildVariableMap(config, loaderData, javaVersion, gradleVersion, packFormat) {
    return {
        modId: config.modId,
        modName: config.modName,
        groupId: config.groupId,
        mainClassName: config.mainClassName,
        packagePath: config.packagePath,
        packageName: config.packageName,
        minecraftVersion: config.minecraftVersion,
        javaVersion,
        gradleVersion,
        packFormat,
        // ローダー固有の値をすべてフラット展開
        ...loaderData,
    };
}

/**
 * プロジェクトをディスク上に生成する
 * @param {vscode.ExtensionContext} context
 * @param {object} config - projectWizard が返す設定オブジェクト
 */
async function generateProject(context, config) {
    const loaderData = getLoaderVersionData(config.minecraftVersion, config.loader);
    const javaVersion = getJavaVersion(config.minecraftVersion);
    const gradleVersion = getGradleVersion(config.minecraftVersion);
    const packFormat = getPackFormat(config.minecraftVersion);

    if (!loaderData) {
        vscode.window.showErrorMessage(
            `${config.loader} does not support Minecraft ${config.minecraftVersion}`
        );
        return;
    }

    const variables = buildVariableMap(config, loaderData, javaVersion, gradleVersion, packFormat);
    const manifest = getProjectFileManifest(config);

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Creating mod project...',
            cancellable: false,
        },
        async (progress) => {
            const total = manifest.length;
            for (let i = 0; i < manifest.length; i++) {
                const entry = manifest[i];
                progress.report({
                    message: entry.outputPath,
                    increment: (100 / total),
                });

                const templatePath = getTemplatePath(context.extensionPath, entry.templateFile);
                const content = renderTemplate(templatePath, variables);
                const outputFile = path.join(config.outputPath, entry.outputPath);
                const outputDir = path.dirname(outputFile);

                fs.mkdirSync(outputDir, { recursive: true });
                fs.writeFileSync(outputFile, content, 'utf8');
            }
        }
    );

    // 生成完了後、新しいフォルダでVSCodeを開く
    const openChoice = await vscode.window.showInformationMessage(
        `Mod project "${config.modName}" created successfully!`,
        'Open in New Window',
        'Open in Current Window'
    );

    if (openChoice === 'Open in New Window') {
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(config.outputPath), true);
    } else if (openChoice === 'Open in Current Window') {
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(config.outputPath), false);
    }
}

module.exports = { generateProject };
