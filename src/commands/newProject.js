const { runProjectWizard } = require('../wizards/projectWizard');
const { generateProject } = require('../generators/projectGenerator');

/**
 * "MC Mod Utility: New Mod Project" コマンドハンドラ
 * @param {import('vscode').ExtensionContext} context
 * @param {import('vscode').Uri} [uri] エクスプローラーの右クリックから渡されるフォルダURI
 */
async function handleNewProject(context, uri) {
    const config = await runProjectWizard(uri);
    if (!config) return; // ユーザーがキャンセル

    await generateProject(context, config);
}

module.exports = { handleNewProject };
