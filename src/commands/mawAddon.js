const vscode = require('vscode');
const { looksLikeMawAddon, readMawProject, findProjectRoot } = require('../maw/mawProject');
const { MawTreeProvider } = require('../maw/mawTreeView');
const { handleWeaponStudio } = require('../maw/weaponStudio');
const { handleRebrand } = require('../maw/rebrand');
const { handleNewMawAddon } = require('../maw/scaffold');
const { handleInsertModel } = require('../maw/insertModel');
const { loadCatalog, clearCache, resolveMawSource } = require('../maw/mawCatalog');

// =====================================================================
// MAW アドオン機能の登録口。
//
// ・ワークスペースが MAW アドオンかを判定してコンテキストキーを立てる
//   → 右クリックメニューやサイドバーのビューがそこでだけ出るようになる
// ・ステータスバーに「⚔ <modId>」を出して、認識できていることを可視化する
// ・武器スタジオ / リブランド / 新規作成 のコマンドを登録する
// =====================================================================

let treeProvider = null;
let statusBar = null;

function registerMawAddon(context) {
    treeProvider = new MawTreeProvider();
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
    statusBar.command = 'mc-mod-utility.mawWeaponStudio';

    context.subscriptions.push(
        statusBar,
        vscode.window.registerTreeDataProvider('mcModUtility.mawAddon', treeProvider),

        vscode.commands.registerCommand('mc-mod-utility.newMawAddon', (uri) =>
            handleNewMawAddon(context, uri, () => refresh())),

        vscode.commands.registerCommand('mc-mod-utility.mawWeaponStudio', (uri) =>
            handleWeaponStudio(context, uri, () => refresh())),

        vscode.commands.registerCommand('mc-mod-utility.mawInsertModel', (uri) =>
            handleInsertModel(context, uri, () => refresh())),

        vscode.commands.registerCommand('mc-mod-utility.mawRebrand', (uri) =>
            handleRebrand(context, uri, () => refresh())),

        vscode.commands.registerCommand('mc-mod-utility.mawRefresh', () => {
            clearCache();
            refresh();
            vscode.window.showInformationMessage('MAW アドオンの情報を読み直しました。');
        }),

        vscode.commands.registerCommand('mc-mod-utility.mawShowSource', () => showSource()),
    );

    // ワークスペースやファイルの変化に追従する
    const watcher = vscode.workspace.createFileSystemWatcher(
        '**/{weapon_types,weapon_stats,maw_saya}/*.{json,jsonc}'
    );
    context.subscriptions.push(
        watcher,
        watcher.onDidChange(() => refresh()),
        watcher.onDidCreate(() => refresh()),
        watcher.onDidDelete(() => refresh()),
        vscode.workspace.onDidChangeWorkspaceFolders(() => refresh()),
        vscode.workspace.onDidSaveTextDocument((doc) => {
            if (doc.fileName.endsWith('.java') || doc.fileName.endsWith('mods.toml')) refresh();
        }),
    );

    refresh();
}

/** MAW アドオンかどうかを判定し直し、UI に反映する */
function refresh() {
    const root = findProjectRoot();
    const isMaw = root ? looksLikeMawAddon(root) : false;

    vscode.commands.executeCommand('setContext', 'mcModUtility.isMawAddon', isMaw);

    if (treeProvider) treeProvider.setRoot(isMaw ? root : null);

    if (!statusBar) return;
    if (!isMaw) {
        statusBar.hide();
        return;
    }

    const project = readMawProject(root);
    if (!project) {
        statusBar.hide();
        return;
    }

    statusBar.text = `$(tools) MAW: ${project.modId}`;
    statusBar.tooltip = new vscode.MarkdownString(
        `**MAW アドオンとして認識中**\n\n` +
        `武器 ${project.weapons.length} / タイプ ${project.weaponTypes.length} / 納刀 ${project.sayaEntries.length}\n\n` +
        `クリックで武器スタジオを開く`
    );
    if (project.isSampleTemplate) {
        statusBar.text = `$(warning) MAW: ${project.modId}`;
        statusBar.tooltip = new vscode.MarkdownString(
            '**Mod ID がサンプルのままです**\n\n' +
            'コマンドパレットの「MAW: Mod ID を変更 (リブランド)」で自分の MOD にできます。'
        );
    }
    statusBar.show();
}

/** 本体MOD をどこから読んでいるかを表示する */
async function showSource() {
    const root = findProjectRoot();
    if (!root) return;

    const source = resolveMawSource(root);
    const catalog = loadCatalog(root);
    const types = catalog.types.map(t => `${t.displayName} (${t.id})`).join(', ');

    const detail = source
        ? `${source.label}\n\n武器タイプ ${catalog.types.length} 種を読み込み済み:\n${types}`
        : '本体MOD が見つからないため、内蔵スナップショットを使っています。\n' +
          '本体MODのソースを ~/The-four-primitives-and-Weapons に置くか、' +
          'scripts/fetch-maw-jar.sh で jar を取り込むと最新の情報を読みます。';

    const pick = await vscode.window.showInformationMessage(detail, { modal: true }, '読み直す');
    if (pick) {
        clearCache();
        refresh();
    }
}

module.exports = { registerMawAddon, refreshMawContext: refresh };
