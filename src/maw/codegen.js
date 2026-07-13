// =====================================================================
// 武器スペック (武器スタジオのフォーム内容) から、各ファイルの中身を生成する。
//
// 生成対象:
//   1. item/<Class>Item.java          … アイテム本体 (効果ブロックを合成)
//   2. init/AddonItems.java への追記   … レジストリ登録
//   3. models/item/<id>.json          … アイテムモデル
//   4. textures/item/<id>.png         … プレースホルダーテクスチャ (textureGen 側)
//   5. lang/ja_jp.json, en_us.json    … 表示名
//   6. weapon_types/weapons.json      … 武器タイプへの登録 (スキルが使えるようになる)
//   7. weapon_stats/weapons.json      … ステータス上書き (任意)
//   8. maw_saya/saya.jsonc + 鞘モデル  … 納刀対応 (任意)
// =====================================================================

/** 命中時パーティクルの選択肢 */
const PARTICLES = [
    { id: 'FLAME', label: '炎' },
    { id: 'SOUL_FIRE_FLAME', label: '魂の炎（青）' },
    { id: 'CRIT', label: 'クリティカル' },
    { id: 'ENCHANTED_HIT', label: '魔法の斬撃' },
    { id: 'SMOKE', label: '煙' },
    { id: 'ELECTRIC_SPARK', label: '電撃' },
    { id: 'SNOWFLAKE', label: '雪' },
    { id: 'HEART', label: 'ハート' },
    { id: 'DRAGON_BREATH', label: 'ドラゴンブレス' },
    { id: 'END_ROD', label: '光の粒' },
];

/** 命中時サウンドの選択肢 */
const SOUNDS = [
    { id: 'FIRECHARGE_USE', label: '火の玉' },
    { id: 'PLAYER_ATTACK_CRIT', label: 'クリティカル音' },
    { id: 'PLAYER_ATTACK_SWEEP', label: '薙ぎ払い音' },
    { id: 'ANVIL_LAND', label: '金床' },
    { id: 'LIGHTNING_BOLT_THUNDER', label: '雷鳴' },
    { id: 'AMETHYST_BLOCK_CHIME', label: 'アメジストの音' },
    { id: 'BLAZE_SHOOT', label: 'ブレイズの発射' },
    { id: 'ENDER_DRAGON_GROWL', label: 'ドラゴンの咆哮' },
];

/** 状態異常の選択肢 (MobEffects の定数名) */
const EFFECTS = [
    { id: 'MOVEMENT_SLOWDOWN', label: '移動速度低下' },
    { id: 'WEAKNESS', label: '弱体化' },
    { id: 'POISON', label: '毒' },
    { id: 'WITHER', label: 'ウィザー' },
    { id: 'BLINDNESS', label: '盲目' },
    { id: 'CONFUSION', label: '吐き気' },
    { id: 'LEVITATION', label: '浮遊' },
    { id: 'DIG_SLOWDOWN', label: '採掘速度低下' },
];

/** 自己バフの選択肢 */
const BUFFS = [
    { id: 'MOVEMENT_SPEED', label: '移動速度上昇' },
    { id: 'DAMAGE_BOOST', label: '攻撃力上昇' },
    { id: 'REGENERATION', label: '再生' },
    { id: 'DAMAGE_RESISTANCE', label: 'ダメージ耐性' },
    { id: 'FIRE_RESISTANCE', label: '火炎耐性' },
    { id: 'JUMP', label: '跳躍力上昇' },
    { id: 'ABSORPTION', label: '衝撃吸収' },
];

const RARITIES = [
    { id: 'COMMON', label: 'コモン（白）' },
    { id: 'UNCOMMON', label: 'アンコモン（黄）' },
    { id: 'RARE', label: 'レア（水色）' },
    { id: 'EPIC', label: 'エピック（紫）' },
];

// ---------------------------------------------------------------------
// Java: アイテムクラス
// ---------------------------------------------------------------------

/**
 * @param {object} spec 武器スペック
 * @param {object} ctx  { basePackage, modId }
 * @returns {string} Java ソース
 */
function generateItemJava(spec, ctx) {
    const imports = new Set([
        'net.minecraft.world.item.Item',
        'net.minecraft.world.item.ItemStack',
        'net.minecraft.world.item.Rarity',
        'net.minecraft.world.item.SwordItem',
        'net.minecraft.world.item.Tier',
        'net.minecraft.world.item.crafting.Ingredient',
        'net.minecraft.world.entity.LivingEntity',
        'net.minecraft.world.entity.player.Player',
    ]);

    const body = buildHurtEnemyBody(spec, imports);
    const useMethod = buildUseMethod(spec, imports);
    const cls = className(spec);

    const s = spec.stats;
    const attackPerSecond = (4.0 + Number(s.attackSpeed)).toFixed(2);

    const lines = [];
    lines.push(`package ${ctx.basePackage}.item;`);
    lines.push('');
    for (const imp of [...imports].sort()) lines.push(`import ${imp};`);
    lines.push('');
    lines.push('/**');
    lines.push(` * ${spec.displayNameJa} — MC Mod Utility の MAW 武器スタジオで生成`);
    lines.push(' *');
    lines.push(` * 攻撃力      : ${s.damage}（表示上は +1 されて ${(Number(s.damage) + 1).toFixed(1)}）`);
    lines.push(` * 攻撃速度    : ${s.attackSpeed}（毎秒 約 ${attackPerSecond} 回）`);
    lines.push(` * 耐久値      : ${Number(s.durability) === 0 ? '無限' : s.durability}`);
    lines.push(` * エンチャント: ${s.enchantability}`);
    lines.push(' *');
    lines.push(' * 数値を変えたい時はこのファイルの Tier / super(...) を直接編集してよい。');
    lines.push(` * データ側 (data/${ctx.modId}/weapon_stats/weapons.json) に書いた値があれば、そちらが優先される。`);
    lines.push(' */');
    lines.push(`public class ${cls} extends SwordItem {`);
    lines.push('');
    lines.push(`    public ${cls}() {`);
    lines.push('        super(');
    lines.push('            new Tier() {');
    lines.push(`                public int getUses()                    { return ${s.durability}; }${Number(s.durability) === 0 ? '   // 0 = 耐久無限' : ''}`);
    lines.push('                public float getSpeed()                 { return 4.0F; }  // ブロック採掘の速さ');
    lines.push(`                public float getAttackDamageBonus()     { return ${fmtF(s.damage)}; }  // 攻撃力`);
    lines.push(`                public int getLevel()                   { return ${s.tierLevel ?? 2}; }  // 採掘レベル`);
    lines.push(`                public int getEnchantmentValue()        { return ${s.enchantability}; }`);
    lines.push('                public Ingredient getRepairIngredient() { return Ingredient.of(); }  // 修理素材 (なし)');
    lines.push('            },');
    lines.push('            0,      // 追加攻撃力 (攻撃力は上の getAttackDamageBonus で設定済み)');
    lines.push(`            ${fmtF(s.attackSpeed)},  // 攻撃速度 (-2.4 が剣の標準。大きいほど速い)`);
    lines.push(`            new Item.Properties().rarity(Rarity.${s.rarity})`);
    lines.push('        );');
    lines.push('    }');

    if (body.length > 0) {
        lines.push('');
        lines.push('    /** 敵に命中したときの処理 */');
        lines.push('    @Override');
        lines.push('    public boolean hurtEnemy(ItemStack stack, LivingEntity target, LivingEntity attacker) {');
        lines.push('        // サーバー側かつプレイヤーが攻撃した時だけ実行する');
        lines.push('        if (attacker instanceof Player player && attacker.level() instanceof ServerLevel level) {');
        for (const line of body) lines.push(line);
        lines.push('        }');
        lines.push('        return super.hurtEnemy(stack, target, attacker);');
        lines.push('    }');
    }

    if (useMethod.length > 0) {
        lines.push('');
        for (const line of useMethod) lines.push(line);
    }

    lines.push('}');
    return lines.join('\n') + '\n';
}

/** 命中時の処理を、選ばれた効果ブロックから組み立てる */
function buildHurtEnemyBody(spec, imports) {
    const out = [];
    const b = spec.blocks || {};
    const hit = spec.hit || {};
    const I = '            '; // if ブロック内のインデント

    if (hit.particle && hit.particle !== 'NONE') {
        imports.add('net.minecraft.core.particles.ParticleTypes');
        imports.add('net.minecraft.server.level.ServerLevel');
        out.push(`${I}// 命中エフェクト: パーティクル`);
        out.push(`${I}level.sendParticles(ParticleTypes.${hit.particle},`);
        out.push(`${I}    target.getX(), target.getY() + target.getBbHeight() * 0.5, target.getZ(),`);
        out.push(`${I}    ${hit.particleCount || 10}, 0.2, 0.3, 0.2, 0.05);`);
    }

    if (hit.sound && hit.sound !== 'NONE') {
        imports.add('net.minecraft.sounds.SoundEvents');
        imports.add('net.minecraft.sounds.SoundSource');
        imports.add('net.minecraft.server.level.ServerLevel');
        out.push(`${I}// 命中エフェクト: サウンド`);
        out.push(`${I}level.playSound(null, target.blockPosition(),`);
        out.push(`${I}    SoundEvents.${hit.sound}, SoundSource.PLAYERS, 0.7F, 1.2F);`);
    }

    const special = [];
    const S = '            ';
    const chance = Number(spec.chance ?? 100);
    const gated = chance < 100;
    const IN = gated ? S + '    ' : S;

    if (b.backstab && b.backstab.enabled) {
        imports.add('net.minecraft.world.phys.Vec3');
        imports.add('net.minecraft.core.particles.ParticleTypes');
        imports.add('net.minecraft.server.level.ServerLevel');
        const mult = Number(b.backstab.multiplier || 2);
        special.push(`${IN}// 【背後から攻撃】ダメージ x${mult}`);
        special.push(`${IN}Vec3 toTarget = target.position().subtract(player.position()).normalize();`);
        special.push(`${IN}if (target.getLookAngle().dot(toTarget) < -0.5) {  // 相手が背を向けている`);
        special.push(`${IN}    target.hurt(target.damageSources().playerAttack(player), this.getDamage() * ${fmtF(mult - 1)});`);
        special.push(`${IN}    level.sendParticles(ParticleTypes.CRIT,`);
        special.push(`${IN}        target.getX(), target.getY() + target.getBbHeight() * 0.5, target.getZ(),`);
        special.push(`${IN}        15, 0.3, 0.3, 0.3, 0.1);`);
        special.push(`${IN}}`);
    }

    if (b.lifesteal && b.lifesteal.enabled) {
        const pct = Number(b.lifesteal.percent || 25);
        special.push(`${IN}// 【吸血】与えたダメージの ${pct}% だけ回復`);
        special.push(`${IN}player.heal(this.getDamage() * ${fmtF(pct / 100)});`);
    }

    if (b.ignite && b.ignite.enabled) {
        const sec = Number(b.ignite.seconds || 4);
        special.push(`${IN}// 【炎上】相手を ${sec} 秒燃やす`);
        special.push(`${IN}target.setSecondsOnFire(${sec});`);
    }

    if (b.effect && b.effect.enabled) {
        imports.add('net.minecraft.world.effect.MobEffectInstance');
        imports.add('net.minecraft.world.effect.MobEffects');
        const sec = Number(b.effect.seconds || 5);
        const lvl = Number(b.effect.level || 1);
        const label = labelOf(EFFECTS, b.effect.id);
        special.push(`${IN}// 【状態異常】${label} を ${sec} 秒付与 (レベル ${lvl})`);
        special.push(`${IN}target.addEffect(new MobEffectInstance(MobEffects.${b.effect.id}, 20 * ${sec}, ${lvl - 1}));`);
    }

    if (b.lightning && b.lightning.enabled) {
        imports.add('net.minecraft.world.entity.EntityType');
        imports.add('net.minecraft.world.entity.LightningBolt');
        imports.add('net.minecraft.server.level.ServerLevel');
        special.push(`${IN}// 【落雷】相手の位置に雷を落とす`);
        special.push(`${IN}LightningBolt bolt = EntityType.LIGHTNING_BOLT.create(level);`);
        special.push(`${IN}if (bolt != null) {`);
        special.push(`${IN}    bolt.moveTo(target.position());`);
        special.push(`${IN}    level.addFreshEntity(bolt);`);
        special.push(`${IN}}`);
    }

    if (b.sweep && b.sweep.enabled) {
        imports.add('net.minecraft.server.level.ServerLevel');
        const r = Number(b.sweep.radius || 3);
        const dmg = Number(b.sweep.damage || 4);
        special.push(`${IN}// 【範囲攻撃】半径 ${r} ブロック以内の敵にも ${dmg} ダメージ`);
        special.push(`${IN}for (LivingEntity nearby : level.getEntitiesOfClass(LivingEntity.class,`);
        special.push(`${IN}        target.getBoundingBox().inflate(${fmtD(r)}),`);
        special.push(`${IN}        e -> e != player && e != target && e.isAlive())) {`);
        special.push(`${IN}    nearby.hurt(nearby.damageSources().playerAttack(player), ${fmtF(dmg)});`);
        special.push(`${IN}}`);
    }

    if (b.message && b.message.enabled && b.message.text) {
        imports.add('net.minecraft.network.chat.Component');
        special.push(`${IN}// 【メッセージ】画面下に表示`);
        special.push(`${IN}player.displayClientMessage(Component.literal("${escapeJava(b.message.text)}"), true);`);
    }

    if (special.length > 0) {
        if (out.length > 0) out.push('');
        if (gated) {
            out.push(`${S}// 発動確率 ${chance}%`);
            out.push(`${S}if (player.getRandom().nextFloat() < ${fmtF(chance / 100)}) {`);
            out.push(...special);
            out.push(`${S}}`);
        } else {
            out.push(...special);
        }
    }

    if (out.length > 0) imports.add('net.minecraft.server.level.ServerLevel');
    return out;
}

/** 右クリックで自己バフする use() を組み立てる */
function buildUseMethod(spec, imports) {
    const rc = spec.blocks && spec.blocks.rightClick;
    if (!rc || !rc.enabled) return [];

    imports.add('net.minecraft.world.InteractionHand');
    imports.add('net.minecraft.world.InteractionResultHolder');
    imports.add('net.minecraft.world.effect.MobEffectInstance');
    imports.add('net.minecraft.world.effect.MobEffects');
    imports.add('net.minecraft.world.level.Level');

    const sec = Number(rc.seconds || 10);
    const lvl = Number(rc.level || 1);
    const cd = Number(rc.cooldown || 15);
    const label = labelOf(BUFFS, rc.id);

    return [
        '    /**',
        `     * 右クリックで自分に「${label}」を ${sec} 秒付与する (クールダウン ${cd} 秒)`,
        '     *',
        '     * 注意: 本体MOD (MAW) のスキル画面で右クリックに「回避」「ガード」「スペル」を',
        '     * 割り当てているとそちらが優先される。この効果を使うなら right_click は',
        '     * 「なし (none_right)」に設定すること。',
        '     */',
        '    @Override',
        '    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {',
        '        ItemStack stack = player.getItemInHand(hand);',
        '        if (!level.isClientSide) {',
        `            player.addEffect(new MobEffectInstance(MobEffects.${rc.id}, 20 * ${sec}, ${lvl - 1}));`,
        `            player.getCooldowns().addCooldown(this, 20 * ${cd});`,
        '        }',
        '        return InteractionResultHolder.sidedSuccess(stack, level.isClientSide());',
        '    }',
    ];
}

// ---------------------------------------------------------------------
// リソース
// ---------------------------------------------------------------------

/** lang のキー */
function langKey(spec, ctx) {
    return `item.${ctx.modId}.${spec.itemId}`;
}

/** レジストリ登録行 (AddonItems.java に差し込む) */
function generateRegistryEntry(spec, registryField) {
    const cls = className(spec);
    return [
        '',
        `    // ${spec.displayNameJa}`,
        `    public static final RegistryObject<Item> ${constName(spec)} =`,
        `        ${registryField}.register("${spec.itemId}", ${cls}::new);`,
    ].join('\n');
}

/** weapon_types に入れるタイプ定義 (新規タイプの場合) */
function generateNewTypeDefinition(spec, ctx) {
    const t = spec.newType;
    const def = {
        display_name: t.displayName,
        items: [`${ctx.modId}:${spec.itemId}`],
        motions: {
            combat: t.motions.combat,
            dash: t.motions.dash,
            right_click: t.motions.right_click,
            shift_right_click: t.motions.shift_right_click,
        },
    };
    if (t.preferred && t.preferred.length > 0) def.preferred_motions = t.preferred;
    return def;
}

/** weapon_stats に書く item 別の上書き */
function generateStatsEntry(spec) {
    const j = spec.jsonStats || {};
    const out = {};
    for (const key of ['durability', 'enchantability', 'damage_bonus', 'attack_speed', 'attack_range']) {
        if (j[key] !== undefined && j[key] !== null && j[key] !== '') out[key] = Number(j[key]);
    }
    return out;
}

// ---------------------------------------------------------------------
// 名前の変換
// ---------------------------------------------------------------------

/** my_sword -> MySwordItem */
function className(spec) {
    return pascal(spec.itemId) + 'Item';
}

/** my_sword -> MY_SWORD */
function constName(spec) {
    return spec.itemId.toUpperCase();
}

function pascal(snake) {
    return String(snake)
        .split(/[_\-\s]+/)
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
}

function fmtF(n) {
    const v = Number(n);
    return `${Number.isInteger(v) ? v.toFixed(1) : String(v)}F`;
}

function fmtD(n) {
    const v = Number(n);
    return Number.isInteger(v) ? v.toFixed(1) : String(v);
}

function escapeJava(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function labelOf(list, id) {
    const found = list.find(x => x.id === id);
    return found ? found.label : id;
}

module.exports = {
    PARTICLES,
    SOUNDS,
    EFFECTS,
    BUFFS,
    RARITIES,
    generateItemJava,
    generateRegistryEntry,
    generateNewTypeDefinition,
    generateStatsEntry,
    langKey,
    className,
    constName,
    pascal,
};
