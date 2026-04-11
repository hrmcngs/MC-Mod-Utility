const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

/**
 * Java/Kotlin レンダラーファイルに @RotationParams ブロックを挿入する
 */
async function handleAddRotationParams(uri) {
    try {
        // 1. ファイルを特定（3つの方法で試す）
        let fileUri = null;

        // 方法A: 引数のURI
        if (uri && uri.fsPath && fs.existsSync(uri.fsPath) && fs.statSync(uri.fsPath).isFile()) {
            fileUri = uri;
        }

        // 方法B: アクティブエディタ
        if (!fileUri) {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                fileUri = editor.document.uri;
            }
        }

        // 方法C: ファイルピッカー
        if (!fileUri) {
            const picked = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                filters: { 'Java/Kotlin': ['java', 'kt'] },
            });
            if (!picked || picked.length === 0) return;
            fileUri = picked[0];
        }

        const filePath = fileUri.fsPath;

        // Java/Kotlin チェック
        if (!filePath.endsWith('.java') && !filePath.endsWith('.kt')) {
            vscode.window.showWarningMessage('Java/Kotlin ファイルを選択してください。');
            return;
        }

        // 2. ファイル読み込み
        const content = fs.readFileSync(filePath, 'utf8');

        if (content.includes('@RotationParams')) {
            vscode.window.showWarningMessage('このファイルには既に @RotationParams があります。');
            return;
        }

        // class があるか
        const classMatch = content.match(/class\s+(\w+)/);
        if (!classMatch) {
            vscode.window.showWarningMessage('クラス宣言が見つかりません。');
            return;
        }
        const className = classMatch[1];

        // 3. 表示名入力
        const displayName = await vscode.window.showInputBox({
            prompt: 'Rotation group の表示名を入力',
            value: className.replace(/Renderer$/, ''),
            ignoreFocusOut: true,
        });
        if (!displayName) return;

        // 4. モデルの自動検出
        const info = analyzeRenderer(content, filePath);
        let modelOption = '';
        if (info.modelPath) {
            modelOption = `, model=${info.modelPath}`;
        }

        // 5. 挿入位置
        const lines = content.split('\n');
        let insertLine = -1;
        let foundClass = false;
        for (let i = 0; i < lines.length; i++) {
            if (!foundClass && /\bclass\s+\w+/.test(lines[i])) foundClass = true;
            if (foundClass && lines[i].includes('{')) { insertLine = i + 1; break; }
        }
        if (insertLine === -1) {
            vscode.window.showWarningMessage('クラス本体の { が見つかりません。');
            return;
        }

        // インデント
        let indent = '\t';
        for (let i = insertLine; i < Math.min(insertLine + 10, lines.length); i++) {
            const m = lines[i].match(/^(\s+)\S/);
            if (m) { indent = m[1]; break; }
        }

        // 6. 挿入実行
        const block =
            `\n${indent}// @RotationParams(${displayName}${modelOption})\n` +
            `${indent}public static float YAW_OFFSET = 0f; // Y軸回転\n` +
            `${indent}public static float PITCH_OFFSET = 0f; // X軸回転\n` +
            `${indent}public static float ROLL_OFFSET = 0f; // Z軸回転\n` +
            `${indent}public static float SCALE = 1.0f; // 表示サイズ\n` +
            `${indent}// @EndRotationParams\n`;

        // ファイルに直接書き込み（WorkspaceEditが失敗する場合の対策）
        lines.splice(insertLine, 0, ...block.split('\n'));
        fs.writeFileSync(filePath, lines.join('\n'), 'utf8');

        // 7. エディタで表示
        const doc = await vscode.workspace.openTextDocument(filePath);
        const editor = await vscode.window.showTextDocument(doc);
        const pos = new vscode.Position(insertLine + 2, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos));

        // 8. 完了
        let msg = `@RotationParams を ${className} に追加しました。`;
        if (info.type !== 'unknown') msg += ` (${info.type})`;

        const choice = await vscode.window.showInformationMessage(msg, 'Rotation Editor を開く');
        if (choice === 'Rotation Editor を開く') {
            vscode.commands.executeCommand('mc-mod-utility.rotationEditor');
        }

    } catch (err) {
        vscode.window.showErrorMessage(`Add @RotationParams エラー: ${err.message}`);
        console.error('addRotationParams error:', err);
    }
}

/**
 * レンダラーの種類を解析
 */
function analyzeRenderer(content, filePath) {
    const result = { type: 'unknown', modelPath: null };
    const workspaceRoot = getWorkspaceRoot(filePath);

    if (content.includes('GeoEntityRenderer') || content.includes('geckolib')) {
        result.type = 'geckolib';
        const modelClassMatch = content.match(/new\s+(\w+Model)\s*\(/);
        if (modelClassMatch && workspaceRoot) {
            const geoPath = findGeckoGeoPath(modelClassMatch[1], workspaceRoot);
            if (geoPath) result.modelPath = geoPath;
        }
    } else if (content.includes('renderStatic') || content.includes('ItemDisplayContext')) {
        result.type = 'item-renderer';
    } else if (content.includes('renderCube') || content.includes('VertexConsumer')) {
        result.type = 'custom-vertex';
    } else if (content.includes('HumanoidMobRenderer')) {
        result.type = 'humanoid';
    } else if (content.includes('EntityRenderer')) {
        result.type = 'entity-renderer';
    }

    return result;
}

function findGeckoGeoPath(modelClassName, workspaceRoot) {
    const srcDir = path.join(workspaceRoot, 'src');
    const modelFile = findFile(srcDir, modelClassName + '.java');
    if (!modelFile) return null;

    const content = fs.readFileSync(modelFile, 'utf8');
    const match = content.match(/getModelResource[\s\S]*?new\s+ResourceLocation\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/);
    if (match) return match[1] + ':' + match[2];
    return null;
}

function findFile(dir, name) {
    try {
        for (const e of fs.readdirSync(dir)) {
            const full = path.join(dir, e);
            if (fs.statSync(full).isDirectory() && e !== 'build' && e !== 'node_modules') {
                const r = findFile(full, name);
                if (r) return r;
            } else if (e === name) return full;
        }
    } catch {}
    return null;
}

function getWorkspaceRoot(filePath) {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) return null;
    for (const f of folders) {
        if (filePath.startsWith(f.uri.fsPath)) return f.uri.fsPath;
    }
    return folders[0]?.uri.fsPath || null;
}

module.exports = { handleAddRotationParams };
