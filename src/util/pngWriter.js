const zlib = require('zlib');

// 依存パッケージなしで 32bit RGBA の PNG を書き出す最小実装。
// 武器のプレースホルダーテクスチャを生成するために使う。

const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c;
    }
    return table;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    const crcTarget = out.subarray(4, 8 + data.length);
    out.writeUInt32BE(crc32(crcTarget), 8 + data.length);
    return out;
}

/**
 * RGBA ピクセル配列を PNG バッファに変換する
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgba  width*height*4 バイト
 * @returns {Buffer}
 */
function encodePng(width, height, rgba) {
    // 各行の先頭にフィルタバイト (0 = None) を挟む
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        const rowStart = y * (width * 4 + 1);
        raw[rowStart] = 0;
        for (let x = 0; x < width * 4; x++) {
            raw[rowStart + 1 + x] = rgba[y * width * 4 + x];
        }
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // color type: RGBA
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

module.exports = { encodePng };
