const { runProjectWizard } = require('../wizards/projectWizard');
const { generateProject } = require('../generators/projectGenerator');

/**
 * "MC Mod Utility: New Mod Project" コマンドハンドラ
 * @param {import('vscode').ExtensionContext} context
 */
async function handleNewProject(context) {
    const config = await runProjectWizard();
    if (!config) return; // ユーザーがキャンセル

    await generateProject(context, config);
}

module.exports = { handleNewProject };
