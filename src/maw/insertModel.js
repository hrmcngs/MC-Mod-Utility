const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { readMawProject, findProjectRoot } = require('./mawProject');
const { loadCatalog, createMawReader } = require('./mawCatalog');
const { buildModelChanges, buildSayaChanges } = require('./modelTemplates');
const { writeChanges } = require('./applyWeapon');

// =====================================================================
// 「MAW: 3Dモデルテンプレートを挿入」コマンド。
//
// 武器スタジオを使わずに、モデルだけを呼び出したい時に使う:
//   ・本体の 3D 武器の形を自分のアドオンに複製して Blockbench で改造する
//   ・本体の 3Dベースを継承して、テクスチャだけ自分のものにする
//   ・本体の武器の見た目をそのまま借りる (parent 1 行)
//   ・鞘 (saya) のモデルを作る
//
// どれも「どのファイルをどこに置き、どの parent を書けばいいか」を
// 覚えていないと書けないので、選ぶだけで正しい場所に生成する。
// =====================================================================

async function handleInsertModel(context, uri, onDone) {
    const root = findProjectRoot(uri);
    const project = root ? readMawProject(root) : null;

    if (!project) {
        vscode.window.showErrorMessage('MAW アドオンプロジェクトが見つかりません。');
        return;
    }

    const catalog = loadCatalog(root);
    const reader = createMawReader(root);
    const bases = catalog.models.weaponBases || [];
    const itemModels = catalog.models.itemModels || [];

    if (bases.length === 0 && itemModels.length === 0) {
        const pick = await vscode.window.showErrorMessage(
            '本体MOD が見つからないため、3Dモデルのテンプレートを読み込めません。' +
            'scripts/fetch-maw-jar.sh で本体MOD の jar を取り込むか、~/The-four-primitives-and-Weapons にソースを置いてください。',
            '読み込み元を確認'
        );
        if (pick) await vscode.commands.executeCommand('mc-mod-utility.mawShowSource');
        return;
    }

    // --- 1. どの種類のテンプレートか ---
    const kind = await vscode.window.showQuickPick(
        [
            {
                label: '$(symbol-namespace) 武器の 3D モデルをコピーして改造する',
                detail: '本体の形 (elements) ごとアドオンに複製。Blockbench で開いて自由に作り替えられる',
                value: 'copy',
            },
            {
                label: '$(symbol-color) 武器の 3D モデルを継承し、テクスチャだけ差し替える',
                detail: '形は本体のまま。本体のテクスチャをコピーしてくるので塗り替えれば完成',
                value: 'base3d',
            },
            {
                label: '$(link) 本体の武器の見た目をそのまま使う',
                detail: 'parent を 1 行書くだけ。テクスチャも本体のものを借りる',
                value: 'inherit',
            },
            {
                label: '$(package) 鞘 (saya) のモデルを作る',
                detail: '納刀したときの見た目。本体の鞘を継承 or 複製する',
                value: 'saya',
            },
        ],
        { title: '3Dモデルテンプレート: 種類を選ぶ', ignoreFocusOut: true }
    );
    if (!kind) return;

    if (kind.value === 'saya') {
        await insertSayaModel(project, catalog, reader, onDone);
        return;
    }

    // --- 2. 元にするモデル ---
    let source;
    if (kind.value === 'inherit') {
        const pick = await vscode.window.showQuickPick(
            itemModels.map(m => ({
                label: `${m.weapon ? '$(tools)' : '$(circle-outline)'} ${m.id}`,
                description: m.weapon ? m.weaponType : 'その他',
                detail: m.parent,
                value: m.id,
            })),
            { title: '見た目を借りる武器を選ぶ', matchOnDetail: true, ignoreFocusOut: true }
        );
        if (!pick) return;
        source = pick.value;
    } else {
        const pick = await vscode.window.showQuickPick(
            bases.map(b => ({
                label: `$(symbol-namespace) ${b.type} / ${b.name}`,
                description: `パーツ ${b.elements} 個`,
                detail: b.slots.map(s => `#${s.key} ${s.label}`).join(' / ') || 'テクスチャスロットなし',
                value: b.id,
            })),
            { title: '元にする 3D ベースを選ぶ', matchOnDetail: true, ignoreFocusOut: true }
        );
        if (!pick) return;
        source = pick.value;
    }

    // --- 3. 出力するアイテムID ---
    const itemId = await vscode.window.showInputBox({
        title: 'モデルを作るアイテムの ID',
        prompt: '既に武器スタジオで作ったアイテムの ID を指定すると、そのモデルを差し替えます',
        value: project.weapons.length > 0 ? project.weapons[project.weapons.length - 1].id : 'my_weapon',
        ignoreFocusOut: true,
        validateInput: (v) => /^[a-z][a-z0-9_]*$/.test(v) ? null : '小文字・数字・アンダースコアのみ',
    });
    if (!itemId) return;

    // --- 4. 生成 ---
    const spec = {
        itemId,
        weaponType: 'sword',
        newType: { baseShape: 'sword' },
        model: { mode: kind.value, source },
        texture: { generate: true, bladeColor: '#d9dde8', handleColor: '#6b4a2b' },
    };

    const { changes, warnings } = buildModelChanges(project, spec, catalog, reader);
    const overwrites = changes.filter(c => fs.existsSync(c.file)).map(c => path.relative(root, c.file));

    if (overwrites.length > 0) {
        const ok = await vscode.window.showWarningMessage(
            `次のファイルを上書きします:\n\n${overwrites.join('\n')}`,
            { modal: true },
            '上書きする'
        );
        if (ok !== '上書きする') return;
    }

    const written = writeChanges(changes);
    if (onDone) onDone();

    for (const w of warnings) vscode.window.showWarningMessage(w);

    // モデル JSON をエディタで開く
    const open = written.find(f => f.endsWith('.json'));
    if (open) {
        const doc = await vscode.workspace.openTextDocument(open);
        await vscode.window.showTextDocument(doc);
    }

    vscode.window.showInformationMessage(
        `3Dモデルを ${itemId} に適用しました (${written.length} ファイル)。` +
        (kind.value === 'copy' ? ' コピーした models/custom/weapon/ の JSON を Blockbench で開けば形を編集できます。' : '')
    );
}

/** 鞘モデルを作る */
async function insertSayaModel(project, catalog, reader, onDone) {
    const type = await vscode.window.showQuickPick(
        catalog.sayaTypes.map(s => ({ label: s.label, description: s.id, value: s })),
        { title: '鞘の種類を選ぶ', ignoreFocusOut: true }
    );
    if (!type) return;

    const model = await vscode.window.showQuickPick(
        type.value.models.map(m => ({ label: m, value: m })),
        { title: '元にする鞘モデルを選ぶ', ignoreFocusOut: true }
    );
    if (!model) return;

    const mode = await vscode.window.showQuickPick(
        [
            {
                label: '$(link) 形は継承し、テクスチャは複製する（おすすめ）',
                detail: '鞘・刃・鍔・柄・柄頭 の PNG をアドオンにコピーする。塗り替えれば自分の鞘になる',
                value: false,
            },
            {
                label: '$(symbol-namespace) 形ごと複製する',
                detail: 'elements ごとコピー。Blockbench で形から作り替えられる',
                value: true,
            },
        ],
        { title: 'どう作るか', ignoreFocusOut: true }
    );
    if (!mode) return;

    const itemId = await vscode.window.showInputBox({
        title: '納刀するアイテムの ID',
        value: project.weapons.length > 0 ? project.weapons[project.weapons.length - 1].id : 'my_weapon',
        ignoreFocusOut: true,
        validateInput: (v) => /^[a-z][a-z0-9_]*$/.test(v) ? null : '小文字・数字・アンダースコアのみ',
    });
    if (!itemId) return;

    const sayaType = type.value.id;
    const { changes, warnings } = buildSayaChanges(
        project,
        { itemId, saya: { type: sayaType, parent: model.value, copyGeometry: mode.value } },
        reader
    );

    const written = writeChanges(changes);
    for (const w of warnings) vscode.window.showWarningMessage(w);

    const modelRef = `${project.namespace}:custom/saya/${sayaType}/saya_${itemId}`;
    if (onDone) onDone();

    const doc = await vscode.workspace.openTextDocument(written.find(f => f.endsWith('.json')));
    await vscode.window.showTextDocument(doc);

    vscode.window.showInformationMessage(
        `鞘モデルを作りました。data/${project.namespace}/maw_saya/ に ` +
        `"${project.namespace}:${itemId}": "${modelRef}" を登録すると納刀できます。`,
        'maw_saya を開く'
    ).then(pick => {
        if (pick && fs.existsSync(project.paths.saya)) {
            vscode.window.showTextDocument(vscode.Uri.file(project.paths.saya));
        }
    });
}

module.exports = { handleInsertModel };
