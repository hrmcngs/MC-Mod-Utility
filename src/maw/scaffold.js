const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { readMawProject, findProjectRoot, looksLikeMawAddon } = require('./mawProject');
const { rebrand, readOldValues, writeMarker } = require('./rebrand');
const { validateModId } = require('../util/validation');
const { modIdToClassName } = require('../util/pathBuilder');

const execFileAsync = promisify(execFile);

// =====================================================================
// MAW アドオンプロジェクトを新規作成する。
//
// 拡張機能の中にビルド設定を持たず、実績のあるテンプレート
// (The-four-primitives-and-Weapons-addons-Sample) をコピーしてリブランドする。
// gradlew / GitHub Actions / 本体MOD jar 取得スクリプトまで丸ごと揃うので、
// 生成直後に ./run_client.sh が通る。
//
// テンプレートの入手元:
//   1. 今開いている MAW アドオン (これ自体を雛形にできる)
//   2. 設定 mc-mod-utility.maw.templatePath のローカルパス
//   3. GitHub から clone
// =====================================================================

const TEMPLATE_REPO = 'https://github.com/hrmcngs/The-four-primitives-and-Weapons-addons-Sample.git';

/** コピーしないもの (生成物・ローカル状態) */
const EXCLUDE = new Set([
    '.git', '.gradle', 'build', 'run', 'bin', 'node_modules', '.maw-src',
    '.DS_Store', 'package-lock.json', '.maw-addon.json',
]);

/** libs/local (本体MOD jar) は取り込み直すべきなのでコピーしない */
const EXCLUDE_PATHS = new Set(['libs/local', 'libs/local-disabled']);

/**
 * @param {vscode.ExtensionContext} context
 * @param {vscode.Uri} [uri]
 * @param {() => void} [onDone]
 */
async function handleNewMawAddon(context, uri, onDone) {
    // --- 1. 雛形の入手元を決める ---
    const source = await pickTemplateSource(uri);
    if (!source) return;

    // --- 2. 新しいアドオンの情報 ---
    const modId = await vscode.window.showInputBox({
        title: 'MAW アドオンを新規作成 (1/4)',
        prompt: 'Mod ID（小文字・数字・アンダースコアのみ）',
        value: 'my_maw_addon',
        ignoreFocusOut: true,
        validateInput: validateModId,
    });
    if (!modId) return;

    const displayName = await vscode.window.showInputBox({
        title: 'MAW アドオンを新規作成 (2/4)',
        prompt: 'MOD の表示名',
        value: modIdToClassName(modId).replace(/([A-Z])/g, ' $1').trim(),
        ignoreFocusOut: true,
    });
    if (!displayName) return;

    const author = await vscode.window.showInputBox({
        title: 'MAW アドオンを新規作成 (3/4)',
        prompt: '作者名',
        value: 'your-name',
        ignoreFocusOut: true,
    });
    if (author === undefined) return;

    const javaPackage = await vscode.window.showInputBox({
        title: 'MAW アドオンを新規作成 (4/4)',
        prompt: 'Java パッケージ (例: com.example.myaddon)',
        value: `com.example.${modId.replace(/_/g, '')}`,
        ignoreFocusOut: true,
        validateInput: (v) => /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(v) ? null : 'Java のパッケージ名として不正です',
    });
    if (!javaPackage) return;

    // --- 3. 出力先 ---
    const parent = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: '作成先の親フォルダを選ぶ',
        defaultUri: uri,
    });
    if (!parent || parent.length === 0) return;

    const target = path.join(parent[0].fsPath, modId.replace(/_/g, '-'));
    if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
        vscode.window.showErrorMessage(`${target} は空ではありません。`);
        return;
    }

    const next = {
        modId,
        displayName,
        author,
        javaPackage,
        mainClass: modIdToClassName(modId),
        archives: modId.replace(/_/g, '-'),
    };

    // --- 4. 複製 → リブランド ---
    try {
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'MAW アドオンを作成中...' },
            async (progress) => {
                progress.report({ message: '雛形をコピー中' });
                if (source.kind === 'clone') {
                    await cloneTemplate(target);
                } else {
                    copyTree(source.path, target);
                }

                progress.report({ message: 'Mod ID を書き換え中' });
                const project = readMawProject(target);
                if (!project) throw new Error('コピーしたプロジェクトを MAW アドオンとして認識できませんでした');

                rebrand(project, readOldValues(project), next);
                writeMarker(target, next);
            }
        );
    } catch (e) {
        vscode.window.showErrorMessage(`作成に失敗しました: ${e.message}`);
        return;
    }

    if (onDone) onDone();

    const pick = await vscode.window.showInformationMessage(
        `⚔ ${displayName} を作成しました。武器スタジオですぐ武器を追加できます。`,
        '新しいウィンドウで開く',
        'このウィンドウで開く'
    );
    if (pick === '新しいウィンドウで開く') {
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(target), true);
    } else if (pick === 'このウィンドウで開く') {
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(target), false);
    }
}

/** 雛形の入手元を選ばせる */
async function pickTemplateSource(uri) {
    const items = [];

    const configured = vscode.workspace.getConfiguration('mc-mod-utility').get('maw.templatePath');
    if (configured && looksLikeMawAddon(configured)) {
        items.push({
            label: '$(folder) 設定したテンプレートを使う',
            detail: configured,
            source: { kind: 'local', path: configured },
        });
    }

    const current = findProjectRoot(uri);
    if (current && looksLikeMawAddon(current) && current !== configured) {
        items.push({
            label: '$(repo) 今開いているアドオンを雛形にする',
            detail: current,
            source: { kind: 'local', path: current },
        });
    }

    items.push({
        label: '$(cloud-download) GitHub からテンプレートを取得する',
        detail: TEMPLATE_REPO,
        source: { kind: 'clone' },
    });
    items.push({
        label: '$(folder-opened) ローカルのフォルダを選ぶ',
        detail: '手元にある MAW アドオンを雛形にする',
        source: { kind: 'browse' },
    });

    const pick = await vscode.window.showQuickPick(items, {
        title: 'MAW アドオン: 雛形の入手元',
        ignoreFocusOut: true,
    });
    if (!pick) return null;

    if (pick.source.kind === 'browse') {
        const chosen = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            openLabel: '雛形にする MAW アドオンを選ぶ',
        });
        if (!chosen || chosen.length === 0) return null;
        if (!looksLikeMawAddon(chosen[0].fsPath)) {
            vscode.window.showErrorMessage('選んだフォルダは MAW アドオンではないようです。');
            return null;
        }
        return { kind: 'local', path: chosen[0].fsPath };
    }

    return pick.source;
}

/** GitHub から浅く clone して .git を捨てる */
async function cloneTemplate(target) {
    await execFileAsync('git', ['clone', '--depth', '1', TEMPLATE_REPO, target]);
    fs.rmSync(path.join(target, '.git'), { recursive: true, force: true });
}

/** 生成物を除いてディレクトリをコピー */
function copyTree(from, to, rel = '') {
    fs.mkdirSync(to, { recursive: true });

    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        const childRel = rel ? `${rel}/${entry.name}` : entry.name;
        if (EXCLUDE.has(entry.name) || EXCLUDE_PATHS.has(childRel)) continue;

        const src = path.join(from, entry.name);
        const dst = path.join(to, entry.name);

        if (entry.isDirectory()) {
            copyTree(src, dst, childRel);
        } else if (entry.isFile()) {
            fs.copyFileSync(src, dst);
            // 実行ビットを保つ (gradlew / run_client.sh)
            const mode = fs.statSync(src).mode;
            fs.chmodSync(dst, mode);
        }
    }
}

module.exports = { handleNewMawAddon, TEMPLATE_REPO };
