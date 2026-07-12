const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { readMawProject, findProjectRoot, walkFiles, MARKER_FILE } = require('./mawProject');
const { validateModId } = require('../util/validation');
const { modIdToClassName } = require('../util/pathBuilder');

// =====================================================================
// サンプルテンプレートを自分の MOD に作り替える (リブランド)。
//
// テンプレートを clone した直後は modId が
// the_four_primitives_and_weapons_addons_sample、パッケージが mawaddon のまま。
// README の手順どおり手で一括置換すると、フォルダ名の変更を忘れて
// テクスチャが出ない…といった事故が起きやすいので、まとめて面倒を見る。
//
// やること:
//   1. テキストファイル内の modId / パッケージ / クラス名 / 表示名 / 作者 を置換
//   2. Java のパッケージディレクトリを移動
//   3. assets/<old> と data/<old> を新しい名前空間にリネーム
//   4. メインクラスのファイル名を変更
//   5. .maw-addon.json (この拡張機能の目印) を書き出す
// =====================================================================

const SKIP_DIRS = new Set(['.git', '.gradle', 'build', 'run', 'bin', 'node_modules', '.maw-src', 'libs']);
const TEXT_EXTS = ['.java', '.kt', '.json', '.jsonc', '.toml', '.gradle', '.properties', '.md', '.mcmeta', '.txt', '.yml', '.yaml', '.sh', '.bat'];

/**
 * @param {vscode.ExtensionContext} context
 * @param {vscode.Uri} [uri]
 * @param {() => void} [onDone]
 */
async function handleRebrand(context, uri, onDone) {
    const root = findProjectRoot(uri);
    const project = root ? readMawProject(root) : null;

    if (!project) {
        vscode.window.showErrorMessage('MAW アドオンプロジェクトが見つかりません。');
        return;
    }
    if (!project.basePackage) {
        vscode.window.showErrorMessage('@Mod の付いたメインクラスが見つからないため、リブランドできません。');
        return;
    }

    const old = readOldValues(project);

    const modId = await vscode.window.showInputBox({
        title: 'MAW アドオン: Mod ID を変更 (1/4)',
        prompt: '新しい Mod ID（小文字・数字・アンダースコアのみ）',
        value: old.modId === project.modId && project.isSampleTemplate ? 'my_maw_addon' : project.modId,
        ignoreFocusOut: true,
        validateInput: validateModId,
    });
    if (!modId) return;

    const displayName = await vscode.window.showInputBox({
        title: 'MAW アドオン: 表示名 (2/4)',
        prompt: 'MOD の表示名 (mods.toml の displayName)',
        value: modIdToClassName(modId).replace(/([A-Z])/g, ' $1').trim(),
        ignoreFocusOut: true,
    });
    if (!displayName) return;

    const author = await vscode.window.showInputBox({
        title: 'MAW アドオン: 作者名 (3/4)',
        prompt: '作者名',
        value: old.author || 'your-name',
        ignoreFocusOut: true,
    });
    if (author === undefined) return;

    const javaPackage = await vscode.window.showInputBox({
        title: 'MAW アドオン: Java パッケージ (4/4)',
        prompt: 'Java パッケージ (例: com.example.myaddon)',
        value: `com.example.${modId.replace(/_/g, '')}`,
        ignoreFocusOut: true,
        validateInput: (v) => /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(v) ? null : 'Java のパッケージ名として不正です',
    });
    if (!javaPackage) return;

    const next = {
        modId,
        displayName,
        author,
        javaPackage,
        mainClass: modIdToClassName(modId),
        archives: modId.replace(/_/g, '-'),
    };

    const ok = await vscode.window.showWarningMessage(
        `このプロジェクトを次の内容で書き換えます。\n\n` +
        `${old.modId} → ${next.modId}\n` +
        `${old.javaPackage} → ${next.javaPackage}\n` +
        `${old.mainClass} → ${next.mainClass}`,
        { modal: true },
        '実行する'
    );
    if (ok !== '実行する') return;

    const changed = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'MAW アドオンをリブランド中...' },
        async () => rebrand(project, old, next)
    );

    writeMarker(project.root, next);
    if (onDone) onDone();

    vscode.window.showInformationMessage(
        `リブランド完了: ${changed} ファイルを更新しました。Java 拡張のキャッシュを更新するため、ウィンドウの再読み込みを推奨します。`,
        'ウィンドウを再読み込み'
    ).then(pick => {
        if (pick) vscode.commands.executeCommand('workbench.action.reloadWindow');
    });
}

/** 今の値を集める */
function readOldValues(project) {
    const buildGradle = path.join(project.root, 'build.gradle');
    let archives = null;
    let group = null;
    if (fs.existsSync(buildGradle)) {
        const text = fs.readFileSync(buildGradle, 'utf8');
        archives = (text.match(/archivesBaseName\s*=\s*['"]([^'"]+)['"]/) || [])[1] || null;
        group = (text.match(/^\s*group\s*=\s*['"]([^'"]+)['"]/m) || [])[1] || null;
    }

    let displayName = null;
    let author = null;
    if (fs.existsSync(project.paths.modsToml)) {
        const text = fs.readFileSync(project.paths.modsToml, 'utf8');
        displayName = (text.match(/^\s*displayName\s*=\s*"([^"]+)"/m) || [])[1] || null;
        author = (text.match(/^\s*authors\s*=\s*"([^"]+)"/m) || [])[1] || null;
    }

    return {
        modId: project.modId,
        namespace: project.namespace,
        javaPackage: project.basePackage,
        mainClass: project.mainClass,
        archives,
        group,
        displayName,
        author,
    };
}

/**
 * 実際の書き換え
 * @returns {number} 更新したファイル数
 */
function rebrand(project, old, next) {
    // 長い文字列から順に置換する (部分一致で壊さないため)
    const pairs = [
        [old.namespace, next.modId],
        [old.modId, next.modId],
        [old.javaPackage, next.javaPackage],
        [old.mainClass, next.mainClass],
    ];
    if (old.archives) pairs.push([old.archives, next.archives]);
    if (old.group && old.group !== old.javaPackage) pairs.push([old.group, next.javaPackage]);
    if (old.displayName) pairs.push([old.displayName, next.displayName]);
    if (old.author && next.author) pairs.push([old.author, next.author]);

    const replacements = pairs
        .filter(([from, to]) => from && to && from !== to)
        .sort((a, b) => b[0].length - a[0].length);

    // --- 1. テキストの置換 ---
    let changed = 0;
    for (const file of walkFiles(project.root, TEXT_EXTS)) {
        if (isSkipped(project.root, file)) continue;

        const before = fs.readFileSync(file, 'utf8');
        let after = before;
        for (const [from, to] of replacements) after = after.split(from).join(to);

        if (after !== before) {
            fs.writeFileSync(file, after, 'utf8');
            changed++;
        }
    }

    // --- 2. Java パッケージのディレクトリを移動 ---
    const oldPkgDir = path.join(project.javaSrc, old.javaPackage.replace(/\./g, path.sep));
    const newPkgDir = path.join(project.javaSrc, next.javaPackage.replace(/\./g, path.sep));
    if (fs.existsSync(oldPkgDir) && oldPkgDir !== newPkgDir) {
        fs.mkdirSync(path.dirname(newPkgDir), { recursive: true });
        fs.renameSync(oldPkgDir, newPkgDir);
        pruneEmptyDirs(project.javaSrc, path.dirname(oldPkgDir));
    }

    // --- 3. メインクラスのファイル名 ---
    const oldMain = path.join(newPkgDir, `${old.mainClass}.java`);
    const newMain = path.join(newPkgDir, `${next.mainClass}.java`);
    if (fs.existsSync(oldMain) && oldMain !== newMain) fs.renameSync(oldMain, newMain);

    // --- 4. assets / data の名前空間 ---
    for (const kind of ['assets', 'data']) {
        const from = path.join(project.paths.resources, kind, old.namespace);
        const to = path.join(project.paths.resources, kind, next.modId);
        if (fs.existsSync(from) && from !== to) fs.renameSync(from, to);
    }

    return changed;
}

function isSkipped(root, file) {
    const rel = path.relative(root, file);
    return rel.split(path.sep).some(part => SKIP_DIRS.has(part));
}

/** 空になった中間ディレクトリを掃除する */
function pruneEmptyDirs(stopAt, dir) {
    let current = dir;
    while (current.startsWith(stopAt) && current !== stopAt) {
        try {
            if (fs.readdirSync(current).length > 0) break;
            fs.rmdirSync(current);
        } catch {
            break;
        }
        current = path.dirname(current);
    }
}

/** この拡張機能がアドオンだと認識するための目印を書く */
function writeMarker(root, info) {
    const marker = {
        _comment: 'このファイルがあると MC Mod Utility が「MAW アドオン」として認識し、武器スタジオなどを有効にする',
        generator: 'mc-mod-utility',
        template: 'the-four-primitives-and-weapons-addon',
        modId: info.modId,
        displayName: info.displayName,
        javaPackage: info.javaPackage,
        mainClass: info.mainClass,
    };
    fs.writeFileSync(path.join(root, MARKER_FILE), JSON.stringify(marker, null, 2) + '\n', 'utf8');
}

module.exports = { handleRebrand, rebrand, readOldValues, writeMarker };
