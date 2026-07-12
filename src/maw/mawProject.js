const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { parseJsonc } = require('../util/jsonc');
const { MAW_MODID } = require('./mawDefaults');

// =====================================================================
// 「このプロジェクトは MAW アドオンか？」を判定し、その中身を読み取る。
//
// 判定材料 (どれか1つでも当たれば MAW アドオンとみなす):
//   - .maw-addon.json         … この拡張機能が生成したアドオンの目印
//   - META-INF/mods.toml      … 本体MOD (the_four_primitives_and_weapons) への依存
//   - data/<ns>/weapon_types/ … 本体MODのデータ駆動ディレクトリ
//   - data/<ns>/maw_saya/
//   - build.gradle            … 本体MOD jar への依存
// =====================================================================

const SAMPLE_MODID = 'the_four_primitives_and_weapons_addons_sample';
const SAMPLE_PACKAGE = 'mawaddon';
const MARKER_FILE = '.maw-addon.json';

/**
 * 与えられた URI (またはワークスペース) から MOD プロジェクトのルートを探す
 * @param {vscode.Uri} [contextUri]
 * @returns {string|null}
 */
function findProjectRoot(contextUri) {
    if (contextUri) {
        let dir = contextUri.fsPath;
        if (fs.existsSync(dir) && !fs.statSync(dir).isDirectory()) dir = path.dirname(dir);

        let current = dir;
        while (current && current !== path.dirname(current)) {
            if (fs.existsSync(path.join(current, 'build.gradle')) ||
                fs.existsSync(path.join(current, MARKER_FILE))) {
                return current;
            }
            current = path.dirname(current);
        }
    }

    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return null;

    // 複数フォルダの場合は MAW アドオンらしいものを優先
    for (const f of folders) {
        if (looksLikeMawAddon(f.uri.fsPath)) return f.uri.fsPath;
    }
    return folders[0].uri.fsPath;
}

/** 軽量チェック (ファイルの中身までは読まない範囲で判定) */
function looksLikeMawAddon(root) {
    if (!root || !fs.existsSync(root)) return false;

    if (fs.existsSync(path.join(root, MARKER_FILE))) return true;

    const modsToml = path.join(root, 'src/main/resources/META-INF/mods.toml');
    if (fs.existsSync(modsToml)) {
        const text = fs.readFileSync(modsToml, 'utf8');
        // 自分自身が本体MODの場合は除外 (アドオンではない)
        const self = (text.match(/^\s*modId\s*=\s*"([^"]+)"/m) || [])[1];
        if (self === MAW_MODID) return false;
        if (text.includes(MAW_MODID)) return true;
    }

    const dataDir = path.join(root, 'src/main/resources/data');
    if (fs.existsSync(dataDir)) {
        for (const ns of safeReaddir(dataDir)) {
            if (fs.existsSync(path.join(dataDir, ns, 'weapon_types')) ||
                fs.existsSync(path.join(dataDir, ns, 'maw_saya'))) {
                return true;
            }
        }
    }

    const buildGradle = path.join(root, 'build.gradle');
    if (fs.existsSync(buildGradle) && fs.readFileSync(buildGradle, 'utf8').includes(MAW_MODID)) {
        return true;
    }

    return false;
}

function safeReaddir(dir) {
    try {
        return fs.readdirSync(dir).filter(e => fs.statSync(path.join(dir, e)).isDirectory());
    } catch {
        return [];
    }
}

/**
 * MAW アドオンプロジェクトの状態を読み取る
 * @param {string} root
 * @returns {object|null} 検出できなければ null
 */
function readMawProject(root) {
    if (!looksLikeMawAddon(root)) return null;

    const resources = path.join(root, 'src/main/resources');
    const marker = readMarker(root);

    const modId = readModId(root) || marker.modId || path.basename(root);
    const namespace = findNamespace(resources, modId);

    const java = findJavaEntry(root);
    const registry = findItemRegistry(root, java);

    const paths = {
        root,
        resources,
        marker: path.join(root, MARKER_FILE),
        modsToml: path.join(resources, 'META-INF/mods.toml'),
        weaponTypes: path.join(resources, `data/${namespace}/weapon_types/weapons.json`),
        weaponStats: path.join(resources, `data/${namespace}/weapon_stats/weapons.json`),
        saya: findSayaFile(resources, namespace),
        langJa: path.join(resources, `assets/${namespace}/lang/ja_jp.json`),
        langEn: path.join(resources, `assets/${namespace}/lang/en_us.json`),
        itemModels: path.join(resources, `assets/${namespace}/models/item`),
        itemTextures: path.join(resources, `assets/${namespace}/textures/item`),
        sayaModels: path.join(resources, `assets/${namespace}/models/custom/saya`),
    };

    return {
        root,
        modId,
        namespace,
        marker,
        createdByStudio: marker.generator === 'mc-mod-utility',
        isSampleTemplate: modId === SAMPLE_MODID || (java && java.basePackage === SAMPLE_PACKAGE),
        javaSrc: java ? java.srcRoot : path.join(root, 'src/main/java'),
        basePackage: java ? java.basePackage : null,
        mainClass: java ? java.mainClass : null,
        mainClassFile: java ? java.file : null,
        registry,
        paths,
        weapons: registry ? registry.items : [],
        weaponTypes: readDeclaredTypes(paths.weaponTypes),
        sayaEntries: readSayaEntries(paths.saya),
    };
}

/** .maw-addon.json (この拡張機能が付ける目印) */
function readMarker(root) {
    const p = path.join(root, MARKER_FILE);
    if (!fs.existsSync(p)) return {};
    try {
        return parseJsonc(fs.readFileSync(p, 'utf8'));
    } catch {
        return {};
    }
}

/** mods.toml から自分の modId を読む */
function readModId(root) {
    const p = path.join(root, 'src/main/resources/META-INF/mods.toml');
    if (!fs.existsSync(p)) return null;
    const text = fs.readFileSync(p, 'utf8');
    const m = text.match(/^\s*modId\s*=\s*"([^"]+)"/m);
    return m ? m[1] : null;
}

/** assets/ 配下の名前空間 (通常は modId と同じ) */
function findNamespace(resources, modId) {
    const assets = path.join(resources, 'assets');
    const dirs = safeReaddir(assets).filter(d => d !== 'minecraft' && d !== MAW_MODID);
    if (dirs.includes(modId)) return modId;
    return dirs[0] || modId;
}

/** saya の jsonc/json を探す (ファイル名は自由) */
function findSayaFile(resources, namespace) {
    const dir = path.join(resources, `data/${namespace}/maw_saya`);
    const fallback = path.join(dir, 'saya.jsonc');
    if (!fs.existsSync(dir)) return fallback;

    const files = fs.readdirSync(dir).filter(f => !f.startsWith('_') && /\.jsonc?$/.test(f));
    return files.length > 0 ? path.join(dir, files[0]) : fallback;
}

/**
 * @Mod アノテーションの付いたメインクラスを探す
 * @returns {{ srcRoot: string, file: string, packageName: string, basePackage: string, mainClass: string } | null}
 */
function findJavaEntry(root) {
    for (const rel of ['src/main/java', 'src/main/kotlin']) {
        const srcRoot = path.join(root, rel);
        if (!fs.existsSync(srcRoot)) continue;

        for (const file of walkFiles(srcRoot, ['.java', '.kt'])) {
            const text = fs.readFileSync(file, 'utf8');
            if (!/@Mod\s*\(/.test(text)) continue;

            const pkg = (text.match(/^\s*package\s+([\w.]+)\s*;?/m) || [])[1] || '';
            const cls = (text.match(/(?:class|object)\s+(\w+)/) || [])[1] || path.basename(file).replace(/\.\w+$/, '');
            return { srcRoot, file, packageName: pkg, basePackage: pkg, mainClass: cls };
        }
    }
    return null;
}

/**
 * DeferredRegister<Item> を持つ登録クラスを探す
 * @returns {{ file: string, className: string, packageName: string, fieldName: string, items: Array } | null}
 */
function findItemRegistry(root, java) {
    const srcRoot = java ? java.srcRoot : path.join(root, 'src/main/java');
    if (!fs.existsSync(srcRoot)) return null;

    for (const file of walkFiles(srcRoot, ['.java', '.kt'])) {
        const text = fs.readFileSync(file, 'utf8');
        const m = text.match(/(\w+)\s*=\s*DeferredRegister\s*\.\s*create\s*\(\s*ForgeRegistries\.ITEMS/);
        if (!m) continue;

        return {
            file,
            className: path.basename(file).replace(/\.\w+$/, ''),
            packageName: (text.match(/^\s*package\s+([\w.]+)\s*;?/m) || [])[1] || '',
            fieldName: m[1],
            items: parseRegisteredItems(text, m[1]),
        };
    }
    return null;
}

/** REGISTRY.register("id", XItem::new) を拾う */
function parseRegisteredItems(text, fieldName) {
    const items = [];
    const re = new RegExp(`${fieldName}\\s*\\.\\s*register\\s*\\(\\s*"([a-z0-9_./-]+)"\\s*,\\s*(?:([\\w.]+)::new|\\(\\)\\s*->\\s*new\\s+([\\w.]+))`, 'g');

    let m;
    while ((m = re.exec(text)) !== null) {
        items.push({ id: m[1], className: (m[2] || m[3] || '').split('.').pop() });
    }
    return items;
}

/** data/<ns>/weapon_types/*.json に宣言された武器タイプ */
function readDeclaredTypes(file) {
    if (!fs.existsSync(file)) return [];
    try {
        const json = parseJsonc(fs.readFileSync(file, 'utf8'));
        return Object.entries(json.types || {})
            .filter(([k]) => !k.startsWith('_'))
            .map(([id, def]) => ({
                id,
                displayName: def.display_name || id,
                items: (def.items || []).filter(i => typeof i === 'string'),
                isNewType: !!def.motions,
            }));
    } catch {
        return [];
    }
}

/** maw_saya の登録内容 */
function readSayaEntries(file) {
    if (!file || !fs.existsSync(file)) return [];
    try {
        const json = parseJsonc(fs.readFileSync(file, 'utf8'));
        const out = [];
        for (const [sayaType, entries] of Object.entries(json)) {
            if (sayaType.startsWith('_') || typeof entries !== 'object') continue;
            for (const [itemId, model] of Object.entries(entries)) {
                if (itemId.startsWith('_')) continue;
                out.push({ sayaType, itemId, model });
            }
        }
        return out;
    } catch {
        return [];
    }
}

/** ディレクトリを再帰的に走査してファイルパスを列挙 */
function* walkFiles(dir, exts) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === 'build' || e.name === '.git') continue;
            yield* walkFiles(p, exts);
        } else if (exts.some(x => e.name.endsWith(x))) {
            yield p;
        }
    }
}

module.exports = {
    findProjectRoot,
    looksLikeMawAddon,
    readMawProject,
    walkFiles,
    SAMPLE_MODID,
    SAMPLE_PACKAGE,
    MARKER_FILE,
};
