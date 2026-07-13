const fs = require('fs');
const path = require('path');
const { MAW_MODID } = require('./mawDefaults');
const { generateWeaponTexture } = require('./textureGen');

// =====================================================================
// 3D モデルのテンプレート呼び出し。
//
// 本体MOD の 3D 武器モデルは
//   3Dベース (custom/weapon/<種類>/<名前>_parent) → 中間モデル → item モデル
// という 3 段構成になっている。アドオンは「ベースを parent 継承してテクスチャを
// 割り当てる」だけで 3D 武器が作れるが、
//   ・どのベースがあるのか
//   ・#0 #1 …のスロットがそれぞれ刃なのか鍔なのか
//   ・どのテクスチャを指せばいいのか
// を知らないと書けない。ここではそれを本体MOD から読んだカタログで埋める。
//
// モデル方式:
//   2d      … 平面 (item/handheld) + 自動生成テクスチャ
//   inherit … 本体の既存武器の見た目をそのまま使う (parent 1 行)
//   base3d  … 本体の 3Dベースを継承し、テクスチャは自分のものに差し替える
//   copy    … 3Dベースの形 (elements) ごと自分のアドオンに複製する
//             → Blockbench で開いて自由に編集できる
// =====================================================================

/**
 * モデル方式に応じて、生成/コピーするファイルの変更内容を返す
 *
 * @param {object} project readMawProject の結果
 * @param {object} spec 武器スペック (spec.model / spec.texture を見る)
 * @param {object} catalog loadCatalog の結果
 * @param {object|null} reader createMawReader の結果 (本体MODが無ければ null)
 * @returns {{ changes: Array, warnings: string[] }}
 */
function buildModelChanges(project, spec, catalog, reader) {
    const model = spec.model || { mode: '2d' };
    const changes = [];
    const warnings = [];
    const ns = project.namespace;
    const itemModelFile = path.join(project.paths.itemModels, `${spec.itemId}.json`);

    // --- 平面モデル ---
    if (model.mode === '2d' || !model.mode) {
        changes.push({
            file: itemModelFile,
            action: 'create',
            title: 'アイテムモデル (平面)',
            content: json({
                parent: 'item/handheld',
                textures: { layer0: `${ns}:item/${spec.itemId}` },
            }),
        });
        if (spec.texture && spec.texture.generate && !fs.existsSync(path.join(project.paths.itemTextures, `${spec.itemId}.png`))) {
            changes.push(textureChange(project, `${spec.itemId}`, spec));
        }
        return { changes, warnings };
    }

    // --- 本体の武器モデルをそのまま使う ---
    if (model.mode === 'inherit') {
        const found = (catalog.models.itemModels || []).find(m => m.id === model.source);
        if (!found) {
            warnings.push(`本体MODのモデル "${model.source}" が見つかりません。平面モデルにします。`);
            return buildModelChanges(project, { ...spec, model: { mode: '2d' } }, catalog, reader);
        }
        changes.push({
            file: itemModelFile,
            action: 'create',
            title: `アイテムモデル (本体の ${found.id} の見た目を継承)`,
            content: json({
                _comment: `本体MOD の ${found.id} と同じ 3D モデル・テクスチャを使う。見た目を変えたいなら "base3d" 方式にする。`,
                parent: found.parent,
            }),
        });
        return { changes, warnings };
    }

    // --- 3Dベースを使う (継承 or 形ごとコピー) ---
    const base = (catalog.models.weaponBases || []).find(b => b.id === model.source);
    if (!base) {
        warnings.push(`3Dベース "${model.source}" が見つかりません。平面モデルにします。`);
        return buildModelChanges(project, { ...spec, model: { mode: '2d' } }, catalog, reader);
    }

    // テクスチャ: 本体の実例 PNG をアドオンにコピーして、そこを指す。
    // コピーできない (本体が手元に無い) 場合は本体のテクスチャをそのまま参照する。
    const textures = {};
    let particle = null;

    for (const slot of base.slots) {
        const fileName = slotFileName(slot);
        const copied = reader && copyTexture(reader, slot.example, project, spec.itemId, fileName);

        if (copied) {
            changes.push(copied.change);
            textures[slot.key] = copied.ref;
        } else if (slot.example) {
            textures[slot.key] = slot.example;
        } else {
            // 実例が無いスロット → 自前のプレースホルダーを貼る
            const texId = `${spec.itemId}/${fileName}`;
            changes.push(textureChange(project, texId, spec));
            textures[slot.key] = `${ns}:item/${texId}`;
        }
        if (!particle) particle = textures[slot.key];
    }
    if (particle) textures.particle = particle;

    let parentRef = `${MAW_MODID}:${base.id}`;
    let title = `アイテムモデル (3Dベース ${base.name} を継承)`;

    if (model.mode === 'copy') {
        const geometry = reader && reader.readText(`assets/${MAW_MODID}/models/${base.id}.json`);
        if (!geometry) {
            warnings.push('本体MODが見つからないため、3Dモデルの複製ができません。継承のみにします。');
        } else {
            const copyRel = `custom/weapon/${spec.itemId}`;
            const geoFile = path.join(project.paths.resources, `assets/${ns}/models/${copyRel}.json`);
            const geoJson = JSON.parse(geometry);
            geoJson.credit = `Based on ${MAW_MODID}:${base.id} (MC Mod Utility で複製)`;

            changes.push({
                file: geoFile,
                action: 'create',
                title: `3Dモデル本体 (Blockbench で開いて編集できる — ${base.elements} 個のパーツ)`,
                content: json(geoJson),
            });
            parentRef = `${ns}:${copyRel}`;
            title = `アイテムモデル (複製した 3Dモデルを参照)`;
        }
    }

    changes.push({
        file: itemModelFile,
        action: 'create',
        title,
        content: json({
            _comment: base.slots.map(s => `#${s.key} = ${s.label}`).join(' / '),
            parent: parentRef,
            textures,
        }),
    });

    return { changes, warnings };
}

/**
 * 鞘 (saya) のモデルを作る。
 *
 * 本体の鞘モデルは
 *   saya_iron_katana (刃と鞘のテクスチャ) → saya_katana_parent (形 + 鍔/柄/柄頭のテクスチャ)
 * のように親子でテクスチャが分かれている。親まで辿って全部のスロット
 * (鞘・刃・鍔・柄・柄頭) を集め、その PNG をアドオンにコピーしてから貼り直す。
 * → コピーされた saya.png / blade.png / tsuba.png / tsuka.png / kasira.png を
 *   塗り替えるだけで、自分だけの鞘になる。
 *
 * @param {object} project
 * @param {object} spec 武器スペック (spec.saya を見る)
 * @param {object|null} reader
 * @returns {{ changes: Array, warnings: string[] }}
 */
function buildSayaChanges(project, spec, reader) {
    const changes = [];
    const warnings = [];

    const sayaType = spec.saya.type;
    const parentModel = spec.saya.parent;
    const parentPath = `custom/saya/${sayaType}/${parentModel}`;
    const modelFile = path.join(project.paths.sayaModels, sayaType, `saya_${spec.itemId}.json`);

    // 本体MOD が読めない → parent 継承だけの最小構成にする
    const resolved = reader ? resolveTextures(reader, parentPath) : null;
    if (!resolved || Object.keys(resolved).length === 0) {
        if (reader) warnings.push('鞘のテクスチャを読めなかったため、本体の見た目をそのまま継承します。');
        changes.push({
            file: modelFile,
            action: 'create',
            title: '鞘モデル (本体のモデルを継承)',
            content: json({
                _comment: '本体MOD の鞘モデルを継承。独自の 3D モデルにするなら Blockbench で elements を書く。',
                parent: `${MAW_MODID}:${parentPath}`,
            }),
        });
        return { changes, warnings };
    }

    const textures = {};
    const notes = [];

    for (const [slot, tex] of Object.entries(resolved)) {
        if (slot === 'particle') continue;

        // バニラのテクスチャ (item/iron_sword など) はコピーできないのでそのまま使う
        if (!tex.startsWith(`${MAW_MODID}:`)) {
            textures[slot] = tex;
            continue;
        }

        const hint = textureHint(tex);
        const copied = copyTexture(reader, tex, project, `saya_${spec.itemId}`, hint.name);
        if (copied) {
            changes.push(copied.change);
            textures[slot] = copied.ref;
            notes.push(`#${slot} = ${hint.label}`);
        } else {
            textures[slot] = tex;
        }
    }

    // particle は鞘のテクスチャに合わせる
    const sayaSlot = Object.entries(resolved).find(([, t]) => /\/saya[/_]|saya\//.test(t));
    if (sayaSlot && textures[sayaSlot[0]]) textures.particle = textures[sayaSlot[0]];

    const comment = notes.length > 0
        ? `${notes.join(' / ')} — コピーされた PNG を塗り替えると自分だけの鞘になる`
        : undefined;

    // 形ごと複製する場合は、elements を持つ祖先モデルを探して丸ごとコピーする
    if (spec.saya.copyGeometry) {
        const geo = resolveGeometry(reader, parentPath);
        if (geo) {
            changes.push({
                file: modelFile,
                action: 'create',
                title: `鞘モデル (${geo.path} の形ごと複製 — Blockbench で編集できる)`,
                content: json({
                    ...geo.json,
                    credit: `Based on ${MAW_MODID}:${geo.path} (MC Mod Utility で複製)`,
                    _comment: comment,
                    textures,
                }),
            });
            return { changes, warnings };
        }
        warnings.push('形を持つ鞘モデルが見つからなかったため、継承にしました。');
    }

    changes.push({
        file: modelFile,
        action: 'create',
        title: `鞘モデル (${parentModel} の形を継承 / テクスチャは複製したものを使用)`,
        content: json({
            _comment: comment,
            parent: `${MAW_MODID}:${parentPath}`,
            textures,
        }),
    });

    return { changes, warnings };
}

/** parent を辿って、実際に elements (形) を持っているモデルを探す */
function resolveGeometry(reader, modelPath, depth = 0) {
    if (!reader || depth > 6) return null;

    const raw = reader.readText(`assets/${MAW_MODID}/models/${modelPath}.json`);
    if (!raw) return null;

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }

    if ((parsed.elements || []).length > 0) return { path: modelPath, json: parsed };

    const parent = parsed.parent || '';
    if (!parent.startsWith(`${MAW_MODID}:`) && !parent.startsWith('custom/')) return null;
    return resolveGeometry(reader, parent.split(':').pop(), depth + 1);
}

/**
 * モデルの parent を辿って、有効なテクスチャ割り当てをすべて集める。
 * 子で上書きされたスロットは子を優先する。
 */
function resolveTextures(reader, modelPath, depth = 0) {
    if (depth > 6) return {};

    const raw = reader.readText(`assets/${MAW_MODID}/models/${modelPath}.json`);
    if (!raw) return {};

    let json;
    try {
        json = JSON.parse(raw);
    } catch {
        return {};
    }

    const parent = (json.parent || '');
    const inherited = parent.startsWith(`${MAW_MODID}:`) || parent.startsWith('custom/')
        ? resolveTextures(reader, parent.split(':').pop(), depth + 1)
        : {};

    return { ...inherited, ...(json.textures || {}) };
}

/** テクスチャパスから用途 (刃/鞘/鍔/…) を推定する */
function textureHint(texturePath) {
    const hints = {
        saya: { name: 'saya', label: '鞘' },
        blade: { name: 'blade', label: '刃' },
        tsuba: { name: 'tsuba', label: '鍔' },
        tuba: { name: 'tsuba', label: '鍔' },
        tsuka: { name: 'tsuka', label: '柄' },
        tuka: { name: 'tsuka', label: '柄' },
        kasira: { name: 'kasira', label: '柄頭' },
        grip: { name: 'grip', label: 'グリップ' },
        guard: { name: 'guard', label: 'ガード' },
        pommel: { name: 'pommel', label: '柄頭' },
    };
    for (const seg of texturePath.split(':').pop().split('/')) {
        if (hints[seg]) return hints[seg];
    }
    const last = texturePath.split('/').pop();
    return { name: last.replace(/[^a-z0-9_]/gi, '_').toLowerCase(), label: last };
}

/** 本体のテクスチャ PNG をアドオンにコピーする */
function copyTexture(reader, example, project, itemId, fileName) {
    if (!example) return null;

    const rel = example.split(':').pop();
    const buffer = reader.readBuffer(`assets/${MAW_MODID}/textures/${rel}.png`);
    if (!buffer) return null;

    const texId = `${itemId}/${fileName}`;
    const file = path.join(project.paths.itemTextures, `${itemId}`, `${fileName}.png`);

    return {
        ref: `${project.namespace}:item/${texId}`,
        change: {
            file,
            action: 'create-binary',
            title: `テクスチャ: ${fileName} (本体のものを複製 — 塗り替えて使う)`,
            buffer,
            content: `(本体MOD の ${example} をコピーします。そのまま塗り替えればオリジナルの見た目になります)`,
        },
    };
}

/** 自動生成のプレースホルダーテクスチャ */
function textureChange(project, texId, spec) {
    return {
        file: path.join(project.paths.itemTextures, `${texId}.png`),
        action: 'create-binary',
        title: 'テクスチャ (16x16 プレースホルダー)',
        buffer: generateWeaponTexture({
            weaponType: spec.weaponType === '__new__' ? (spec.newType.baseShape || 'sword') : spec.weaponType,
            bladeColor: spec.texture ? spec.texture.bladeColor : '#c8ccd8',
            handleColor: spec.texture ? spec.texture.handleColor : '#6b4a2b',
        }),
        content: '(16x16 の PNG を生成します。あとから自分の絵に差し替えてください)',
    };
}

/** スロットのファイル名 (blade / tsuba / tsuka …) */
function slotFileName(slot) {
    return String(slot.name || `part_${slot.key}`).replace(/[^a-z0-9_]/gi, '_').toLowerCase();
}

function json(obj) {
    return JSON.stringify(obj, null, 2) + '\n';
}

module.exports = { buildModelChanges, buildSayaChanges, resolveTextures, textureHint };
