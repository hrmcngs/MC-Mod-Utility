const { encodePng } = require('../util/pngWriter');

// =====================================================================
// 16x16 の武器プレースホルダーテクスチャを生成する。
//
// 「テクスチャを描かないと紫黒の欠けブロックになる」のが初心者の最初のつまずき
// なので、武器タイプと色を選ぶだけでそれっぽい 16x16 PNG を吐く。
// もちろん後から自分の絵に差し替えてよい。
// =====================================================================

const SIZE = 16;

/** 武器タイプごとの形状パラメータ (刃の始点・終点・太さなど) */
const SHAPES = {
    // [x0, y0] = 柄側の刃元, [x1, y1] = 切先。原点は左上。
    sword: { blade: [4, 11, 13, 2], width: 2, guard: 3, handle: 3, curve: 0 },
    katana: { blade: [4, 12, 14, 2], width: 2, guard: 2, handle: 4, curve: 1 },
    straight_sword: { blade: [4, 12, 14, 2], width: 2, guard: 2, handle: 4, curve: 0 },
    dagger: { blade: [5, 10, 11, 4], width: 2, guard: 3, handle: 3, curve: 0 },
    small_sword: { blade: [5, 10, 12, 3], width: 2, guard: 3, handle: 3, curve: 0 },
    rapier: { blade: [4, 12, 14, 1], width: 1, guard: 4, handle: 3, curve: 0 },
    greatsword: { blade: [3, 12, 14, 1], width: 3, guard: 5, handle: 3, curve: 0 },
    nata: { blade: [4, 11, 12, 3], width: 3, guard: 2, handle: 3, curve: 0 },
    trident: { blade: [3, 13, 14, 2], width: 1, guard: 3, handle: 8, curve: 0 },
    default: { blade: [4, 11, 13, 2], width: 2, guard: 3, handle: 3, curve: 0 },
};

/** #rrggbb -> [r,g,b] */
function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return [200, 200, 210];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shade(rgb, factor) {
    return rgb.map(v => Math.max(0, Math.min(255, Math.round(v * factor))));
}

class Canvas {
    constructor(size) {
        this.size = size;
        this.px = new Uint8Array(size * size * 4);
    }

    set(x, y, rgb, a = 255) {
        x = Math.round(x);
        y = Math.round(y);
        if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
        const i = (y * this.size + x) * 4;
        this.px[i] = rgb[0];
        this.px[i + 1] = rgb[1];
        this.px[i + 2] = rgb[2];
        this.px[i + 3] = a;
    }

    alphaAt(x, y) {
        if (x < 0 || y < 0 || x >= this.size || y >= this.size) return 0;
        return this.px[(y * this.size + x) * 4 + 3];
    }

    rgbAt(x, y) {
        const i = (y * this.size + x) * 4;
        return [this.px[i], this.px[i + 1], this.px[i + 2]];
    }

    /** 太さ width の線を引く */
    line(x0, y0, x1, y1, width, rgb) {
        const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 4 + 1;
        const half = (width - 1) / 2;

        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const x = x0 + (x1 - x0) * t;
            const y = y0 + (y1 - y0) * t;
            for (let dx = -half; dx <= half; dx += 1) {
                for (let dy = -half; dy <= half; dy += 1) {
                    this.set(x + dx, y + dy, rgb);
                }
            }
        }
    }
}

/**
 * 武器のプレースホルダーテクスチャ (16x16 PNG) を生成する
 * @param {object} opts
 * @param {string} opts.weaponType 武器タイプID (sword / katana / dagger ...)
 * @param {string} opts.bladeColor '#rrggbb'
 * @param {string} opts.handleColor '#rrggbb'
 * @returns {Buffer} PNG バイナリ
 */
function generateWeaponTexture({ weaponType, bladeColor, handleColor }) {
    const shape = SHAPES[weaponType] || SHAPES.default;
    const blade = hexToRgb(bladeColor || '#c8ccd8');
    const handle = hexToRgb(handleColor || '#6b4a2b');

    const bladeLight = shade(blade, 1.25);
    const bladeDark = shade(blade, 0.65);
    const handleDark = shade(handle, 0.7);
    const guard = shade(handle, 1.35);

    const c = new Canvas(SIZE);
    const [bx0, by0, bx1, by1] = shape.blade;

    // 柄 (刃元から左下へ伸ばす)
    const dx = bx1 - bx0;
    const dy = by1 - by0;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const hx = bx0 - ux * shape.handle;
    const hy = by0 - uy * shape.handle;
    c.line(bx0, by0, hx, hy, 2, handle);
    c.set(hx, hy, handleDark);

    // 鍔 (刃と垂直な短い線)
    const px = -uy;
    const py = ux;
    const g = shape.guard / 2;
    c.line(bx0 - px * g, by0 - py * g, bx0 + px * g, by0 + py * g, 1, guard);

    // 刃
    if (shape.curve) {
        // 反りのある刀: 中間点をずらして 2 本の線で近似する
        const mx = (bx0 + bx1) / 2 + px * shape.curve;
        const my = (by0 + by1) / 2 + py * shape.curve;
        c.line(bx0, by0, mx, my, shape.width, blade);
        c.line(mx, my, bx1, by1, shape.width, blade);
    } else {
        c.line(bx0, by0, bx1, by1, shape.width, blade);
    }

    // 切先を尖らせる
    c.set(bx1, by1, bladeLight);

    // 刃の片側にハイライト、反対側に陰
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            if (c.alphaAt(x, y) === 0) continue;
            const rgb = c.rgbAt(x, y);
            const isBlade = rgb[0] === blade[0] && rgb[1] === blade[1] && rgb[2] === blade[2];
            if (!isBlade) continue;

            if (c.alphaAt(x - 1, y) === 0 || c.alphaAt(x, y - 1) === 0) c.set(x, y, bladeLight);
            else if (c.alphaAt(x + 1, y) === 0 || c.alphaAt(x, y + 1) === 0) c.set(x, y, bladeDark);
        }
    }

    return encodePng(SIZE, SIZE, c.px);
}

module.exports = { generateWeaponTexture, SHAPES };
