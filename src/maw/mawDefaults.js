// 本体MOD「The four primitives and Weapons」(MAW) のデータのスナップショット。
//
// mawCatalog は本体MOD の jar / ソースから直接データを読むが、
// 本体が手元に無い環境 (テンプレートを clone しただけ等) でも
// 武器スタジオが動くようにフォールバックとして同じ形のデータを持っておく。
//
// 出典: data/the_four_primitives_and_weapons/weapon_types/*.json
//       data/the_four_primitives_and_weapons/weapon_stats/weapon_stats.json
//       data/the_four_primitives_and_weapons/maw_saya/main.json

const MAW_MODID = 'the_four_primitives_and_weapons';

/** モーションIDの日本語ラベル (weapon_types/_template_for_addons.json のコメント由来) */
const MOTION_LABELS = {
    // combat
    thrust: '突き（直線的な突き攻撃）',
    thrust_combo: '高速連撃（一撃目〜三撃目を連続発動）',
    upper_left_slash: '左上斬り',
    upper_right_slash: '右上斬り',
    horizontal_slash: '横一文字（広範囲の横薙ぎ）',
    spin_slash: '回転斬り（360度の範囲攻撃）',
    slam_down: '叩きつける（上から振り下ろす強打）',
    shield_bash: 'シールドバッシュ',
    // dash
    dash_rush: 'ダッシュ突進',
    leap_slash: '跳躍斬り',
    shadow_step: '影踏み（高速回り込み）',
    // right_click
    dodge: '回避',
    guard: 'ガード',
    parry: 'パリィ',
    spell: '魔法',
    none_right: 'なし（右クリック無効）',
    none_shift: 'なし（シフト右クリック無効）',
    trident_throw: '投擲',
    bow_quick_draw: '速射',
    bow_pierce: '貫通矢',
    bow_homing: '追尾矢',
    bow_arrow_rain: '矢の雨',
};

/** スロットの日本語ラベル */
const SLOT_LABELS = {
    combat: '通常攻撃（コンボ技）',
    dash: 'ダッシュ技',
    right_click: '右クリック',
    shift_right_click: 'シフト＋右クリック',
};

/** 選択肢として出せるモーション (スロット別) */
const MOTIONS = {
    combat: [
        'thrust', 'thrust_combo', 'upper_left_slash', 'upper_right_slash',
        'horizontal_slash', 'spin_slash', 'slam_down', 'shield_bash',
    ],
    dash: ['dash_rush', 'leap_slash', 'shadow_step'],
    right_click: ['dodge', 'guard', 'spell', 'trident_throw', 'none_right'],
    shift_right_click: ['guard', 'parry', 'none_shift'],
};

/** 本体が定義済みの武器タイプ */
const TYPES = [
    { id: 'katana', displayName: '刀', stats: { attack_speed: -2.4 } },
    { id: 'straight_sword', displayName: '直刀', stats: { attack_speed: -2.4 } },
    { id: 'sword', displayName: '剣', stats: { attack_speed: -2.4 } },
    { id: 'rapier', displayName: '細剣', stats: {} },
    { id: 'dagger', displayName: '短剣', stats: { attack_speed: -1.2, attack_range: -2.0 } },
    { id: 'small_sword', displayName: '短刀', stats: { attack_speed: -2.4, attack_range: -1.0 } },
    { id: 'greatsword', displayName: '大剣', stats: { attack_range: 1.5 } },
    { id: 'nata', displayName: '鉈', stats: { attack_speed: -2.4 } },
    { id: 'trident', displayName: '槍', stats: {} },
    { id: 'shield', displayName: '盾', stats: {} },
    { id: 'bow', displayName: '弓', stats: {} },
    { id: 'crossbow', displayName: 'クロスボウ', stats: {} },
    { id: 'throwing', displayName: '投擲', stats: {} },
].map(t => ({
    ...t,
    motions: {
        combat: ['thrust', 'upper_left_slash', 'upper_right_slash', 'horizontal_slash', 'spin_slash'],
        dash: ['dash_rush', 'leap_slash', 'shadow_step'],
        right_click: ['dodge', 'none_right'],
        shift_right_click: ['guard', 'none_shift'],
    },
    preferred: [],
    disliked: [],
    items: [],
}));

/** 鞘 (saya) の種類と、継承できる本体のモデル */
const SAYA_TYPES = [
    {
        id: 'katana',
        label: '刀の鞘',
        models: [
            'saya_wooden_katana', 'saya_stone_katana', 'saya_iron_katana', 'saya_gold_katana',
            'saya_diamond_katana', 'saya_netherite_katana', 'saya_darkness_katana',
            'saya_magical_katana', 'saya_old_katana', 'saya_prototype_katana',
            'saya_blood_katana', 'saya_katana_parent',
        ],
    },
    {
        id: 'tyokuto',
        label: '直刀の鞘',
        models: [
            'saya_wooden_tyokuto', 'saya_stone_tyokuto', 'saya_iron_tyokuto', 'saya_gold_tyokuto',
            'saya_diamond_tyokuto', 'saya_netherite_tyokuto', 'saya_luna', 'saya_tyokuto_parent',
        ],
    },
    {
        id: 'sword',
        label: 'バニラ剣の鞘',
        models: [
            'saya_sword_stone_sword', 'saya_sword_iron_sword', 'saya_sword_golden_sword',
            'saya_sword_diamond_sword', 'saya_sword_netherite_sword', 'saya_sword_parent',
        ],
    },
    {
        id: 'rapier',
        label: '細剣の鞘',
        models: [
            'saya_wooden_rapier', 'saya_stone_rapier', 'saya_iron_rapier', 'saya_gold_rapier',
            'saya_diamond_rapier', 'saya_netherite_rapier', 'saya_rapier_parent',
        ],
    },
    {
        id: 'dagger',
        label: '短剣の鞘',
        models: ['saya_dagger_parent', 'saya_dagger_kara'],
    },
];

/** 武器タイプ → 既定の鞘タイプ */
const TYPE_TO_SAYA = {
    katana: 'katana',
    straight_sword: 'tyokuto',
    sword: 'sword',
    nata: 'sword',
    greatsword: 'sword',
    small_sword: 'sword',
    rapier: 'rapier',
    dagger: 'dagger',
};

const DEFAULT_CATALOG = {
    source: { kind: 'builtin', label: '内蔵スナップショット（本体MODが見つからないため）' },
    types: TYPES,
    motions: MOTIONS,
    motionLabels: MOTION_LABELS,
    slotLabels: SLOT_LABELS,
    sayaTypes: SAYA_TYPES,
    typeToSaya: TYPE_TO_SAYA,
};

module.exports = {
    MAW_MODID,
    MOTION_LABELS,
    SLOT_LABELS,
    MOTIONS,
    SAYA_TYPES,
    TYPE_TO_SAYA,
    DEFAULT_CATALOG,
};
