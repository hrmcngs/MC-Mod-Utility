const { runComponentWizard } = require('../wizards/componentWizard');
const { generateComponent } = require('../generators/componentGenerator');

/**
 * "MC Mod Utility: Add Component" コマンドハンドラ
 * @param {import('vscode').ExtensionContext} context
 * @param {import('vscode').Uri} [uri] エクスプローラーの右クリックから渡されるフォルダURI
 */
async function handleAddComponent(context, uri) {
    const config = await runComponentWizard(uri);
    if (!config) return; // ユーザーがキャンセル

    await generateComponent(context, config);
}

module.exports = { handleAddComponent };
