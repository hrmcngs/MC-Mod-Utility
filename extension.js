const vscode = require('vscode');
const { handleNewProject } = require('./src/commands/newProject');
const { handleAddComponent } = require('./src/commands/addComponent');
const { handleRotationEditor } = require('./src/commands/rotationEditor');
const { handleAddRotationParams } = require('./src/commands/addRotationParams');
const { register: registerColorChips } = require('./src/commands/colorChips');
const { handleThemeColorEditor } = require('./src/commands/themeColorEditor');

/**
 * MODプロジェクトかどうかを判定してコンテキストを設定する
 * (MC Datapack Utility の showContextMenu パターンと同様)
 */
async function updateModProjectContext() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        await vscode.commands.executeCommand('setContext', 'mcModUtility.isModProject', false);
        return;
    }

    // mods.toml / fabric.mod.json / build.gradle のいずれかが存在するか
    const patterns = [
        '**/META-INF/mods.toml',
        '**/META-INF/neoforge.mods.toml',
        '**/fabric.mod.json',
        '**/build.gradle',
        '**/build.gradle.kts',
    ];

    for (const pat of patterns) {
        const files = await vscode.workspace.findFiles(pat, '**/build/**', 1);
        if (files.length > 0) {
            await vscode.commands.executeCommand('setContext', 'mcModUtility.isModProject', true);
            console.log('MC Mod Utility: mod project detected, context menu enabled');
            return;
        }
    }

    await vscode.commands.executeCommand('setContext', 'mcModUtility.isModProject', false);
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('MC Mod Utility is now active!');

    // コンテキスト設定 (右クリックメニューの表示制御)
    updateModProjectContext();

    // ワークスペースが変わったら再判定
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => updateModProjectContext())
    );

    // コマンド登録
    context.subscriptions.push(
        vscode.commands.registerCommand('mc-mod-utility.newProject', (uri) => handleNewProject(context, uri)),
        vscode.commands.registerCommand('mc-mod-utility.addComponent', (uri) => handleAddComponent(context, uri)),
        vscode.commands.registerCommand('mc-mod-utility.rotationEditor', () => handleRotationEditor(context)),
        vscode.commands.registerCommand('mc-mod-utility.addRotationParams', (uri) => handleAddRotationParams(uri)),
        vscode.commands.registerCommand('mc-mod-utility.themeColorEditor', () => handleThemeColorEditor(context))
    );

    // 16進カラーコード (#RGB / #RRGGBB / #AARRGGBB / 0xRRGGBB / 0xAARRGGBB) を
    // 全ファイルでカラーチップ表示し、クリックで標準カラーピッカーから編集可能にする。
    registerColorChips(context);
}

function deactivate() {}

module.exports = { activate, deactivate };
