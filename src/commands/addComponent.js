const { runComponentWizard } = require('../wizards/componentWizard');
const { generateComponent } = require('../generators/componentGenerator');

/**
 * "MC Mod Utility: Add Component" コマンドハンドラ
 * @param {import('vscode').ExtensionContext} context
 */
async function handleAddComponent(context) {
    const config = await runComponentWizard();
    if (!config) return; // ユーザーがキャンセル

    await generateComponent(context, config);
}

module.exports = { handleAddComponent };
