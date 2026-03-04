const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { renderTemplate, getTemplatePath } = require('../templates/templateEngine');
const { getComponentFileManifest } = require('../templates/templateRegistry');

/**
 * コンポーネントファイルを生成する
 * @param {vscode.ExtensionContext} context
 * @param {object} config - componentWizard が返す設定オブジェクト
 */
async function generateComponent(context, config) {
    const variables = {
        modId: config.modId,
        groupId: config.groupId,
        packageName: config.packageName,
        packagePath: config.packagePath,
        componentName: config.componentName,
        componentNameLower: config.componentNameLower,
        componentNameUpper: config.componentNameUpper,
    };

    const manifest = getComponentFileManifest(config);

    for (const entry of manifest) {
        const templatePath = getTemplatePath(context.extensionPath, entry.templateFile);

        if (!fs.existsSync(templatePath)) {
            vscode.window.showErrorMessage(`Template not found: ${entry.templateFile}`);
            return;
        }

        const content = renderTemplate(templatePath, variables);
        const outputFile = path.join(config.workspacePath, entry.outputPath);
        const outputDir = path.dirname(outputFile);

        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(outputFile, content, 'utf8');
    }

    // 最初に生成したファイルをエディタで開く
    const firstFile = path.join(config.workspacePath, manifest[0].outputPath);
    const doc = await vscode.workspace.openTextDocument(firstFile);
    await vscode.window.showTextDocument(doc);

    vscode.window.showInformationMessage(
        `${config.componentName} ${config.componentType} created! Don't forget to register it in your mod class.`
    );
}

module.exports = { generateComponent };
