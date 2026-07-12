const vscode = require('vscode');
const path = require('path');
const { readMawProject, findProjectRoot } = require('./mawProject');
const { loadCatalog } = require('./mawCatalog');
const { computeChanges, writeChanges } = require('./applyWeapon');
const { SHAPES } = require('./textureGen');
const { PARTICLES, SOUNDS, EFFECTS, BUFFS, RARITIES } = require('./codegen');

// =====================================================================
// MAW 武器スタジオ
//
// 「ブロックを組み立てるように武器を作る」ための Webview。
// フォームを触るたびに、生成される Java / JSON のプレビューが右側に出る。
// [武器を作る] を押すと 6〜8 個のファイルが一気に生成 + 既存ファイルへ追記される。
// =====================================================================

/**
 * @param {vscode.ExtensionContext} context
 * @param {vscode.Uri} [uri]
 * @param {() => void} [onCreated] 生成後に呼ぶコールバック (ツリー更新用)
 */
async function handleWeaponStudio(context, uri, onCreated) {
    const root = findProjectRoot(uri);
    const project = root ? readMawProject(root) : null;

    if (!project) {
        const pick = await vscode.window.showErrorMessage(
            'MAW アドオンプロジェクトが見つかりません。先にアドオンを作成してください。',
            'MAW アドオンを新規作成'
        );
        if (pick) await vscode.commands.executeCommand('mc-mod-utility.newMawAddon');
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        'mcModUtility.mawWeaponStudio',
        '⚔ MAW 武器スタジオ',
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.webview.html = renderHtml();

    panel.webview.onDidReceiveMessage(async (msg) => {
        // 毎回読み直す (ユーザーが手でファイルを編集しているかもしれない)
        const current = readMawProject(root);

        if (msg.type === 'ready') {
            const catalog = loadCatalog(root);
            panel.webview.postMessage({
                type: 'init',
                data: {
                    project: {
                        modId: current.modId,
                        namespace: current.namespace,
                        basePackage: current.basePackage,
                        registryClass: current.registry ? current.registry.className : null,
                        existingItems: current.weapons.map(w => w.id),
                    },
                    source: catalog.source.label,
                    types: catalog.types,
                    motions: catalog.motions,
                    motionLabels: catalog.motionLabels,
                    slotLabels: catalog.slotLabels,
                    sayaTypes: catalog.sayaTypes,
                    typeToSaya: catalog.typeToSaya,
                    shapes: SHAPES,
                    options: { particles: PARTICLES, sounds: SOUNDS, effects: EFFECTS, buffs: BUFFS, rarities: RARITIES },
                },
            });
            return;
        }

        if (msg.type === 'preview') {
            panel.webview.postMessage({ type: 'preview', ...buildPreview(current, msg.spec) });
            return;
        }

        if (msg.type === 'create') {
            const { changes, errors } = computeChanges(current, msg.spec);
            if (errors.length > 0) {
                panel.webview.postMessage({ type: 'preview', files: [], errors });
                vscode.window.showErrorMessage(`武器を作れませんでした: ${errors[0]}`);
                return;
            }

            const written = writeChanges(changes);
            panel.webview.postMessage({ type: 'created', count: written.length });
            if (onCreated) onCreated();

            const javaFile = written.find(f => f.endsWith('.java'));
            if (javaFile) {
                const doc = await vscode.workspace.openTextDocument(javaFile);
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            }

            vscode.window.showInformationMessage(
                `⚔ ${msg.spec.displayNameJa} を作成しました (${written.length} ファイル)。` +
                ` ゲーム内で /give @p ${current.namespace}:${msg.spec.itemId}`
            );
            return;
        }
    }, undefined, context.subscriptions);
}

/** プレビュー用に、変更されるファイル一覧を組み立てる */
function buildPreview(project, spec) {
    const { changes, errors } = computeChanges(project, spec);

    const files = changes.map(c => ({
        rel: path.relative(project.root, c.file),
        action: c.action,
        title: c.title,
        body: c.action === 'append' ? c.snippet : c.content,
        lang: c.file.endsWith('.java') ? 'java' : c.file.endsWith('.png') ? 'text' : 'json',
    }));

    return { files, errors };
}

// ---------------------------------------------------------------------
// Webview
// ---------------------------------------------------------------------

function renderHtml() {
    return /* html */ `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
    :root {
        --c-basic: #4c97ff;    /* 基本 */
        --c-stats: #ff8c1a;    /* ステータス */
        --c-look:  #9966ff;    /* 見た目 */
        --c-fx:    #4cbf56;    /* 効果 */
        --c-saya:  #ff6680;    /* 鞘 */
    }
    body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        padding: 0;
        margin: 0;
        font-size: 13px;
    }
    .wrap { display: flex; gap: 0; height: 100vh; }
    .left { flex: 1 1 58%; overflow-y: auto; padding: 16px 18px 60px; }
    .right {
        flex: 1 1 42%;
        overflow-y: auto;
        padding: 16px 18px 60px;
        border-left: 1px solid var(--vscode-panel-border);
        background: var(--vscode-editorWidget-background);
    }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .sub { opacity: .75; font-size: 12px; margin-bottom: 14px; }
    .badge {
        display: inline-block; padding: 2px 8px; border-radius: 10px;
        background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
        font-size: 11px; margin-right: 6px;
    }

    /* Scratch 風のブロック */
    .cat { margin-bottom: 14px; border-radius: 10px; overflow: hidden; border: 1px solid var(--vscode-panel-border); }
    .cat > header {
        padding: 8px 12px; font-weight: 600; color: #fff; font-size: 13px;
        display: flex; align-items: center; gap: 8px;
    }
    .cat.basic > header { background: var(--c-basic); }
    .cat.stats > header { background: var(--c-stats); }
    .cat.look  > header { background: var(--c-look); }
    .cat.fx    > header { background: var(--c-fx); }
    .cat.saya  > header { background: var(--c-saya); }
    .cat > .body { padding: 12px; background: var(--vscode-editor-background); }

    .row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
    .row > label.name { flex: 0 0 120px; opacity: .9; }
    .row .hint { flex-basis: 100%; font-size: 11px; opacity: .6; margin-left: 130px; }

    input[type="text"], select, input[type="number"] {
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border, transparent);
        border-radius: 4px; padding: 4px 6px; font-size: 13px;
    }
    input[type="text"] { min-width: 160px; }
    input[type="range"] { flex: 1; min-width: 120px; }
    input[type="color"] { width: 44px; height: 26px; padding: 0; border: none; background: none; }
    .val { min-width: 62px; text-align: right; font-variant-numeric: tabular-nums; opacity: .9; }

    /* 効果ブロック */
    .block {
        border-radius: 8px; padding: 8px 10px; margin-bottom: 8px;
        background: var(--vscode-editorWidget-background);
        border-left: 5px solid var(--c-fx);
    }
    .block.off { opacity: .5; }
    .block > .head { display: flex; align-items: center; gap: 8px; cursor: pointer; }
    .block > .head b { font-weight: 600; }
    .block > .head .desc { font-size: 11px; opacity: .7; }
    .block > .params { margin: 8px 0 2px 24px; display: none; }
    .block.on > .params { display: block; }
    .block .params .row { margin-bottom: 6px; }
    .block .params .row > label.name { flex: 0 0 96px; font-size: 12px; }

    .chk { display: flex; align-items: center; gap: 6px; }

    button.primary {
        background: var(--vscode-button-background); color: var(--vscode-button-foreground);
        border: none; border-radius: 4px; padding: 8px 18px; font-size: 14px; cursor: pointer;
        font-weight: 600;
    }
    button.primary:hover { background: var(--vscode-button-hoverBackground); }
    button.primary:disabled { opacity: .5; cursor: not-allowed; }

    .files { margin-top: 6px; }
    .file { margin-bottom: 10px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; overflow: hidden; }
    .file > .fhead {
        display: flex; align-items: center; gap: 8px; padding: 6px 10px; cursor: pointer;
        background: var(--vscode-editor-background);
    }
    .file .tag { font-size: 10px; padding: 1px 6px; border-radius: 8px; color: #fff; }
    .tag.create { background: #3fa34d; }
    .tag.append { background: #4c97ff; }
    .tag.binary { background: #9966ff; }
    .file .path { font-family: var(--vscode-editor-font-family); font-size: 11px; opacity: .85; }
    .file .ftitle { font-size: 11px; opacity: .6; margin-left: auto; }
    .file > pre {
        margin: 0; padding: 10px; max-height: 300px; overflow: auto;
        background: var(--vscode-textCodeBlock-background);
        font-family: var(--vscode-editor-font-family); font-size: 11px; line-height: 1.5;
        display: none; white-space: pre;
    }
    .file.open > pre { display: block; }
    .err {
        background: var(--vscode-inputValidation-errorBackground);
        border: 1px solid var(--vscode-inputValidation-errorBorder);
        padding: 8px 10px; border-radius: 4px; margin-bottom: 10px; font-size: 12px;
    }
    .actionbar {
        position: sticky; bottom: 0; padding: 12px 0 6px;
        background: var(--vscode-editor-background);
        border-top: 1px solid var(--vscode-panel-border);
        display: flex; align-items: center; gap: 12px;
    }
    canvas { image-rendering: pixelated; border: 1px solid var(--vscode-panel-border); border-radius: 4px; background: #2a2a2e; }
    .newtype { display: none; }
    .newtype.show { display: block; }
    .motions { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 4px; margin: 4px 0 10px 0; }
    .motions label { display: flex; gap: 5px; align-items: center; font-size: 12px; }
</style>
</head>
<body>
<div class="wrap">
    <div class="left">
        <h1>⚔ MAW 武器スタジオ</h1>
        <div class="sub">
            <span class="badge" id="modIdBadge">…</span>
            <span id="sourceLabel"></span>
        </div>

        <!-- 基本 -->
        <section class="cat basic">
            <header>🟦 きほん</header>
            <div class="body">
                <div class="row">
                    <label class="name">名前（日本語）</label>
                    <input type="text" id="nameJa" value="炎の剣" />
                </div>
                <div class="row">
                    <label class="name">名前（英語）</label>
                    <input type="text" id="nameEn" value="Flame Sword" />
                </div>
                <div class="row">
                    <label class="name">アイテム ID</label>
                    <input type="text" id="itemId" value="flame_sword" />
                    <span class="val" id="giveHint"></span>
                    <div class="hint">小文字・数字・アンダースコアのみ。ゲーム内の /give で使う名前。</div>
                </div>
                <div class="row">
                    <label class="name">武器タイプ</label>
                    <select id="weaponType"></select>
                    <div class="hint" id="typeHint">
                        タイプを選ぶと、そのタイプのスキル（K キーの画面）が使えるようになる。
                    </div>
                </div>

                <div class="newtype" id="newTypeBox">
                    <div class="row">
                        <label class="name">タイプ ID</label>
                        <input type="text" id="newTypeId" value="my_blade" />
                        <label class="name" style="flex:0 0 auto">表示名</label>
                        <input type="text" id="newTypeName" value="マイ刃" />
                    </div>
                    <div id="motionSlots"></div>
                </div>
            </div>
        </section>

        <!-- ステータス -->
        <section class="cat stats">
            <header>🟧 つよさ</header>
            <div class="body">
                <div class="row">
                    <label class="name">攻撃力</label>
                    <input type="range" id="damage" min="1" max="20" step="0.5" value="6" />
                    <span class="val" id="damageVal"></span>
                </div>
                <div class="row">
                    <label class="name">攻撃速度</label>
                    <input type="range" id="attackSpeed" min="-3.2" max="-0.4" step="0.1" value="-2.4" />
                    <span class="val" id="attackSpeedVal"></span>
                    <div class="hint">-2.4 が剣の標準、-1.2 が短剣。右にいくほど速く振れる。</div>
                </div>
                <div class="row">
                    <label class="name">耐久値</label>
                    <input type="range" id="durability" min="0" max="2500" step="10" value="0" />
                    <span class="val" id="durabilityVal"></span>
                    <div class="hint">0 にすると壊れない武器になる。</div>
                </div>
                <div class="row">
                    <label class="name">エンチャント性</label>
                    <input type="range" id="enchantability" min="0" max="30" step="1" value="10" />
                    <span class="val" id="enchantabilityVal"></span>
                </div>
                <div class="row">
                    <label class="name">レア度</label>
                    <select id="rarity"></select>
                </div>
                <div class="row">
                    <label class="chk">
                        <input type="checkbox" id="overrideStats" />
                        <span>weapon_stats JSON にも書き出す（リーチ調整・タイプ既定の上書き）</span>
                    </label>
                </div>
                <div class="row" id="rangeRow" style="display:none">
                    <label class="name">リーチ加算</label>
                    <input type="range" id="attackRange" min="-2" max="3" step="0.5" value="0" />
                    <span class="val" id="attackRangeVal"></span>
                </div>
            </div>
        </section>

        <!-- 見た目 -->
        <section class="cat look">
            <header>🟪 みため</header>
            <div class="body">
                <div class="row">
                    <label class="chk">
                        <input type="checkbox" id="genTexture" checked />
                        <span>テクスチャを自動生成する（16x16 PNG）</span>
                    </label>
                </div>
                <div class="row">
                    <label class="name">刃の色</label>
                    <input type="color" id="bladeColor" value="#d9dde8" />
                    <label class="name" style="flex:0 0 auto">柄の色</label>
                    <input type="color" id="handleColor" value="#6b4a2b" />
                    <canvas id="texPreview" width="16" height="16" style="width:64px;height:64px;margin-left:12px"></canvas>
                    <div class="hint">あとから自分の絵に描き替えて OK。まずは色だけ決めて動かしてみるのが早い。</div>
                </div>
            </div>
        </section>

        <!-- 効果ブロック -->
        <section class="cat fx">
            <header>🟩 こうげきブロック（組み合わせるとコードになる）</header>
            <div class="body">
                <div class="row">
                    <label class="name">命中パーティクル</label>
                    <select id="particle"></select>
                    <label class="name" style="flex:0 0 auto">音</label>
                    <select id="sound"></select>
                </div>
                <div class="row">
                    <label class="name">発動確率</label>
                    <input type="range" id="chance" min="5" max="100" step="5" value="100" />
                    <span class="val" id="chanceVal"></span>
                    <div class="hint">下のブロックが発動する確率。100% なら毎回発動。</div>
                </div>

                <div id="blocks"></div>
            </div>
        </section>

        <!-- 鞘 -->
        <section class="cat saya">
            <header>🟥 さや（納刀）</header>
            <div class="body">
                <div class="row">
                    <label class="chk">
                        <input type="checkbox" id="sayaEnabled" />
                        <span>この武器を鞘に納刀できるようにする</span>
                    </label>
                </div>
                <div class="row" id="sayaRow" style="display:none">
                    <label class="name">鞘の種類</label>
                    <select id="sayaType"></select>
                    <label class="name" style="flex:0 0 auto">見た目を継承</label>
                    <select id="sayaParent"></select>
                    <div class="hint">本体MOD の鞘モデルを継承する。独自の 3D モデルにしたい時は、生成された JSON を Blockbench で編集する。</div>
                </div>
            </div>
        </section>
    </div>

    <div class="right">
        <h1>生成されるファイル</h1>
        <div class="sub">ブロックを変えるとリアルタイムで更新される。クリックで中身を開く。</div>
        <div id="errors"></div>
        <div class="files" id="files"></div>
        <div class="actionbar">
            <button class="primary" id="createBtn">⚔ この武器を作る</button>
            <span class="sub" id="status" style="margin:0"></span>
        </div>
    </div>
</div>

<script>
const vscode = acquireVsCodeApi();
let DATA = null;

// --- 効果ブロックの定義 (Scratch のブロックに相当) ---
const BLOCKS = [
    { id: 'backstab', label: '背後から攻撃するとダメージ増加', desc: '相手が背を向けている時だけ発動',
      params: [{ key: 'multiplier', label: '倍率', type: 'range', min: 1.5, max: 4, step: 0.5, def: 2, unit: '倍' }] },
    { id: 'lifesteal', label: '与えたダメージぶん回復する', desc: '吸血。体力が減りにくくなる',
      params: [{ key: 'percent', label: '吸収率', type: 'range', min: 5, max: 100, step: 5, def: 25, unit: '%' }] },
    { id: 'ignite', label: '相手を燃やす', desc: '命中した敵に炎上を付与',
      params: [{ key: 'seconds', label: '時間', type: 'range', min: 1, max: 15, step: 1, def: 4, unit: '秒' }] },
    { id: 'effect', label: '状態異常を与える', desc: '毒・ウィザー・移動速度低下など',
      params: [
        { key: 'id', label: '種類', type: 'select', options: 'effects', def: 'POISON' },
        { key: 'seconds', label: '時間', type: 'range', min: 1, max: 30, step: 1, def: 5, unit: '秒' },
        { key: 'level', label: '強さ', type: 'range', min: 1, max: 5, step: 1, def: 1, unit: 'レベル' },
      ] },
    { id: 'lightning', label: '雷を落とす', desc: '相手の位置に落雷（強力）',
      params: [] },
    { id: 'sweep', label: 'まわりの敵も巻き込む', desc: '範囲攻撃',
      params: [
        { key: 'radius', label: '半径', type: 'range', min: 1, max: 8, step: 0.5, def: 3, unit: 'ブロック' },
        { key: 'damage', label: 'ダメージ', type: 'range', min: 1, max: 20, step: 1, def: 4, unit: '' },
      ] },
    { id: 'message', label: '画面にメッセージを出す', desc: 'ホットバー上に表示（§c で色指定できる）',
      params: [{ key: 'text', label: '文字', type: 'text', def: '§c一撃！' }] },
    { id: 'rightClick', label: '右クリックで自分を強化する', desc: 'MAW のスキルで右クリックが「なし」の時に動く',
      params: [
        { key: 'id', label: '効果', type: 'select', options: 'buffs', def: 'MOVEMENT_SPEED' },
        { key: 'seconds', label: '時間', type: 'range', min: 3, max: 60, step: 1, def: 10, unit: '秒' },
        { key: 'level', label: '強さ', type: 'range', min: 1, max: 5, step: 1, def: 1, unit: 'レベル' },
        { key: 'cooldown', label: 'クールダウン', type: 'range', min: 1, max: 120, step: 1, def: 15, unit: '秒' },
      ] },
];

const $ = (id) => document.getElementById(id);

window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'init') { DATA = msg.data; build(); }
    else if (msg.type === 'preview') { renderPreview(msg.files, msg.errors); }
    else if (msg.type === 'created') { $('status').textContent = msg.count + ' ファイルを生成しました'; }
});

function build() {
    $('modIdBadge').textContent = DATA.project.modId;
    $('sourceLabel').textContent = DATA.source;

    // 武器タイプ
    const wt = $('weaponType');
    for (const t of DATA.types) {
        const o = document.createElement('option');
        o.value = t.id;
        o.textContent = t.displayName + ' (' + t.id + ')';
        wt.appendChild(o);
    }
    const nw = document.createElement('option');
    nw.value = '__new__';
    nw.textContent = '＋ 新しい武器タイプを作る';
    wt.appendChild(nw);
    wt.value = DATA.types.some(t => t.id === 'sword') ? 'sword' : DATA.types[0].id;

    // モーション選択 (新規タイプ用)
    const slots = $('motionSlots');
    for (const slot of ['combat', 'dash', 'right_click', 'shift_right_click']) {
        const h = document.createElement('div');
        h.innerHTML = '<div class="row" style="margin-bottom:2px"><label class="name">' +
            (DATA.slotLabels[slot] || slot) + '</label></div>';
        const grid = document.createElement('div');
        grid.className = 'motions';
        for (const m of (DATA.motions[slot] || [])) {
            const lab = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.slot = slot;
            cb.value = m;
            cb.checked = ['thrust', 'horizontal_slash', 'dash_rush', 'dodge', 'guard'].includes(m);
            cb.addEventListener('change', preview);
            lab.appendChild(cb);
            lab.appendChild(document.createTextNode(DATA.motionLabels[m] || m));
            lab.title = m;
            grid.appendChild(lab);
        }
        h.appendChild(grid);
        slots.appendChild(h);
    }

    fillSelect($('rarity'), DATA.options.rarities, 'UNCOMMON');
    fillSelect($('particle'), [{ id: 'NONE', label: 'なし' }, ...DATA.options.particles], 'FLAME');
    fillSelect($('sound'), [{ id: 'NONE', label: 'なし' }, ...DATA.options.sounds], 'FIRECHARGE_USE');
    fillSelect($('sayaType'), DATA.sayaTypes.map(s => ({ id: s.id, label: s.label })), 'sword');
    updateSayaParents();

    // 効果ブロック
    const box = $('blocks');
    for (const b of BLOCKS) {
        const el = document.createElement('div');
        el.className = 'block';
        el.id = 'block-' + b.id;

        const head = document.createElement('div');
        head.className = 'head';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = 'en-' + b.id;
        head.appendChild(cb);
        const t = document.createElement('div');
        t.innerHTML = '<b>' + b.label + '</b><div class="desc">' + b.desc + '</div>';
        head.appendChild(t);
        el.appendChild(head);

        const params = document.createElement('div');
        params.className = 'params';
        for (const p of b.params) params.appendChild(renderParam(b, p));
        el.appendChild(params);

        cb.addEventListener('change', () => {
            el.classList.toggle('on', cb.checked);
            el.classList.toggle('off', !cb.checked);
            preview();
        });
        el.classList.add('off');
        box.appendChild(el);
    }

    // イベント配線
    for (const id of ['nameJa', 'nameEn', 'itemId', 'weaponType', 'newTypeId', 'newTypeName',
        'damage', 'attackSpeed', 'durability', 'enchantability', 'rarity', 'overrideStats',
        'attackRange', 'genTexture', 'bladeColor', 'handleColor', 'particle', 'sound', 'chance',
        'sayaEnabled', 'sayaType', 'sayaParent']) {
        const el = $(id);
        el.addEventListener('input', onChange);
        el.addEventListener('change', onChange);
    }
    $('nameJa').addEventListener('input', autoId);
    $('createBtn').addEventListener('click', () => vscode.postMessage({ type: 'create', spec: collect() }));

    onChange();
}

function renderParam(block, p) {
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('label');
    name.className = 'name';
    name.textContent = p.label;
    row.appendChild(name);

    const id = 'p-' + block.id + '-' + p.key;
    let input;
    if (p.type === 'range') {
        input = document.createElement('input');
        input.type = 'range';
        input.min = p.min; input.max = p.max; input.step = p.step; input.value = p.def;
        const val = document.createElement('span');
        val.className = 'val';
        val.id = id + '-val';
        input.addEventListener('input', () => { val.textContent = input.value + (p.unit || ''); preview(); });
        input.id = id;
        row.appendChild(input);
        row.appendChild(val);
        val.textContent = p.def + (p.unit || '');
        return row;
    }
    if (p.type === 'select') {
        input = document.createElement('select');
        input.id = id;
        for (const o of DATA.options[p.options]) {
            const opt = document.createElement('option');
            opt.value = o.id; opt.textContent = o.label;
            input.appendChild(opt);
        }
        input.value = p.def;
    } else {
        input = document.createElement('input');
        input.type = 'text';
        input.id = id;
        input.value = p.def;
    }
    input.addEventListener('input', preview);
    input.addEventListener('change', preview);
    row.appendChild(input);
    return row;
}

function fillSelect(el, list, def) {
    el.innerHTML = '';
    for (const o of list) {
        const opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = o.label;
        el.appendChild(opt);
    }
    if (list.some(o => o.id === def)) el.value = def;
}

function updateSayaParents() {
    const t = DATA.sayaTypes.find(s => s.id === $('sayaType').value) || DATA.sayaTypes[0];
    if (!t) return;
    fillSelect($('sayaParent'), t.models.map(m => ({ id: m, label: m })), t.models[0]);
}

/** 日本語名からアイテムIDを自動で埋める (英語名がある時のみ) */
function autoId() {
    const en = $('nameEn').value.trim();
    if (!en) return;
    if ($('itemId').dataset.touched) return;
    $('itemId').value = en.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
$('itemId') && $('itemId').addEventListener('input', function () { this.dataset.touched = '1'; });

function onChange() {
    const type = $('weaponType').value;
    $('newTypeBox').classList.toggle('show', type === '__new__');
    $('rangeRow').style.display = $('overrideStats').checked ? 'flex' : 'none';
    $('sayaRow').style.display = $('sayaEnabled').checked ? 'flex' : 'none';

    // 武器タイプに応じて鞘の種類を自動選択
    if (DATA.typeToSaya[type] && !$('sayaType').dataset.touched) {
        $('sayaType').value = DATA.typeToSaya[type];
        updateSayaParents();
    }

    $('damageVal').textContent = (+$('damage').value).toFixed(1);
    const sp = +$('attackSpeed').value;
    $('attackSpeedVal').textContent = sp.toFixed(1) + ' (毎秒' + (4 + sp).toFixed(1) + '回)';
    $('durabilityVal').textContent = +$('durability').value === 0 ? '無限' : $('durability').value;
    $('enchantabilityVal').textContent = $('enchantability').value;
    $('attackRangeVal').textContent = (+$('attackRange').value).toFixed(1);
    $('chanceVal').textContent = $('chance').value + '%';
    $('giveHint').textContent = DATA ? '' : '';

    drawTexture();
    preview();
}

$('sayaType') && $('sayaType').addEventListener('change', function () {
    this.dataset.touched = '1';
    updateSayaParents();
    preview();
});

/** 拡張機能側と同じロジックでテクスチャをプレビューする */
function drawTexture() {
    const cv = $('texPreview');
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 16, 16);
    if (!DATA || !$('genTexture').checked) return;

    const type = $('weaponType').value === '__new__' ? 'sword' : $('weaponType').value;
    const s = DATA.shapes[type] || DATA.shapes.default;
    const blade = $('bladeColor').value;
    const handle = $('handleColor').value;

    const [bx0, by0, bx1, by1] = s.blade;
    const dx = bx1 - bx0, dy = by1 - by0;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const px = -uy, py = ux;

    const line = (x0, y0, x1, y1, w, color) => {
        ctx.fillStyle = color;
        const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 4 + 1;
        const half = (w - 1) / 2;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
            for (let ox = -half; ox <= half; ox++)
                for (let oy = -half; oy <= half; oy++)
                    ctx.fillRect(Math.round(x + ox), Math.round(y + oy), 1, 1);
        }
    };

    line(bx0, by0, bx0 - ux * s.handle, by0 - uy * s.handle, 2, handle);
    line(bx0 - px * s.guard / 2, by0 - py * s.guard / 2, bx0 + px * s.guard / 2, by0 + py * s.guard / 2, 1, shade(handle, 1.35));
    if (s.curve) {
        const mx = (bx0 + bx1) / 2 + px * s.curve, my = (by0 + by1) / 2 + py * s.curve;
        line(bx0, by0, mx, my, s.width, blade);
        line(mx, my, bx1, by1, s.width, blade);
    } else {
        line(bx0, by0, bx1, by1, s.width, blade);
    }
    line(bx1, by1, bx1, by1, 1, shade(blade, 1.25));
}

function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
        .map(v => Math.max(0, Math.min(255, Math.round(v * f))));
    return 'rgb(' + c.join(',') + ')';
}

/** フォームの内容を spec にまとめる */
function collect() {
    const blocks = {};
    for (const b of BLOCKS) {
        const enabled = $('en-' + b.id).checked;
        const o = { enabled };
        for (const p of b.params) {
            const el = $('p-' + b.id + '-' + p.key);
            o[p.key] = p.type === 'range' ? +el.value : el.value;
        }
        blocks[b.id] = o;
    }

    const motions = { combat: [], dash: [], right_click: [], shift_right_click: [] };
    document.querySelectorAll('#motionSlots input[type=checkbox]:checked').forEach(cb => {
        motions[cb.dataset.slot].push(cb.value);
    });

    return {
        displayNameJa: $('nameJa').value.trim(),
        displayNameEn: $('nameEn').value.trim(),
        itemId: $('itemId').value.trim(),
        weaponType: $('weaponType').value,
        newType: {
            id: $('newTypeId').value.trim(),
            displayName: $('newTypeName').value.trim(),
            motions,
            preferred: [],
            baseShape: 'sword',
        },
        stats: {
            damage: +$('damage').value,
            attackSpeed: +$('attackSpeed').value,
            durability: +$('durability').value,
            enchantability: +$('enchantability').value,
            rarity: $('rarity').value,
            tierLevel: 2,
        },
        overrideJsonStats: $('overrideStats').checked,
        jsonStats: {
            durability: +$('durability').value,
            enchantability: +$('enchantability').value,
            damage_bonus: +$('damage').value,
            attack_speed: +$('attackSpeed').value,
            attack_range: +$('attackRange').value,
        },
        hit: {
            particle: $('particle').value,
            particleCount: 10,
            sound: $('sound').value,
        },
        chance: +$('chance').value,
        blocks,
        texture: {
            generate: $('genTexture').checked,
            bladeColor: $('bladeColor').value,
            handleColor: $('handleColor').value,
        },
        saya: {
            enabled: $('sayaEnabled').checked,
            type: $('sayaType').value,
            parent: $('sayaParent').value,
        },
    };
}

let timer = null;
function preview() {
    clearTimeout(timer);
    timer = setTimeout(() => vscode.postMessage({ type: 'preview', spec: collect() }), 120);
}

function renderPreview(files, errors) {
    const errBox = $('errors');
    errBox.innerHTML = '';
    for (const e of (errors || [])) {
        const d = document.createElement('div');
        d.className = 'err';
        d.textContent = '⚠ ' + e;
        errBox.appendChild(d);
    }
    $('createBtn').disabled = (errors || []).length > 0;

    const box = $('files');
    const opened = new Set([...box.querySelectorAll('.file.open')].map(e => e.dataset.rel));
    box.innerHTML = '';

    for (const f of (files || [])) {
        const el = document.createElement('div');
        el.className = 'file' + (opened.has(f.rel) ? ' open' : '');
        el.dataset.rel = f.rel;

        const head = document.createElement('div');
        head.className = 'fhead';
        const tagClass = f.action === 'create' ? 'create' : f.action === 'create-binary' ? 'binary' : 'append';
        const tagText = f.action === 'create' ? '新規' : f.action === 'create-binary' ? '画像' : '追記';
        head.innerHTML = '<span class="tag ' + tagClass + '">' + tagText + '</span>' +
            '<span class="path">' + esc(f.rel) + '</span>' +
            '<span class="ftitle">' + esc(f.title) + '</span>';
        head.addEventListener('click', () => el.classList.toggle('open'));

        const pre = document.createElement('pre');
        pre.textContent = f.body;

        el.appendChild(head);
        el.appendChild(pre);
        box.appendChild(el);
    }
}

function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}

module.exports = { handleWeaponStudio };
