const vscode = require('vscode');
const { getSupportedVersions } = require('../versions/versionData');
const { validateModId, validateGroupId } = require('../util/validation');
const { toPackagePath, modIdToClassName } = require('../util/pathBuilder');

/**
 * プロジェクト作成ウィザードを実行し、設定オブジェクトを返す
 * ユーザーがキャンセルした場合は null を返す
 * @returns {Promise<object|null>}
 */
async function runProjectWizard() {
    // Step 1: Modローダー選択
    const loader = await vscode.window.showQuickPick(
        [
            { label: 'Forge', value: 'forge' },
            { label: 'Fabric', value: 'fabric' },
            { label: 'NeoForge', value: 'neoforge' },
        ],
        { placeHolder: 'Select mod loader', ignoreFocusOut: true }
    );
    if (!loader) return null;

    // Step 2: Minecraftバージョン選択
    const versions = getSupportedVersions(loader.value);
    const mcVersion = await vscode.window.showQuickPick(
        versions.map(v => ({ label: v, value: v })),
        { placeHolder: 'Select Minecraft version', ignoreFocusOut: true }
    );
    if (!mcVersion) return null;

    // Step 3: 言語選択
    const language = await vscode.window.showQuickPick(
        [
            { label: 'Java', value: 'java' },
            { label: 'Kotlin', value: 'kotlin' },
        ],
        { placeHolder: 'Select language', ignoreFocusOut: true }
    );
    if (!language) return null;

    // Step 4: Mod ID 入力
    const modId = await vscode.window.showInputBox({
        prompt: 'Enter your mod ID (lowercase, underscores only)',
        placeHolder: 'my_cool_mod',
        ignoreFocusOut: true,
        validateInput: validateModId,
    });
    if (!modId) return null;

    // Step 5: Mod名 入力
    const modName = await vscode.window.showInputBox({
        prompt: 'Enter your mod display name',
        placeHolder: 'My Cool Mod',
        ignoreFocusOut: true,
        validateInput: (v) => v ? null : 'Mod name is required',
    });
    if (!modName) return null;

    // Step 6: Group ID 入力
    const groupId = await vscode.window.showInputBox({
        prompt: 'Enter your group ID (Java package name)',
        placeHolder: 'com.example',
        value: 'com.example',
        ignoreFocusOut: true,
        validateInput: validateGroupId,
    });
    if (!groupId) return null;

    // Step 7: 出力フォルダ選択
    const folderUri = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: 'Select output folder',
    });
    if (!folderUri || folderUri.length === 0) return null;

    const packagePath = toPackagePath(groupId, modId);
    const mainClassName = modIdToClassName(modId);
    const packageName = `${groupId}.${modId}`;

    return {
        loader: loader.value,
        minecraftVersion: mcVersion.value,
        language: language.value,
        modId,
        modName,
        groupId,
        outputPath: folderUri[0].fsPath,
        packagePath,
        mainClassName,
        packageName,
    };
}

module.exports = { runProjectWizard };
