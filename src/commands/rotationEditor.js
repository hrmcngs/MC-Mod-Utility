const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { RconClient } = require('../util/rconClient');

// マーカーコメントで囲まれた回転パラメータを検出する正規表現
const MARKER_START = /\/\/\s*@RotationParams\s*(?:\((.+?)\))?\s*$/;
const CMD_PATTERN = /,\s*cmd\s*=\s*(.+)/;
const MODEL_PATTERN = /,\s*model\s*=\s*([^\s,)]+)/;
const MARKER_END = /\/\/\s*@EndRotationParams/;
const PARAM_LINE = /(?:public\s+)?static\s+(?:float|double)\s+(\w+)\s*=\s*([-\d.f]+)\s*;.*?\/\/\s*(.+)/;

// デフォルトの矢印モデル（model指定なし・見つからない場合のフォールバック）
const DEFAULT_ARROW_MODEL = [
    { from: [7, 0, 0], to: [9, 2, 12] },      // シャフト
    { from: [5, 0, 12], to: [11, 2, 16] },     // 矢じり
    { from: [4, 0, 0], to: [7, 1, 3] },        // 羽根左
    { from: [9, 0, 0], to: [12, 1, 3] },       // 羽根右
];

// parent名から推測するプリセットモデル
const PARENT_PRESETS = {
    'item/handheld': [
        { from: [7.5, 1, 0],   to: [8.5, 2, 11] },    // ブレード
        { from: [7.5, 0, 11],  to: [8.5, 1, 15] },    // 柄
        { from: [6, 0.5, 10.5], to: [10, 1.5, 11.5] }, // 鍔
    ],
    'item/generated': [
        { from: [2, 2, 7.5], to: [14, 14, 8.5] },
    ],
};

// デフォルトのアイテムモデル（鉄の剣）— 他mod環境でも使える汎用形状
const IRON_SWORD_MODEL = {
    elements: [
        { from: [7, 0, 7.5], to: [9, 1, 8.5] },        // 刃先
        { from: [6.5, 1, 7.5], to: [9.5, 3, 8.5] },    // 刃上部
        { from: [7, 3, 7.5], to: [9, 11, 8.5] },        // 刃
        { from: [7.5, 11, 7.5], to: [8.5, 12, 8.5] },   // 鍔
        { from: [6, 11.5, 7.5], to: [10, 12.5, 8.5] },  // 鍔横
        { from: [7.5, 12, 7.5], to: [8.5, 15, 8.5] },   // 柄
        { from: [7, 15, 7.5], to: [9, 16, 8.5] },        // 柄尻
    ],
    name: 'iron_sword (default)',
};

// 人型エンティティのワイヤーフレーム（Minecraftのプレイヤーモデル準拠、ピクセル単位）
const HUMANOID_BONES = [
    { name: 'head',     from: [-4, 24, -4], to: [4, 32, 4],   color: '#aaa' },
    { name: 'body',     from: [-4, 12, -2], to: [4, 24, 2],   color: '#888' },
    { name: 'arm_r',    from: [-8, 12, -2], to: [-4, 24, 2],  color: '#999' },
    { name: 'arm_l',    from: [4, 12, -2],  to: [8, 24, 2],   color: '#777' },
    { name: 'leg_r',    from: [-4, 0, -2],  to: [0, 12, 2],   color: '#888' },
    { name: 'leg_l',    from: [0, 0, -2],   to: [4, 12, 2],   color: '#777' },
];

/**
 * ワークスペース内の Java/Kotlin ファイルから @RotationParams ブロックを検索
 */
async function findRotationParams() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return [];

    const excludePattern = '**/build/**';
    const results = [];

    for (const folder of workspaceFolders) {
        // 全 .java/.kt を一括検索（上限5000）
        const pattern = new vscode.RelativePattern(folder, 'src/**/*.{java,kt}');
        const allFiles = await vscode.workspace.findFiles(pattern, excludePattern, 5000);

        for (const fileUri of allFiles) {
            const content = fs.readFileSync(fileUri.fsPath, 'utf8');
            // 高速フィルタ: @RotationParams を含まないファイルはスキップ
            if (!content.includes('@RotationParams')) continue;
            const lines = content.split('\n');

            let inBlock = false;
            let groupName = '';
            let cmdTemplate = null;
            let modelPath = null;
            let params = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                const startMatch = line.match(MARKER_START);
                if (startMatch) {
                    inBlock = true;
                    let rawArg = startMatch[1] || path.basename(fileUri.fsPath, path.extname(fileUri.fsPath));

                    // model= を抽出
                    const modelMatch = rawArg.match(MODEL_PATTERN);
                    modelPath = modelMatch ? modelMatch[1].trim() : null;
                    rawArg = rawArg.replace(MODEL_PATTERN, '');

                    // cmd= を抽出
                    const cmdMatch = rawArg.match(CMD_PATTERN);
                    cmdTemplate = cmdMatch ? cmdMatch[1].trim() : null;
                    groupName = cmdMatch ? rawArg.replace(CMD_PATTERN, '').trim() : rawArg.trim();

                    params = [];
                    continue;
                }

                if (inBlock && MARKER_END.test(line)) {
                    if (params.length > 0) {
                        // モデルを解決
                        const model3d = resolveModel(fileUri.fsPath, modelPath, content, folder.uri.fsPath);
                        results.push({
                            file: fileUri.fsPath,
                            group: groupName,
                            cmdTemplate,
                            model3d,
                            params,
                        });
                    }
                    inBlock = false;
                    continue;
                }

                if (inBlock) {
                    const paramMatch = line.match(PARAM_LINE);
                    if (paramMatch) {
                        params.push({
                            name: paramMatch[1],
                            value: parseFloat(paramMatch[2].replace(/f$/, '')),
                            label: paramMatch[3].trim(),
                            line: i,
                        });
                    }
                }
            }
        }
    }

    return results;
}

/**
 * モデルを解決する。優先度:
 * 1. model= で直接指定されたJSONパス
 * 2. レンダラーファイルからItemStack/モデル参照を自動検出
 * 3. デフォルトの矢印モデル
 */
function resolveModel(filePath, modelPath, fileContent, workspaceRoot) {
    // 1. model= 指定
    if (modelPath) {
        const resolved = findModelJson(modelPath, workspaceRoot);
        if (resolved) return resolved;
    }

    // 2. レンダラーから自動検出
    const autoModel = detectModelFromRenderer(fileContent, workspaceRoot);
    if (autoModel) return autoModel;

    // 3. フォールバック: 矢印
    return { elements: DEFAULT_ARROW_MODEL, name: 'arrow (default)' };
}

/**
 * モデルJSONファイルを探して読み込み、elementsを返す
 */
function findModelJson(modelRef, workspaceRoot) {
    // パスの候補を生成
    const candidates = [];

    // そのままの相対パス
    candidates.push(path.join(workspaceRoot, modelRef));

    // assets/以下を検索 (例: "custom/arrowitem" → assets/*/models/custom/arrowitem.json)
    if (!modelRef.endsWith('.json')) modelRef += '.json';

    // namespace:path 形式 (例: "minecraft_armor_weapon:geo/blackhole.geo.json")
    const colonIdx = modelRef.indexOf(':');
    if (colonIdx >= 0) {
        const ns = modelRef.substring(0, colonIdx);
        const p = modelRef.substring(colonIdx + 1);
        candidates.push(path.join(workspaceRoot, 'src/main/resources/assets', ns, 'models', p));
        // GeckoLib: assets/<ns>/geo/ と assets/<ns>/animations/
        candidates.push(path.join(workspaceRoot, 'src/main/resources/assets', ns, p));
    } else {
        // namespace なし — assets下の全namespaceを探す
        const assetsDir = path.join(workspaceRoot, 'src/main/resources/assets');
        if (fs.existsSync(assetsDir)) {
            try {
                for (const ns of fs.readdirSync(assetsDir)) {
                    const nsPath = path.join(assetsDir, ns);
                    if (fs.statSync(nsPath).isDirectory()) {
                        candidates.push(path.join(nsPath, 'models', modelRef));
                        candidates.push(path.join(nsPath, 'models/item', modelRef));
                        candidates.push(path.join(nsPath, 'models/custom', modelRef));
                        candidates.push(path.join(nsPath, 'models/block', modelRef));
                        // GeckoLib
                        candidates.push(path.join(nsPath, 'geo', modelRef));
                        candidates.push(path.join(nsPath, modelRef));
                    }
                }
            } catch {}
        }
    }

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            try {
                return parseModelJson(candidate, workspaceRoot);
            } catch {}
        }
    }

    return null;
}

/**
 * Minecraft モデルJSONを読み込み、parent チェーンを辿って elements を取得
 */
function parseModelJson(jsonPath, workspaceRoot, depth = 0) {
    if (depth > 5) return null;

    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const modelName = path.basename(jsonPath, '.json').replace('.geo', '');

    // === GeckoLib .geo.json 形式 ===
    if (raw['minecraft:geometry'] || raw.format_version) {
        const geom = raw['minecraft:geometry'];
        if (geom && Array.isArray(geom) && geom.length > 0) {
            const elements = [];
            for (const geo of geom) {
                if (!geo.bones) continue;
                for (const bone of geo.bones) {
                    if (!bone.cubes) continue;
                    for (const cube of bone.cubes) {
                        if (cube.origin && cube.size) {
                            // GeckoLib: origin = [x,y,z], size = [w,h,d]
                            // from = origin, to = origin + size
                            elements.push({
                                from: cube.origin,
                                to: [
                                    cube.origin[0] + cube.size[0],
                                    cube.origin[1] + cube.size[1],
                                    cube.origin[2] + cube.size[2],
                                ],
                            });
                        }
                    }
                }
            }
            if (elements.length > 0) {
                return { elements, name: modelName + ' (geckolib)' };
            }
        }
    }

    // === 通常の Minecraft モデル JSON ===
    // elements があればそれを返す
    if (raw.elements && raw.elements.length > 0) {
        const elements = raw.elements.map(el => ({
            from: el.from,
            to: el.to,
        })).filter(el => el.from && el.to);

        if (elements.length > 0) {
            return { elements, name: modelName };
        }
    }

    // parent を辿る
    if (raw.parent) {
        const parentRef = raw.parent;

        // ビルトインのプリセットをチェック
        for (const [key, preset] of Object.entries(PARENT_PRESETS)) {
            if (parentRef === key || parentRef === 'minecraft:' + key) {
                return { elements: preset, name: modelName + ' (' + key + ')' };
            }
        }

        // parent のJSONを探す
        const parentModel = findModelJson(parentRef, workspaceRoot);
        if (parentModel) {
            parentModel.name = modelName;
            return parentModel;
        }
    }

    return null;
}

/**
 * レンダラーのJavaソースからモデル参照を自動検出
 */
function detectModelFromRenderer(fileContent, workspaceRoot) {
    // === GeckoLib: GeoEntityRenderer → モデルクラス → geo.json ===
    if (fileContent.includes('GeoEntityRenderer') || fileContent.includes('GeoModel')) {
        // new SomeModel() を探す
        const modelClassMatch = fileContent.match(/new\s+(\w+Model)\s*\(/);
        if (modelClassMatch) {
            const geoModel = findGeckoGeoFromModelClass(modelClassMatch[1], workspaceRoot);
            if (geoModel) return geoModel;
        }
    }

    // === カスタム vertex (renderCube等): キューブモデルを生成 ===
    if (fileContent.includes('renderCube') || (fileContent.includes('VertexConsumer') && fileContent.includes('vertex('))) {
        const sizeMatch = fileContent.match(/float\s+size\s*=\s*([\d.]+)f?/);
        const s = sizeMatch ? parseFloat(sizeMatch[1]) * 16 : 4.8; // Minecraft座標に変換
        return {
            elements: [{ from: [8-s, 8-s, 8-s], to: [8+s, 8+s, 8+s] }],
            name: 'cube (detected)',
        };
    }

    // === ItemStack レンダリング ===
    const itemStackMatch = fileContent.match(/new\s+ItemStack\(\s*\w+\.(\w+)\.get\(\)/);
    if (itemStackMatch) {
        const itemName = itemStackMatch[1].toLowerCase();
        const model = findModelJson(itemName + '.json', workspaceRoot);
        if (model) return model;
    }

    // === ResourceLocation ===
    const resLocMatch = fileContent.match(/new\s+ResourceLocation\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/);
    if (resLocMatch) {
        const model = findModelJson(resLocMatch[1] + ':' + resLocMatch[2], workspaceRoot);
        if (model) return model;
    }

    return null;
}

/**
 * GeckoLib モデルクラス名から .geo.json を見つけて解析
 */
function findGeckoGeoFromModelClass(modelClassName, workspaceRoot) {
    const srcDir = path.join(workspaceRoot, 'src');

    // モデルクラスの Java ファイルを再帰検索
    function findFile(dir, name) {
        try {
            for (const e of fs.readdirSync(dir)) {
                const full = path.join(dir, e);
                if (fs.statSync(full).isDirectory() && e !== 'build') {
                    const r = findFile(full, name);
                    if (r) return r;
                } else if (e === name) return full;
            }
        } catch {}
        return null;
    }

    const modelFile = findFile(srcDir, modelClassName + '.java');
    if (!modelFile) return null;

    const modelContent = fs.readFileSync(modelFile, 'utf8');

    // getModelResource → ResourceLocation("ns", "geo/xxx.geo.json")
    const geoMatch = modelContent.match(/getModelResource[\s\S]*?new\s+ResourceLocation\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/);
    if (geoMatch) {
        const geoRef = geoMatch[1] + ':' + geoMatch[2];
        const model = findModelJson(geoRef, workspaceRoot);
        if (model) return model;
    }

    return null;
}

/**
 * パラメータ値をファイルに書き戻す
 */
function writeParamValue(filePath, lineIndex, newValue) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const line = lines[lineIndex];
    const updated = line.replace(
        /(=\s*)([-\d.]+f?)(\s*;)/,
        `$1${newValue}f$3`
    );
    lines[lineIndex] = updated;
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

// RCON クライアント（シングルトン）
let rcon = null;
let rconConnected = false;

async function connectRcon() {
    const config = vscode.workspace.getConfiguration('mc-mod-utility.rcon');
    const host = config.get('host', 'localhost');
    const port = config.get('port', 25575);
    const password = config.get('password', 'minecraft');

    if (rcon) rcon.disconnect();
    rcon = new RconClient();

    try {
        await rcon.connect(host, port, password);
        rconConnected = true;
        vscode.window.showInformationMessage(`RCON connected to ${host}:${port}`);
    } catch (err) {
        rconConnected = false;
        rcon = null;
        vscode.window.showErrorMessage(`RCON failed: ${err.message}`);
    }
    return rconConnected;
}

async function sendRconCommand(command) {
    if (!rcon || !rconConnected) return null;
    try {
        return await rcon.sendCommand(command);
    } catch (err) {
        rconConnected = false;
        return null;
    }
}

/**
 * Webview パネルを作成・表示
 */
async function handleRotationEditor(context) {
    const groups = await findRotationParams();

    if (groups.length === 0) {
        const folders = vscode.workspace.workspaceFolders;
        const folderList = folders ? folders.map(f => f.uri.fsPath).join(', ') : '(none)';
        vscode.window.showWarningMessage(
            `No @RotationParams blocks found.\n` +
            `Workspace folders: ${folderList}\n` +
            `Open a mod project folder that contains @RotationParams markers.`
        );
        return;
    }

    // 複数ある場合はどれを開くか選択
    let selectedGroup = groups;
    if (groups.length > 1) {
        const items = groups.map((g, i) => ({
            label: g.group,
            description: g.file.replace(/\\/g, '/').replace(/^.*?src\//, 'src/'),
            index: i,
        }));
        const picked = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a renderer to edit',
        });
        if (!picked) return;
        selectedGroup = [groups[picked.index]];
    }

    const panel = vscode.window.createWebviewPanel(
        'rotationEditor',
        'Rotation Editor',
        vscode.ViewColumn.Beside,
        { enableScripts: true }
    );

    panel.webview.html = getWebviewContent(selectedGroup);

    panel.webview.onDidReceiveMessage(
        async (message) => {
            if (message.command === 'updateParam') {
                writeParamValue(message.file, message.line, message.value);
            } else if (message.command === 'rconSend') {
                // RCON でコマンドを送信
                const result = await sendRconCommand(message.rconCommand);
                panel.webview.postMessage({ command: 'rconResult', result, connected: rconConnected });
            } else if (message.command === 'rconConnect') {
                const ok = await connectRcon();
                panel.webview.postMessage({ command: 'rconStatus', connected: ok });
            } else if (message.command === 'rconDisconnect') {
                if (rcon) rcon.disconnect();
                rconConnected = false;
                rcon = null;
                panel.webview.postMessage({ command: 'rconStatus', connected: false });
            } else if (message.command === 'refresh') {
                const updated = await findRotationParams();
                panel.webview.html = getWebviewContent(updated);
            } else if (message.command === 'openFile') {
                const doc = await vscode.workspace.openTextDocument(message.file);
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
            } else if (message.command === 'pickItem') {
                // 手に持つアイテムのモデルを選択
                const gi = message.groupIndex;
                const modelFiles = await vscode.workspace.findFiles('{**/models/item/**/*.json,**/models/custom/**/*.json,**/geo/**/*.json}', '**/build/**', 500);
                const items = [
                    { label: 'iron_sword (default)', description: 'Built-in iron sword model', fsPath: '__default__' },
                    ...modelFiles.map(f => ({
                        label: path.basename(f.fsPath, '.json').replace('.geo', ''),
                        description: vscode.workspace.asRelativePath(f),
                        fsPath: f.fsPath,
                    })),
                ].sort((a, b) => a.label.localeCompare(b.label));

                const picked = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select item model for entity to hold',
                    matchOnDescription: true,
                });
                if (!picked) return;

                let model;
                if (picked.fsPath === '__default__') {
                    model = IRON_SWORD_MODEL;
                } else {
                    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
                    model = parseModelJson(picked.fsPath, workspaceRoot);
                }
                if (model) {
                    panel.webview.postMessage({ command: 'updateItem', groupIndex: gi, model });
                }
            } else if (message.command === 'pickModel') {
                // モデルJSONファイルをピッカーで選択
                const gi = message.groupIndex;
                const modelFiles = await vscode.workspace.findFiles('{**/models/**/*.json,**/geo/**/*.json}', '**/build/**', 500);
                if (modelFiles.length === 0) {
                    vscode.window.showWarningMessage('No model JSON files found in workspace.');
                    return;
                }
                const items = modelFiles.map(f => {
                    const rel = vscode.workspace.asRelativePath(f);
                    return { label: path.basename(f.fsPath, '.json'), description: rel, fsPath: f.fsPath };
                }).sort((a, b) => a.label.localeCompare(b.label));

                const picked = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select a model JSON to preview',
                    matchOnDescription: true,
                });
                if (!picked) return;

                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
                const model = parseModelJson(picked.fsPath, workspaceRoot);
                if (model) {
                    panel.webview.postMessage({ command: 'updateModel', groupIndex: gi, model });
                } else {
                    vscode.window.showWarningMessage('Could not parse model: ' + picked.label);
                }
            }
        },
        undefined,
        context.subscriptions
    );

    // パネル閉じた時にRCON切断
    panel.onDidDispose(() => {
        if (rcon) rcon.disconnect();
        rconConnected = false;
        rcon = null;
    });
}

/**
 * Webview の HTML を生成
 */
function getWebviewContent(groups) {
    const groupsHtml = groups.map((group, gi) => {
        const paramsHtml = group.params.map((p, pi) => {
            const range = guessRange(p.name, p.value);
            return `
            <div class="param-row">
                <label class="param-label">${p.label}</label>
                <span class="param-name">${p.name}</span>
                <input type="range"
                    class="slider"
                    min="${range.min}" max="${range.max}" step="${range.step}"
                    value="${p.value}"
                    data-file="${escapeHtml(group.file)}"
                    data-line="${p.line}"
                    data-id="g${gi}p${pi}"
                    oninput="onSlider(this)">
                <input type="number"
                    class="num-input"
                    min="${range.min}" max="${range.max}" step="${range.step}"
                    value="${p.value}"
                    data-file="${escapeHtml(group.file)}"
                    data-line="${p.line}"
                    data-id="g${gi}p${pi}"
                    onchange="onNumInput(this)">
            </div>`;
        }).join('');

        const shortPath = group.file.replace(/\\/g, '/').replace(/^.*?src\//, 'src/');

        const cmdHtml = group.cmdTemplate ? `
            <div class="cmd-row">
                <code class="cmd-preview" id="cmd-g${gi}">${escapeHtml(buildCommand(group.cmdTemplate, group.params))}</code>
                <button class="cmd-copy-btn" onclick="copyCommand('cmd-g${gi}')">Copy</button>
            </div>` : '';

        const modelLabel = group.model3d ? group.model3d.name || 'model' : 'arrow';

        return `
        <div class="group">
            <div class="group-header">
                <div class="group-title-row">
                    <div class="group-icon">3D</div>
                    <div>
                        <h2>${escapeHtml(group.group)}</h2>
                        <span class="file-path" onclick="openFile('${escapeHtml(group.file.replace(/\\/g, '\\\\'))}')">${escapeHtml(shortPath)}</span>
                    </div>
                </div>
            </div>
            <div class="preview-section">
                <div class="canvas-wrapper">
                    <canvas id="canvas-g${gi}" class="preview-canvas" width="360" height="360" tabindex="0"></canvas>
                    <div class="canvas-overlay-top">
                        <span class="cam-badge" id="cam-mode-g${gi}">Perspective</span>
                        <span class="model-badge" id="model-label-g${gi}">${escapeHtml(modelLabel)}</span>
                    </div>
                    <div class="canvas-overlay-bottom">
                        <span class="hint-badge">Space: View | Drag: Rotate | Scroll: Zoom</span>
                    </div>
                </div>
                <div class="canvas-actions">
                    <button class="action-btn" onclick="changeModel(${gi})">Change Model</button>
                    <button class="action-btn" onclick="toggleEntity(${gi})" id="entity-btn-g${gi}">Entity: OFF</button>
                    <button class="action-btn" onclick="changeItem(${gi})">Held Item</button>
                </div>
            </div>
            ${cmdHtml}
            <div class="params-section">
                <div class="params-header">Parameters</div>
                ${paramsHtml}
            </div>
        </div>`;
    }).join('');

    // モデルデータをJSに埋め込み
    const modelsJson = JSON.stringify(groups.map(g => g.model3d));

    return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<style>
    * { box-sizing: border-box; }
    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', var(--vscode-font-family), sans-serif;
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        padding: 20px; margin: 0;
    }

    /* === Header === */
    .app-header {
        display: flex; align-items: center; gap: 12px;
        margin-bottom: 20px; padding-bottom: 14px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .app-logo {
        width: 36px; height: 36px; border-radius: 8px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        display: flex; align-items: center; justify-content: center;
        font-size: 14px; font-weight: 800; color: #fff; flex-shrink: 0;
    }
    .app-header h1 { font-size: 18px; margin: 0; font-weight: 700; letter-spacing: -0.3px; }
    .app-header .subtitle { font-size: 11px; color: var(--vscode-descriptionForeground); margin: 2px 0 0; }

    /* === Toolbar === */
    .toolbar {
        display: flex; gap: 8px; margin-bottom: 18px; flex-wrap: wrap; align-items: center;
    }
    button {
        padding: 6px 14px; border: none; border-radius: 6px; cursor: pointer;
        font-size: 12px; font-weight: 600; transition: all 0.15s;
        background: rgba(255,255,255,0.08); color: var(--vscode-foreground);
    }
    button:hover { background: rgba(255,255,255,0.14); transform: translateY(-1px); }
    button:active { transform: translateY(0); }
    .rcon-btn { padding: 6px 16px; border-radius: 20px; font-size: 11px; letter-spacing: 0.5px; }
    .rcon-off { background: rgba(255,255,255,0.06); color: #888; }
    .rcon-on { background: linear-gradient(135deg, #2ecc71, #27ae60); color: #fff; box-shadow: 0 2px 8px rgba(46,204,113,0.3); }
    .rcon-status { font-size: 10px; color: #2ecc71; align-self: center; }

    /* === Group Card === */
    .group {
        background: rgba(255,255,255,0.02);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 12px; padding: 0; margin-bottom: 20px;
        overflow: hidden;
    }
    .group-header {
        padding: 14px 18px;
        background: rgba(255,255,255,0.03);
        border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .group-title-row { display: flex; align-items: center; gap: 10px; }
    .group-icon {
        width: 32px; height: 32px; border-radius: 8px;
        background: linear-gradient(135deg, #667eea, #764ba2);
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 800; color: #fff; flex-shrink: 0;
    }
    .group-header h2 { font-size: 16px; margin: 0; font-weight: 700; }
    .file-path {
        font-size: 10px; color: var(--vscode-textLink-foreground); cursor: pointer;
        text-decoration: none; opacity: 0.7;
    }
    .file-path:hover { opacity: 1; text-decoration: underline; }

    /* === 3D Preview === */
    .preview-section { padding: 16px 18px; }
    .canvas-wrapper {
        position: relative; display: inline-block; width: 100%;
    }
    .preview-canvas {
        background: radial-gradient(ellipse at center, #161630 0%, #0a0a1a 100%);
        border: 1px solid rgba(255,255,255,0.08); border-radius: 10px;
        outline: none; width: 100%; height: auto; display: block;
    }
    .preview-canvas:focus { border-color: #667eea; box-shadow: 0 0 0 2px rgba(102,126,234,0.25); }
    .canvas-overlay-top {
        position: absolute; top: 8px; left: 8px; right: 8px;
        display: flex; justify-content: space-between; pointer-events: none;
    }
    .canvas-overlay-bottom {
        position: absolute; bottom: 8px; left: 8px; right: 8px;
        display: flex; justify-content: center; pointer-events: none;
    }
    .cam-badge, .model-badge, .hint-badge {
        padding: 2px 8px; border-radius: 4px; font-size: 10px;
        font-family: var(--vscode-editor-font-family);
    }
    .cam-badge { background: rgba(102,126,234,0.8); color: #fff; }
    .model-badge { background: rgba(255,255,255,0.1); color: #aaa; }
    .hint-badge { background: rgba(0,0,0,0.5); color: #777; font-size: 9px; }
    .canvas-actions { display: flex; gap: 6px; margin-top: 8px; }
    .action-btn {
        font-size: 11px; padding: 4px 12px; border-radius: 6px;
        background: rgba(255,255,255,0.06); color: #aaa;
    }

    /* === Command Row === */
    .cmd-row {
        display: flex; align-items: center; gap: 8px; margin: 0 18px 4px; padding: 8px 12px;
        background: rgba(0,0,0,0.2); border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.04);
    }
    .cmd-preview {
        flex: 1; font-family: var(--vscode-editor-font-family); font-size: 12px;
        color: #8be9fd; word-break: break-all;
    }
    .cmd-copy-btn {
        flex-shrink: 0; padding: 4px 12px; font-size: 10px; border-radius: 6px;
        background: rgba(255,255,255,0.08);
    }
    .cmd-copy-btn.copied { background: #2ecc71; color: #fff; }

    /* === Parameters === */
    .params-section { padding: 12px 18px 18px; }
    .params-header {
        font-size: 11px; font-weight: 700; text-transform: uppercase;
        letter-spacing: 1px; color: #666; margin-bottom: 10px;
    }
    .param-row {
        display: grid; grid-template-columns: minmax(80px, 1fr) 90px 1fr 72px;
        align-items: center; gap: 8px; margin-bottom: 6px;
        padding: 6px 10px; border-radius: 6px;
        background: rgba(255,255,255,0.02);
        transition: background 0.15s;
    }
    .param-row:hover { background: rgba(255,255,255,0.05); }
    .param-label { font-size: 12px; font-weight: 500; }
    .param-name {
        font-size: 10px; color: #666;
        font-family: var(--vscode-editor-font-family);
    }
    .slider {
        width: 100%; height: 4px; -webkit-appearance: none; appearance: none;
        background: rgba(255,255,255,0.1); border-radius: 2px; outline: none;
    }
    .slider::-webkit-slider-thumb {
        -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
        background: linear-gradient(135deg, #667eea, #764ba2);
        cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    }
    .num-input {
        width: 100%; padding: 4px 8px; text-align: center;
        background: rgba(0,0,0,0.3); color: var(--vscode-foreground);
        border: 1px solid rgba(255,255,255,0.08); border-radius: 6px;
        font-size: 12px; font-family: var(--vscode-editor-font-family);
    }
    .num-input:focus { border-color: #667eea; outline: none; }

    /* === Howto === */
    .howto {
        margin-top: 24px; padding: 14px 18px; border-radius: 10px;
        background: rgba(255,255,255,0.02);
        border: 1px solid rgba(255,255,255,0.04);
        font-size: 11px; line-height: 1.7; color: #888;
    }
    .howto strong { color: var(--vscode-foreground); }
    .howto code {
        background: rgba(255,255,255,0.06); padding: 1px 6px; border-radius: 4px;
        font-family: var(--vscode-editor-font-family); font-size: 11px; color: #8be9fd;
    }
</style>
</head>
<body>
    <div class="app-header">
        <div class="app-logo">RE</div>
        <div>
            <h1>Rotation Editor</h1>
            <p class="subtitle">3D Preview & Real-time Parameter Tuning</p>
        </div>
    </div>
    <div class="toolbar">
        <button onclick="refresh()">Refresh</button>
        <button id="rcon-btn" onclick="toggleRcon()" class="rcon-btn rcon-off">RCON OFF</button>
        <span id="rcon-status" class="rcon-status"></span>
    </div>

    ${groupsHtml}

    <div class="howto">
        <strong>どのMODプロジェクトでも使えます (Forge / Fabric / NeoForge / Quilt)</strong><br><br>
        <code>// @RotationParams(名前)</code> — 基本<br>
        <code>// @RotationParams(名前, model=custom/arrowitem)</code> — 3Dモデル指定<br>
        <code>// @RotationParams(名前, cmd=/test rot {YAW} {PITCH})</code> — コマンド連携<br>
        <code>// @RotationParams(名前, model=ns:custom/sword, cmd=/rot {Y} {P} {R})</code> — 両方<br><br>
        <strong>model=</strong> の検索先: <code>assets/&lt;namespace&gt;/models/</code> 以下<br>
        指定なしの場合はレンダラーのItemStack参照から自動検出。見つからなければ矢印表示。<br><br>
        <strong>RCON リアルタイム連携:</strong><br>
        1. <code>server.properties</code> に <code>enable-rcon=true</code>, <code>rcon.password=minecraft</code>, <code>rcon.port=25575</code> を設定<br>
        2. Minecraft サーバーを起動<br>
        3. Rotation Editor の <strong>RCON: OFF</strong> ボタンをクリックして接続<br>
        4. スライダーを動かすと <code>cmd=</code> のコマンドが自動送信されます
    </div>

<script>
    const vscode = acquireVsCodeApi();
    const models = ${modelsJson};
    let debounceTimers = {};

    let rconActive = false;
    let rconDebounce = {};

    function onSlider(el) {
        const id = el.dataset.id;
        const numInput = document.querySelector('input[type="number"][data-id="' + id + '"]');
        if (numInput) numInput.value = el.value;
        const gi = parseInt(id.match(/g([0-9]+)/)[1]);
        updateCmdPreview(gi);
        drawPreview(gi);
        clearTimeout(debounceTimers[id]);
        debounceTimers[id] = setTimeout(() => {
            vscode.postMessage({ command: 'updateParam', file: el.dataset.file, line: parseInt(el.dataset.line), value: parseFloat(el.value) });
        }, 100);
        // RCON: スライダー変更時にコマンドを自動送信
        sendRconForGroup(gi);
    }

    function onNumInput(el) {
        const id = el.dataset.id;
        const slider = document.querySelector('input[type="range"][data-id="' + id + '"]');
        if (slider) slider.value = el.value;
        const gi = parseInt(id.match(/g([0-9]+)/)[1]);
        updateCmdPreview(gi);
        drawPreview(gi);
        vscode.postMessage({ command: 'updateParam', file: el.dataset.file, line: parseInt(el.dataset.line), value: parseFloat(el.value) });
        sendRconForGroup(gi);
    }

    // RCON: cmd= テンプレートからコマンドを組み立てて送信
    function sendRconForGroup(gi) {
        if (!rconActive) return;
        const t = cmdTemplates[gi];
        if (!t) return;
        let cmd = t;
        document.querySelectorAll('input[type="range"][data-id^="g' + gi + 'p"]').forEach(s => {
            const n = s.closest('.param-row').querySelector('.param-name').textContent;
            cmd = cmd.replace('{' + n + '}', s.value);
        });
        // デバウンス（50ms）
        clearTimeout(rconDebounce[gi]);
        rconDebounce[gi] = setTimeout(() => {
            vscode.postMessage({ command: 'rconSend', rconCommand: cmd });
        }, 50);
    }

    function toggleRcon() {
        if (rconActive) {
            vscode.postMessage({ command: 'rconDisconnect' });
        } else {
            vscode.postMessage({ command: 'rconConnect' });
        }
    }

    // 拡張側からのメッセージ受信
    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.command === 'rconStatus') {
            rconActive = msg.connected;
            updateRconUI();
        } else if (msg.command === 'rconResult') {
            rconActive = msg.connected;
            updateRconUI();
        } else if (msg.command === 'updateModel') {
            models[msg.groupIndex] = msg.model;
            const label = document.getElementById('model-label-g' + msg.groupIndex);
            if (label) label.textContent = msg.model.name || 'model';
            drawPreview(msg.groupIndex);
        } else if (msg.command === 'updateItem') {
            const state = getEntityState(msg.groupIndex);
            state.heldItem = msg.model;
            state.show = true;
            const btn = document.getElementById('entity-btn-g' + msg.groupIndex);
            if (btn) { btn.textContent = 'Entity: ON'; btn.style.background = 'rgba(102,126,234,0.3)'; }
            drawPreview(msg.groupIndex);
        }
    });

    function updateRconUI() {
        const btn = document.getElementById('rcon-btn');
        const status = document.getElementById('rcon-status');
        if (rconActive) {
            btn.textContent = 'RCON: ON';
            btn.className = 'rcon-btn rcon-on';
            status.textContent = 'Connected - slider changes auto-send commands';
        } else {
            btn.textContent = 'RCON: OFF';
            btn.className = 'rcon-btn rcon-off';
            status.textContent = '';
        }
    }

    // エンティティ表示状態
    const entityState = {};
    function getEntityState(gi) {
        if (!entityState[gi]) entityState[gi] = { show: false, heldItem: null };
        return entityState[gi];
    }

    function toggleEntity(gi) {
        const state = getEntityState(gi);
        state.show = !state.show;
        const btn = document.getElementById('entity-btn-g' + gi);
        if (btn) {
            btn.textContent = state.show ? 'Entity: ON' : 'Entity: OFF';
            btn.style.background = state.show ? 'rgba(102,126,234,0.3)' : '';
        }
        drawPreview(gi);
    }

    function changeItem(gi) {
        vscode.postMessage({ command: 'pickItem', groupIndex: gi });
    }

    function refresh() { vscode.postMessage({ command: 'refresh' }); }
    function openFile(fp) { vscode.postMessage({ command: 'openFile', file: fp }); }
    function changeModel(gi) { vscode.postMessage({ command: 'pickModel', groupIndex: gi }); }

    function copyCommand(cmdId) {
        const el = document.getElementById(cmdId);
        if (!el) return;
        navigator.clipboard.writeText(el.textContent).then(() => {
            const btn = el.nextElementSibling;
            btn.textContent = 'Copied!'; btn.classList.add('copied');
            setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
        });
    }

    const cmdTemplates = ${JSON.stringify(groups.map(g => g.cmdTemplate || null))};
    function updateCmdPreview(gi) {
        const t = cmdTemplates[gi]; if (!t) return;
        const el = document.getElementById('cmd-g' + gi); if (!el) return;
        let cmd = t;
        document.querySelectorAll('input[type="range"][data-id^="g' + gi + 'p"]').forEach(s => {
            const n = s.closest('.param-row').querySelector('.param-name').textContent;
            cmd = cmd.replace('{' + n + '}', s.value);
        });
        el.textContent = cmd;
    }

    // === 3D レンダリング ===
    const DEG = Math.PI / 180;

    // プリセットカメラ角度（Spaceで切替）
    const CAM_PRESETS = [
        { name: 'Perspective', yaw: 30, pitch: -20 },
        { name: 'Front (Z+)',  yaw: 0,   pitch: 0 },
        { name: 'Back (Z-)',   yaw: 180, pitch: 0 },
        { name: 'Right (X+)',  yaw: 90,  pitch: 0 },
        { name: 'Left (X-)',   yaw: -90, pitch: 0 },
        { name: 'Top (Y+)',    yaw: 0,   pitch: -89 },
    ];

    const cameras = {};
    function getCam(gi) {
        if (!cameras[gi]) cameras[gi] = { camYaw: 30, camPitch: -20, zoom: 1.0, presetIdx: 0 };
        return cameras[gi];
    }

    let activeCanvasGi = 0; // フォーカスされているキャンバス

    function initCanvasControls(gi) {
        const canvas = document.getElementById('canvas-g' + gi);
        if (!canvas) return;
        let dragging = false, lastX = 0, lastY = 0;

        canvas.addEventListener('mousedown', (e) => {
            dragging = true; lastX = e.clientX; lastY = e.clientY;
            canvas.style.cursor = 'grabbing';
            canvas.focus();
            activeCanvasGi = gi;
        });
        window.addEventListener('mouseup', () => { dragging = false; });
        window.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const cam = getCam(gi);
            cam.camYaw += (e.clientX - lastX) * 0.5;
            cam.camPitch += (e.clientY - lastY) * 0.5;
            cam.camPitch = Math.max(-89, Math.min(89, cam.camPitch));
            lastX = e.clientX; lastY = e.clientY;
            cam.presetIdx = -1; // カスタム角度
            drawPreview(gi);
        });
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const cam = getCam(gi);
            cam.zoom *= e.deltaY > 0 ? 0.9 : 1.1;
            cam.zoom = Math.max(0.1, Math.min(8.0, cam.zoom));
            drawPreview(gi);
        }, { passive: false });

        // Spaceキー: プリセット切替
        canvas.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                const cam = getCam(gi);
                cam.presetIdx = ((cam.presetIdx || 0) + 1) % CAM_PRESETS.length;
                const preset = CAM_PRESETS[cam.presetIdx];
                cam.camYaw = preset.yaw;
                cam.camPitch = preset.pitch;
                const modeEl = document.getElementById('cam-mode-g' + gi);
                if (modeEl) modeEl.textContent = preset.name;
                drawPreview(gi);
            }
        });

        canvas.addEventListener('focus', () => { activeCanvasGi = gi; });
        canvas.style.cursor = 'grab';
    }

    function rotX(v, a) { const c=Math.cos(a),s=Math.sin(a); return [v[0], v[1]*c-v[2]*s, v[1]*s+v[2]*c]; }
    function rotY(v, a) { const c=Math.cos(a),s=Math.sin(a); return [v[0]*c+v[2]*s, v[1], -v[0]*s+v[2]*c]; }
    function rotZ(v, a) { const c=Math.cos(a),s=Math.sin(a); return [v[0]*c-v[1]*s, v[0]*s+v[1]*c, v[2]]; }

    function project(v, w, h, scale) {
        const d = 3.0;
        const f = d / (d - v[2]);
        return [w/2 + v[0]*scale*f, h/2 - v[1]*scale*f];
    }

    // モデル全体の重心を計算してオフセットとして使用
    function calcModelCenter(elements) {
        let cx=0, cy=0, cz=0;
        for (const el of elements) {
            cx += (el.from[0] + el.to[0]) / 2;
            cy += (el.from[1] + el.to[1]) / 2;
            cz += (el.from[2] + el.to[2]) / 2;
        }
        const n = elements.length;
        return [cx/n, cy/n, cz/n];
    }

    // 直方体の8頂点を from/to から生成、モデル重心を原点にセンタリング、modelScaleで正規化
    function boxVerts(from, to, center, modelScale) {
        const s = modelScale || 16;
        const [x0,y0,z0] = from.map((v,i) => (v - center[i]) / s);
        const [x1,y1,z1] = to.map((v,i) => (v - center[i]) / s);
        return [
            [x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],
            [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],
        ];
    }
    const BOX_EDGES = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    const BOX_FACES = [
        [0,1,2,3], // front
        [5,4,7,6], // back
        [4,0,3,7], // left
        [1,5,6,2], // right
        [3,2,6,7], // top
        [4,5,1,0], // bottom
    ];

    // 面の法線ベクトル（簡易: 外積で計算）
    function faceNormal(v0, v1, v2) {
        const a = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
        const b = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
        return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
    }

    function getGroupRotation(gi) {
        let yaw=0, pitch=0, roll=0, sx=1, sy=1, sz=1;
        document.querySelectorAll('input[type="range"][data-id^="g'+gi+'p"]').forEach(s => {
            const n = s.closest('.param-row').querySelector('.param-name').textContent.trim().toUpperCase();
            const v = parseFloat(s.value);
            if (n.includes('YAW')) yaw=v;
            else if (n.includes('PITCH')) pitch=v;
            else if (n.includes('ROLL')) roll=v;
            else if (n.includes('SCALE_X')) sx=v;
            else if (n.includes('SCALE_Y')) sy=v;
            else if (n.includes('SCALE_Z')) sz=v;
            else if (n.includes('SCALE')) { sx=v; sy=v; sz=v; }
        });
        return {yaw, pitch, roll, sx, sy, sz, scale: Math.max(sx,sy,sz)};
    }

    // 色パレット（element ごとに色を分ける）
    const COLORS = [
        {stroke:'#aaccee', fill:'rgba(100,160,220,0.25)'},
        {stroke:'#eecc88', fill:'rgba(220,180,80,0.20)'},
        {stroke:'#88eebb', fill:'rgba(80,220,160,0.20)'},
        {stroke:'#ee88aa', fill:'rgba(220,80,140,0.20)'},
        {stroke:'#ccaaee', fill:'rgba(180,140,220,0.20)'},
        {stroke:'#eeee88', fill:'rgba(220,220,80,0.20)'},
    ];

    function drawPreview(gi) {
        const canvas = document.getElementById('canvas-g'+gi);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0,0,w,h);

        const rot = getGroupRotation(gi);
        const cam = getCam(gi);
        const viewScale = 200 * cam.zoom;
        const model = models[gi];
        if (!model || !model.elements) return;

        function transform(v) {
            // XYZ個別スケール適用
            let p = [v[0]*rot.sx, v[1]*rot.sy, v[2]*rot.sz];
            p = rotY(p, rot.yaw * DEG);
            p = rotX(p, rot.pitch * DEG);
            p = rotZ(p, rot.roll * DEG);
            p = rotX(p, cam.camPitch * DEG);
            p = rotY(p, cam.camYaw * DEG);
            return p;
        }
        // カメラ回転のみ（パラメータ回転なし）
        function transformWorld(v) {
            let p = [...v];
            p = rotX(p, cam.camPitch * DEG);
            p = rotY(p, cam.camYaw * DEG);
            return p;
        }

        // グリッド（地面）
        ctx.strokeStyle = '#1e1e3a'; ctx.lineWidth = 0.5;
        for (let i = -5; i <= 5; i++) {
            const a = project(transformWorld([i*0.1, 0, -0.5]), w,h,viewScale);
            const b = project(transformWorld([i*0.1, 0,  0.5]), w,h,viewScale);
            ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke();
            const c = project(transformWorld([-0.5, 0, i*0.1]), w,h,viewScale);
            const d = project(transformWorld([ 0.5, 0, i*0.1]), w,h,viewScale);
            ctx.beginPath(); ctx.moveTo(c[0],c[1]); ctx.lineTo(d[0],d[1]); ctx.stroke();
        }

        // 軸線 + ラベル
        const axes = [
            {to:[0.35,0,0], c:'#ff4444', label:'X'},
            {to:[0,0.35,0], c:'#44ff44', label:'Y'},
            {to:[0,0,0.35], c:'#4488ff', label:'Z'},
        ];
        const origin = project(transformWorld([0,0,0]),w,h,viewScale);
        for (const ax of axes) {
            const b = project(transformWorld(ax.to),w,h,viewScale);
            ctx.strokeStyle=ax.c; ctx.lineWidth=2;
            ctx.beginPath(); ctx.moveTo(origin[0],origin[1]); ctx.lineTo(b[0],b[1]); ctx.stroke();
            ctx.fillStyle=ax.c; ctx.font='bold 11px monospace';
            ctx.fillText(ax.label, b[0]+3, b[1]-3);
        }

        // 正面方向の矢印 (Z+ = Front)
        const frontStart = project(transformWorld([0, 0, 0.4]), w,h,viewScale);
        const frontEnd = project(transformWorld([0, 0, 0.55]), w,h,viewScale);
        ctx.strokeStyle='#ffaa00'; ctx.lineWidth=2.5;
        ctx.beginPath(); ctx.moveTo(frontStart[0],frontStart[1]); ctx.lineTo(frontEnd[0],frontEnd[1]); ctx.stroke();
        // 矢じり
        const dx = frontEnd[0]-frontStart[0], dy = frontEnd[1]-frontStart[1];
        const len = Math.sqrt(dx*dx+dy*dy);
        if (len > 2) {
            const ux = dx/len, uy = dy/len;
            ctx.beginPath();
            ctx.moveTo(frontEnd[0], frontEnd[1]);
            ctx.lineTo(frontEnd[0]-ux*6+uy*4, frontEnd[1]-uy*6-ux*4);
            ctx.lineTo(frontEnd[0]-ux*6-uy*4, frontEnd[1]-uy*6+ux*4);
            ctx.closePath();
            ctx.fillStyle='#ffaa00'; ctx.fill();
        }
        ctx.fillStyle='#ffaa00'; ctx.font='bold 11px sans-serif';
        ctx.fillText('FRONT', frontEnd[0]+5, frontEnd[1]+4);

        // 方向ラベル (回転適用後)
        const dirLabels = [
            {pos:[0,0,0.5],  label:'F', color:'#ffaa00'},
            {pos:[0,0,-0.5], label:'B', color:'#666'},
            {pos:[0.5,0,0],  label:'R', color:'#ff6666'},
            {pos:[-0.5,0,0], label:'L', color:'#6666ff'},
        ];
        ctx.font = '10px sans-serif';
        for (const dl of dirLabels) {
            const p = project(transformWorld(dl.pos), w,h,viewScale);
            ctx.fillStyle = dl.color;
            ctx.fillText(dl.label, p[0]-4, p[1]+4);
        }

        // モデル全体の重心とバウンディングボックスを計算
        const modelCenter = calcModelCenter(model.elements);
        // モデルの最大範囲を計算して正規化スケールに使う
        let maxExtent = 1;
        for (const el of model.elements) {
            for (let i = 0; i < 3; i++) {
                maxExtent = Math.max(maxExtent,
                    Math.abs(el.from[i] - modelCenter[i]),
                    Math.abs(el.to[i] - modelCenter[i]));
            }
        }
        // モデルが画面に収まるスケール（最大範囲を0.5に正規化）
        const modelScale = maxExtent * 2;

        // 全element を描画
        for (let ei = 0; ei < model.elements.length; ei++) {
            const el = model.elements[ei];
            const verts = boxVerts(el.from, el.to, modelCenter, modelScale);
            const transformed = verts.map(v => transform(v));
            const projected = transformed.map(v => project(v,w,h,viewScale));
            const col = COLORS[ei % COLORS.length];

            // 面を描画（背面カリング付き）
            for (const face of BOX_FACES) {
                const n = faceNormal(transformed[face[0]], transformed[face[1]], transformed[face[2]]);
                if (n[2] <= 0) continue; // 背面は描画しない
                ctx.fillStyle = col.fill;
                ctx.beginPath();
                ctx.moveTo(projected[face[0]][0], projected[face[0]][1]);
                for (let fi = 1; fi < face.length; fi++) {
                    ctx.lineTo(projected[face[fi]][0], projected[face[fi]][1]);
                }
                ctx.closePath();
                ctx.fill();
            }

            // エッジ描画
            ctx.strokeStyle = col.stroke; ctx.lineWidth = 1.2;
            for (const [i,j] of BOX_EDGES) {
                ctx.beginPath();
                ctx.moveTo(projected[i][0], projected[i][1]);
                ctx.lineTo(projected[j][0], projected[j][1]);
                ctx.stroke();
            }
        }

        // === エンティティ（人型）描画 ===
        const es = getEntityState(gi);
        if (es.show) {
            const ENTITY_SCALE = modelScale * 2; // エンティティはモデルより大きめ
            const entityBones = ${JSON.stringify(null)}; // placeholder - use inline
            const bones = [
                { from: [-4,24,-4], to: [4,32,4], c: 'rgba(170,170,190,0.15)', s: '#667' },    // head
                { from: [-4,12,-2], to: [4,24,2], c: 'rgba(140,140,160,0.12)', s: '#556' },    // body
                { from: [-8,12,-2], to: [-4,24,2], c: 'rgba(150,150,170,0.12)', s: '#667' },   // arm_r
                { from: [4,12,-2],  to: [8,24,2], c: 'rgba(130,130,150,0.12)', s: '#556' },    // arm_l
                { from: [-4,0,-2],  to: [0,12,2], c: 'rgba(140,140,160,0.12)', s: '#556' },    // leg_r
                { from: [0,0,-2],   to: [4,12,2], c: 'rgba(130,130,150,0.12)', s: '#556' },    // leg_l
            ];
            const entityCenter = [0, 16, 0];
            for (const bone of bones) {
                const bverts = boxVerts(bone.from, bone.to, entityCenter, 32);
                // エンティティはワールド座標で描画（パラメータ回転なし）
                const bt = bverts.map(v => transformWorld(v));
                const bp = bt.map(v => project(v, w, h, viewScale));
                // 面
                for (const face of BOX_FACES) {
                    const n = faceNormal(bt[face[0]], bt[face[1]], bt[face[2]]);
                    if (n[2] <= 0) continue;
                    ctx.fillStyle = bone.c;
                    ctx.beginPath();
                    ctx.moveTo(bp[face[0]][0], bp[face[0]][1]);
                    for (let fi=1; fi<face.length; fi++) ctx.lineTo(bp[face[fi]][0], bp[face[fi]][1]);
                    ctx.closePath(); ctx.fill();
                }
                // エッジ
                ctx.strokeStyle = bone.s; ctx.lineWidth = 0.8;
                for (const [i,j] of BOX_EDGES) {
                    ctx.beginPath(); ctx.moveTo(bp[i][0],bp[i][1]); ctx.lineTo(bp[j][0],bp[j][1]); ctx.stroke();
                }
            }

            // 右手に持つアイテム（デフォルト: 鉄の剣）
            const heldModel = es.heldItem || ${JSON.stringify(IRON_SWORD_MODEL)};
            if (heldModel && heldModel.elements) {
                const heldCenter = calcModelCenter(heldModel.elements);
                let heldMax = 1;
                for (const el of heldModel.elements) {
                    for (let i=0; i<3; i++) {
                        heldMax = Math.max(heldMax, Math.abs(el.from[i]-heldCenter[i]), Math.abs(el.to[i]-heldCenter[i]));
                    }
                }
                const heldScale = heldMax * 4;
                const handOffset = [-6, 20, 0]; // 右手の位置

                for (let ei=0; ei < heldModel.elements.length; ei++) {
                    const el = heldModel.elements[ei];
                    const hv = boxVerts(el.from, el.to, heldCenter, heldScale);
                    // アイテムの回転パラメータを適用して手の位置に配置
                    const ht = hv.map(v => {
                        let p = [v[0]*rot.sx, v[1]*rot.sy, v[2]*rot.sz];
                        p = rotY(p, rot.yaw * DEG);
                        p = rotX(p, rot.pitch * DEG);
                        p = rotZ(p, rot.roll * DEG);
                        // 手の位置にオフセット（ワールド座標）
                        p[0] += handOffset[0]/32;
                        p[1] += handOffset[1]/32;
                        p[2] += handOffset[2]/32;
                        return transformWorld(p);
                    });
                    const hp = ht.map(v => project(v, w, h, viewScale));
                    const col = COLORS[ei % COLORS.length];
                    for (const face of BOX_FACES) {
                        const n = faceNormal(ht[face[0]], ht[face[1]], ht[face[2]]);
                        if (n[2] <= 0) continue;
                        ctx.fillStyle = col.fill;
                        ctx.beginPath();
                        ctx.moveTo(hp[face[0]][0], hp[face[0]][1]);
                        for (let fi=1; fi<face.length; fi++) ctx.lineTo(hp[face[fi]][0], hp[face[fi]][1]);
                        ctx.closePath(); ctx.fill();
                    }
                    ctx.strokeStyle = col.stroke; ctx.lineWidth = 1;
                    for (const [i,j] of BOX_EDGES) {
                        ctx.beginPath(); ctx.moveTo(hp[i][0],hp[i][1]); ctx.lineTo(hp[j][0],hp[j][1]); ctx.stroke();
                    }
                }
            }
        }

        // 情報表示
        ctx.fillStyle = '#888'; ctx.font = '11px monospace';
        ctx.fillText('YAW:'+rot.yaw.toFixed(0)+' PITCH:'+rot.pitch.toFixed(0)+' ROLL:'+rot.roll.toFixed(0), 6, h-18);
        ctx.fillText('S: '+rot.sx.toFixed(2)+' / '+rot.sy.toFixed(2)+' / '+rot.sz.toFixed(2)+' ZOOM:'+cam.zoom.toFixed(1)+'x', 6, h-6);
        // カメラプリセット名
        const presetName = cam.presetIdx >= 0 ? CAM_PRESETS[cam.presetIdx].name : 'Custom';
        ctx.fillStyle = '#ffaa00'; ctx.font = '10px sans-serif';
        ctx.fillText(presetName, w-ctx.measureText(presetName).width-6, h-6);
    }

    // 初期描画 + マウス操作の設定
    for (let i = 0; i < models.length; i++) {
        initCanvasControls(i);
        drawPreview(i);
    }
</script>
</body>
</html>`;
}

function buildCommand(template, params) {
    let cmd = template;
    for (const p of params) cmd = cmd.replace(`{${p.name}}`, p.value);
    return cmd;
}

function guessRange(name, currentValue) {
    const upper = name.toUpperCase();
    if (upper.includes('SCALE')) return { min: 0.1, max: 5.0, step: 0.05 };
    // 位置パラメータ（_X, _Y, _Z で末尾が座標系、かつ YAW/PITCH/ROLL でない）
    if ((upper.endsWith('_X') || upper.endsWith('_Y') || upper.endsWith('_Z'))
        && !upper.includes('SCALE') && !upper.includes('YAW') && !upper.includes('PITCH') && !upper.includes('ROLL')) {
        return { min: -3.0, max: 3.0, step: 0.05 };
    }
    return { min: -360, max: 360, step: 1 };
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { handleRotationEditor };
