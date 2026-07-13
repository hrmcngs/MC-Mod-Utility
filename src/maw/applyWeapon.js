const fs = require('fs');
const path = require('path');
const { insertIntoBlock, insertIntoArray, findBlock, blockHasKey, parseJsonc } = require('../util/jsonc');
const { loadCatalog, createMawReader } = require('./mawCatalog');
const { buildModelChanges, buildSayaChanges } = require('./modelTemplates');
const {
    generateItemJava,
    generateRegistryEntry,
    generateNewTypeDefinition,
    generateStatsEntry,
    langKey,
    className,
} = require('./codegen');

// =====================================================================
// 武器スペックから「どのファイルをどう変更するか」を全部メモリ上で計算し (computeChanges)、
// それをそのままプレビューにも、ディスクへの書き込みにも使う。
//
// 既存ファイル (weapon_types / weapon_stats / saya.jsonc / AddonItems.java / lang) は
// 上書きせずテキスト差し込みで追記するので、コメントも書式も壊れない。
// =====================================================================

/**
 * @param {object} project readMawProject の結果
 * @param {object} spec 武器スペック
 * @returns {{ changes: Array, errors: string[] }}
 */
function computeChanges(project, spec) {
    const errors = [];
    const warnings = [];
    const changes = [];
    const ctx = { basePackage: project.basePackage, modId: project.namespace };

    if (!project.basePackage) {
        errors.push('@Mod が付いたメインクラスが見つかりません。Java のパッケージ構成を確認してください。');
        return { changes, errors, warnings };
    }
    if (project.weapons.some(w => w.id === spec.itemId)) {
        errors.push(`アイテム ID "${spec.itemId}" は既に登録されています。別の ID にしてください。`);
        return { changes, errors, warnings };
    }

    const itemRef = `${project.namespace}:${spec.itemId}`;

    // --- 1. アイテムの Java クラス ---
    const javaFile = path.join(
        project.javaSrc,
        project.basePackage.replace(/\./g, path.sep),
        'item',
        `${className(spec)}.java`
    );
    if (fs.existsSync(javaFile)) {
        errors.push(`${className(spec)}.java は既に存在します。`);
        return { changes, errors, warnings };
    }
    changes.push({
        file: javaFile,
        action: 'create',
        title: 'アイテムの Java クラス',
        content: generateItemJava(spec, ctx),
    });

    // --- 2. レジストリ登録 (AddonItems.java に追記) ---
    if (project.registry) {
        const reg = patchRegistry(project, spec);
        changes.push(reg);
    } else {
        errors.push('DeferredRegister<Item> を持つ登録クラス (AddonItems 等) が見つかりません。');
    }

    // --- 3-4. アイテムモデル + テクスチャ (平面 / 3D継承 / 3Dベース / 3D複製) ---
    const model = buildModelChanges(
        project,
        spec,
        loadCatalog(project.root),
        createMawReader(project.root)
    );
    changes.push(...model.changes);
    warnings.push(...model.warnings);

    // --- 5. lang (日本語 / 英語) ---
    const key = langKey(spec, ctx);
    changes.push(patchLang(project.paths.langJa, key, spec.displayNameJa, '日本語の表示名'));
    changes.push(patchLang(project.paths.langEn, key, spec.displayNameEn || spec.displayNameJa, '英語の表示名'));

    // --- 6. weapon_types (これを書かないとスキルが使えない) ---
    try {
        changes.push(patchWeaponTypes(project, spec, itemRef, ctx));
    } catch (e) {
        errors.push(`weapon_types の更新に失敗: ${e.message}`);
    }

    // --- 7. weapon_stats (任意) ---
    if (spec.overrideJsonStats) {
        const stats = generateStatsEntry(spec);
        if (Object.keys(stats).length > 0) {
            try {
                changes.push(patchWeaponStats(project, itemRef, stats));
            } catch (e) {
                errors.push(`weapon_stats の更新に失敗: ${e.message}`);
            }
        }
    }

    // --- 8. 鞘 (任意) ---
    if (spec.saya && spec.saya.enabled) {
        const modelName = `saya_${spec.itemId}`;
        const modelRef = `${project.namespace}:custom/saya/${spec.saya.type}/${modelName}`;
        try {
            changes.push(patchSaya(project, spec, itemRef, modelRef));

            // 鞘モデル + 鞘/刃/鍔/柄/柄頭 のテクスチャを本体から複製する
            const saya = buildSayaChanges(project, spec, createMawReader(project.root));
            changes.push(...saya.changes);
            warnings.push(...saya.warnings);
        } catch (e) {
            errors.push(`鞘の登録に失敗: ${e.message}`);
        }
    }

    return { changes: changes.filter(Boolean), errors, warnings };
}

// ---------------------------------------------------------------------
// 個別のパッチ
// ---------------------------------------------------------------------

/** AddonItems.java に import と RegistryObject を差し込む */
function patchRegistry(project, spec) {
    const file = project.registry.file;
    let text = fs.readFileSync(file, 'utf8');
    const cls = className(spec);
    const entry = generateRegistryEntry(spec, project.registry.fieldName);

    // import <base>.item.<Class>;
    const importLine = `import ${project.basePackage}.item.${cls};`;
    if (!text.includes(importLine)) {
        const imports = [...text.matchAll(/^import .+;$/gm)];
        if (imports.length > 0) {
            const last = imports[imports.length - 1];
            const at = last.index + last[0].length;
            text = text.slice(0, at) + '\n' + importLine + text.slice(at);
        } else {
            text = text.replace(/^(package .+;\n)/m, `$1\n${importLine}\n`);
        }
    }

    // クラスの閉じ括弧の直前に登録行を差し込む
    const lastBrace = text.lastIndexOf('}');
    text = text.slice(0, lastBrace) + entry + '\n' + text.slice(lastBrace);

    return {
        file,
        action: 'append',
        title: 'レジストリ登録',
        content: text,
        snippet: `${importLine}\n${entry.trim()}`,
    };
}

/** lang JSON にキーを追加 (無ければファイルごと作る) */
function patchLang(file, key, value, title) {
    if (!fs.existsSync(file)) {
        return {
            file,
            action: 'create',
            title,
            content: JSON.stringify({ [key]: value }, null, 2) + '\n',
        };
    }

    const text = fs.readFileSync(file, 'utf8');
    let json;
    try {
        json = parseJsonc(text);
    } catch {
        json = {};
    }
    json[key] = value;

    return {
        file,
        action: 'append',
        title,
        content: JSON.stringify(json, null, 2) + '\n',
        snippet: `"${key}": "${value}"`,
    };
}

/** weapon_types/weapons.json に武器を登録する */
function patchWeaponTypes(project, spec, itemRef, ctx) {
    const file = project.paths.weaponTypes;
    let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : emptyWeaponTypes();

    if (spec.weaponType === '__new__') {
        const typeId = spec.newType.id;
        if (blockHasKey(text, 'types', typeId)) {
            // 既に同じ新規タイプがある → items に足すだけ
            return appendItemToExistingType(file, text, typeId, itemRef, spec);
        }
        const def = generateNewTypeDefinition(spec, ctx);
        const json = indentJson(def, 4);
        const updated = insertIntoBlock(text, 'types', typeId, json, `${spec.newType.displayName} — このアドオンが追加する新しい武器タイプ`);
        return {
            file,
            action: fs.existsSync(file) ? 'append' : 'create',
            title: `武器タイプ "${typeId}" を新規作成し ${spec.itemId} を登録`,
            content: updated,
            snippet: `"${typeId}": ${JSON.stringify(def, null, 2)}`,
        };
    }

    if (blockHasKey(text, 'types', spec.weaponType)) {
        return appendItemToExistingType(file, text, spec.weaponType, itemRef, spec);
    }

    // このアドオンのファイルにはまだ無いタイプ → items だけのブロックを足す (motions は本体を継承)
    const def = { items: [itemRef] };
    const updated = insertIntoBlock(
        text,
        'types',
        spec.weaponType,
        indentJson(def, 4),
        `本体MODの "${spec.weaponType}" タイプに登録する (motions は本体の定義を継承)`
    );
    return {
        file,
        action: fs.existsSync(file) ? 'append' : 'create',
        title: `武器タイプ "${spec.weaponType}" に ${spec.itemId} を登録`,
        content: updated,
        snippet: `"${spec.weaponType}": { "items": ["${itemRef}"] }`,
    };
}

/** 既にファイルにあるタイプの items 配列に追記 */
function appendItemToExistingType(file, text, typeId, itemRef, spec) {
    const typesBlock = findBlock(text, 'types');
    const typeBlock = findBlock(text.slice(typesBlock.openIndex), typeId);
    const from = typesBlock.openIndex + typeBlock.openIndex;

    const updated = insertIntoArray(text, 'items', `"${itemRef}"`, from);
    return {
        file,
        action: 'append',
        title: `武器タイプ "${typeId}" に ${spec.itemId} を登録`,
        content: updated,
        snippet: `types.${typeId}.items に "${itemRef}" を追加`,
    };
}

/** weapon_stats/weapons.json に item 別のステータス上書きを追記 */
function patchWeaponStats(project, itemRef, stats) {
    const file = project.paths.weaponStats;
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : emptyWeaponStats();

    if (blockHasKey(text, 'weapons', itemRef)) {
        throw new Error(`${itemRef} は既に weapon_stats に登録されています`);
    }

    // weapon_stats のローダー (WeaponStatsRegistry) はコメント除去をせず、
    // パース例外を握り潰す作りなので、ここには // コメントを入れない。
    const json = JSON.stringify(stats);
    const updated = insertIntoBlock(text, 'weapons', itemRef, json);
    return {
        file,
        action: fs.existsSync(file) ? 'append' : 'create',
        title: 'ステータス上書き (weapon_stats)',
        content: updated,
        snippet: `"${itemRef}": ${json}`,
    };
}

/** maw_saya の該当ブロックに「アイテムID → 鞘モデル」を追記 */
function patchSaya(project, spec, itemRef, modelRef) {
    const file = project.paths.saya;
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : emptySaya();

    if (blockHasKey(text, spec.saya.type, itemRef)) {
        throw new Error(`${itemRef} は既に鞘に登録されています`);
    }

    let updated;
    try {
        updated = insertIntoBlock(text, spec.saya.type, itemRef, `"${modelRef}"`, `${spec.displayNameJa} の納刀`);
    } catch {
        // そのサヤ種別のブロックがファイルに無い → ルートに新しいブロックを作る
        const insertion = `  "${spec.saya.type}": {\n    "${itemRef}": "${modelRef}"\n  },\n`;
        const firstBrace = text.indexOf('{');
        updated = text.slice(0, firstBrace + 1) + '\n' + insertion + text.slice(firstBrace + 1);
    }

    return {
        file,
        action: fs.existsSync(file) ? 'append' : 'create',
        title: `鞘 (${spec.saya.type}) に納刀登録`,
        content: updated,
        snippet: `"${itemRef}": "${modelRef}"`,
    };
}

// ---------------------------------------------------------------------
// ファイルが無い時に作る初期テンプレート
// ---------------------------------------------------------------------

function emptyWeaponTypes() {
    return `{
  "_comment": [
    "武器タイプ宣言ファイル — 本体MOD の WeaponTypeRegistry が起動時に自動で読み込む。",
    "既存タイプ (katana / sword / dagger ...) に items を足すだけなら motions は不要 (本体の定義を継承)。",
    "新しいタイプを作る場合だけ motions も書く。",
    "ファイル名が _ で始まると読み込まれないので注意。"
  ],

  "types": {
  }
}
`;
}

function emptyWeaponStats() {
    return `{
  "_comment": [
    "武器ステータス上書きファイル — 本体MOD の WeaponStatsRegistry が自動で読み込む。",
    "ここに書いた値は Java 側の Tier 設定より優先される。",
    "  durability     : 耐久値 (0 = 無限)",
    "  enchantability : エンチャント適性",
    "  damage_bonus   : 攻撃力ボーナス",
    "  attack_speed   : 攻撃速度 (剣 -2.4 / 短剣 -1.2。大きいほど速い)",
    "  attack_range   : 近接リーチ加算",
    "types (タイプ別既定) は全MOD横断で共有されるため、独自タイプを足した時だけ書くこと。"
  ],

  "weapons": {
  }
}
`;
}

function emptySaya() {
    return `// 鞘 (納刀) 登録ファイル — 本体MOD の SayaRegistry が自動で読み込む。
//   "<アイテムID>": "<鞘モデルの ResourceLocation>"
// モデルは assets/<namespace>/models/custom/saya/<種類>/ に置く。
{
  "katana": {
  },
  "tyokuto": {
  },
  "sword": {
  },
  "rapier": {
  },
  "dagger": {
  }
}
`;
}

/** ネストして差し込むために JSON を再インデントする */
function indentJson(obj, spaces) {
    const raw = JSON.stringify(obj, null, 2);
    const pad = ' '.repeat(spaces);
    return raw
        .split('\n')
        .map((line, i) => (i === 0 ? line : pad + line))
        .join('\n');
}

// ---------------------------------------------------------------------
// 書き込み
// ---------------------------------------------------------------------

/**
 * computeChanges の結果をディスクに書く
 * @param {Array} changes
 * @returns {string[]} 書き込んだファイルパス
 */
function writeChanges(changes) {
    const written = [];
    for (const c of changes) {
        fs.mkdirSync(path.dirname(c.file), { recursive: true });
        if (c.action === 'create-binary') {
            fs.writeFileSync(c.file, c.buffer);
        } else {
            fs.writeFileSync(c.file, c.content, 'utf8');
        }
        written.push(c.file);
    }
    return written;
}

module.exports = { computeChanges, writeChanges };
