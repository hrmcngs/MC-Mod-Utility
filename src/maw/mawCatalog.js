const fs = require('fs');
const os = require('os');
const path = require('path');
const { JarFile } = require('../util/zipReader');
const { parseJsonc } = require('../util/jsonc');
const {
    MAW_MODID,
    MOTION_LABELS,
    SLOT_LABELS,
    MOTIONS,
    SAYA_TYPES,
    TYPE_TO_SAYA,
    DEFAULT_CATALOG,
} = require('./mawDefaults');

// =====================================================================
// 本体MOD (The four primitives and Weapons) のデータを読み出すカタログ。
//
// 武器タイプ・モーションID・鞘の種類・鞘モデルは本体MOD側が持っている情報なので、
// 拡張機能側にハードコードせず、次の優先順で「本物」を読む:
//
//   1. gradle.properties の mawSourceProject
//   2. 環境変数 MAW_DIR
//   3. ~/The-four-primitives-and-Weapons  (テンプレの既定パス)
//   4. アドオン内の .maw-src/  (fetch-maw-jar.sh が clone する場所)
//   5. アドオン内の libs/local/the_four_primitives_and_weapons/<ver>/*.jar
//   6. どれも無ければ内蔵スナップショット (mawDefaults.js)
//
// 本体MOD が更新されて新しい武器タイプやモーションが増えても、
// 拡張機能を更新せずに追従できる。
// =====================================================================

const DATA_DIR = `data/${MAW_MODID}`;
const ASSET_DIR = `assets/${MAW_MODID}`;

const FILES = {
    weaponTypes: `${DATA_DIR}/weapon_types/weapon_types.json`,
    addonTemplate: `${DATA_DIR}/weapon_types/_template_for_addons.json`,
    preferredMotions: `${DATA_DIR}/weapon_types/preferred_motions.jsonc`,
    weaponStats: `${DATA_DIR}/weapon_stats/weapon_stats.json`,
    saya: `${DATA_DIR}/maw_saya/main.json`,
};

/** @type {Map<string, object>} addonRoot -> catalog */
const cache = new Map();

/**
 * 本体MOD の場所を解決する
 * @param {string} addonRoot アドオンプロジェクトのルート
 * @returns {{kind: 'source'|'jar', path: string, label: string} | null}
 */
function resolveMawSource(addonRoot) {
    const candidates = [];

    // 1. gradle.properties の mawSourceProject
    const gradleProps = path.join(addonRoot, 'gradle.properties');
    if (fs.existsSync(gradleProps)) {
        const m = fs.readFileSync(gradleProps, 'utf8').match(/^\s*mawSourceProject\s*=\s*(.+)$/m);
        if (m) candidates.push(m[1].trim());
    }

    // 2. 環境変数
    if (process.env.MAW_DIR) candidates.push(process.env.MAW_DIR);

    // 3. テンプレートの既定パス
    candidates.push(path.join(os.homedir(), 'The-four-primitives-and-Weapons'));

    // 4. fetch-maw-jar.sh の clone 先
    candidates.push(path.join(addonRoot, '.maw-src'));

    for (const dir of candidates) {
        if (dir && fs.existsSync(path.join(dir, 'src/main/resources', FILES.weaponTypes))) {
            return { kind: 'source', path: dir, label: `本体MODソース: ${dir}` };
        }
    }

    // 5. libs/local に取り込まれた jar
    const jar = findLocalJar(addonRoot);
    if (jar) return { kind: 'jar', path: jar, label: `本体MOD jar: ${path.basename(jar)}` };

    return null;
}

/** libs/local/the_four_primitives_and_weapons/<ver>/*.jar を探す */
function findLocalJar(addonRoot) {
    const base = path.join(addonRoot, 'libs', 'local', MAW_MODID);
    if (!fs.existsSync(base)) return null;

    for (const ver of fs.readdirSync(base)) {
        const dir = path.join(base, ver);
        if (!fs.statSync(dir).isDirectory()) continue;
        const jars = fs.readdirSync(dir).filter(f => f.endsWith('.jar'));
        if (jars.length > 0) return path.join(dir, jars[0]);
    }
    return null;
}

/**
 * 本体MOD からファイルを読むリーダーを作る
 * @returns {{ readText(rel: string): string|null, listDir(rel: string): string[] }}
 */
function createReader(source) {
    if (source.kind === 'source') {
        const base = path.join(source.path, 'src/main/resources');
        return {
            readText(rel) {
                const p = path.join(base, rel);
                return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
            },
            listDir(rel) {
                const p = path.join(base, rel);
                if (!fs.existsSync(p)) return [];
                return fs.readdirSync(p).filter(f => f.endsWith('.json'));
            },
        };
    }

    // jar
    const jar = new JarFile(source.path);
    const names = jar.list();
    return {
        readText(rel) {
            return jar.readText(rel);
        },
        listDir(rel) {
            const prefix = rel.endsWith('/') ? rel : rel + '/';
            return names
                .filter(n => n.startsWith(prefix) && n.endsWith('.json') && !n.slice(prefix.length).includes('/'))
                .map(n => n.slice(prefix.length));
        },
    };
}

/** JSON/JSONC を安全に読む (失敗したら null) */
function readJson(reader, rel) {
    try {
        const text = reader.readText(rel);
        return text ? parseJsonc(text) : null;
    } catch {
        return null;
    }
}

/** `_` 始まりのキー (コメント) を除いたエントリ */
function realEntries(obj) {
    if (!obj || typeof obj !== 'object') return [];
    return Object.entries(obj).filter(([k]) => !k.startsWith('_'));
}

/**
 * _template_for_addons.json のコメントから「モーションID一覧」を抜き出す。
 * 本体が新しいモーションを追加してもここから拾える。
 * 例: "combat用: thrust, thrust_combo, upper_left_slash"
 */
function parseMotionsFromTemplate(template) {
    const comment = template && template._comment;
    if (!Array.isArray(comment)) return null;

    const slotAliases = {
        'combat用': 'combat',
        'dash用': 'dash',
        'right_click用': 'right_click',
        'shift_right_click用': 'shift_right_click',
    };

    const found = {};
    for (const line of comment) {
        if (typeof line !== 'string') continue;
        const m = line.match(/^(\S+?)用\s*:\s*(.+)$/);
        if (!m) continue;
        const slot = slotAliases[`${m[1]}用`];
        if (!slot) continue;
        found[slot] = m[2].split(',').map(s => s.trim()).filter(s => /^[a-z0-9_]+$/.test(s));
    }
    return Object.keys(found).length > 0 ? found : null;
}

/**
 * 本体MOD のデータを読み込み、武器スタジオが使う形に整えて返す
 * @param {string} addonRoot
 * @param {boolean} [force] キャッシュを無視して読み直す
 * @returns {object} catalog
 */
function loadCatalog(addonRoot, force = false) {
    if (!force && cache.has(addonRoot)) return cache.get(addonRoot);

    const source = resolveMawSource(addonRoot);
    if (!source) {
        cache.set(addonRoot, DEFAULT_CATALOG);
        return DEFAULT_CATALOG;
    }

    let catalog;
    try {
        catalog = buildCatalog(createReader(source), source);
    } catch (e) {
        catalog = { ...DEFAULT_CATALOG, source: { kind: 'builtin', label: `本体MODの読み込みに失敗: ${e.message}` } };
    }

    cache.set(addonRoot, catalog);
    return catalog;
}

function buildCatalog(reader, source) {
    const weaponTypes = readJson(reader, FILES.weaponTypes);
    const template = readJson(reader, FILES.addonTemplate);
    const prefs = readJson(reader, FILES.preferredMotions);
    const stats = readJson(reader, FILES.weaponStats);
    const saya = readJson(reader, FILES.saya);

    if (!weaponTypes) throw new Error('weapon_types.json が読めません');

    const preferred = (prefs && prefs.preferred_motions) || {};
    const disliked = (prefs && prefs.disliked_motions) || {};
    const statDefaults = (stats && stats.types) || {};

    // --- 武器タイプ ---
    const types = realEntries(weaponTypes.types).map(([id, def]) => ({
        id,
        displayName: def.display_name || id,
        motions: def.motions || {},
        preferred: def.preferred_motions || preferred[id] || [],
        disliked: disliked[id] || [],
        items: def.items || [],
        stats: statDefaults[id] || {},
    }));

    // --- モーションID (テンプレのコメント優先、無ければ全タイプの和集合) ---
    const fromTemplate = parseMotionsFromTemplate(template);
    const union = { combat: new Set(), dash: new Set(), right_click: new Set(), shift_right_click: new Set() };
    for (const t of types) {
        for (const slot of Object.keys(union)) {
            for (const m of t.motions[slot] || []) union[slot].add(m);
        }
    }
    const motions = {};
    for (const slot of Object.keys(union)) {
        const merged = new Set([...(fromTemplate?.[slot] || []), ...union[slot], ...(MOTIONS[slot] || [])]);
        motions[slot] = [...merged];
    }

    // --- 鞘 ---
    const sayaKeys = saya ? realEntries(saya).map(([k]) => k) : SAYA_TYPES.map(s => s.id);
    const sayaTypes = sayaKeys.map(id => {
        const fallback = SAYA_TYPES.find(s => s.id === id);
        const models = reader
            .listDir(`${ASSET_DIR}/models/custom/saya/${id}`)
            .filter(f => !f.startsWith('_'))
            .map(f => f.replace(/\.json$/, ''));
        return {
            id,
            label: fallback ? fallback.label : `${id} の鞘`,
            models: models.length > 0 ? models : (fallback ? fallback.models : []),
        };
    });

    return {
        source,
        types,
        motions,
        motionLabels: MOTION_LABELS,
        slotLabels: SLOT_LABELS,
        sayaTypes,
        typeToSaya: TYPE_TO_SAYA,
    };
}

/** キャッシュを捨てる (本体MODを更新した後などに呼ぶ) */
function clearCache() {
    cache.clear();
}

module.exports = { loadCatalog, resolveMawSource, clearCache, MAW_MODID };
