const fs = require('fs');
const zlib = require('zlib');

// ZIP (= jar) を依存パッケージなしで読むための最小リーダー。
// 本体MOD の jar から data/*.json を直接読み出すために使う。
// 対応するのは stored (0) と deflate (8) のみ。ZIP64 は非対応。

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

/**
 * 末尾から End Of Central Directory を探す
 * @returns {{ centralOffset: number, entryCount: number } | null}
 */
function findEocd(buf) {
    const min = Math.max(0, buf.length - 65557); // 22 + 最大コメント長
    for (let i = buf.length - 22; i >= min; i--) {
        if (buf.readUInt32LE(i) === EOCD_SIG) {
            return {
                entryCount: buf.readUInt16LE(i + 10),
                centralOffset: buf.readUInt32LE(i + 16),
            };
        }
    }
    return null;
}

/**
 * jar/zip 内のエントリ一覧を返す
 * @param {string} zipPath
 * @returns {Map<string, {offset: number, method: number, compressedSize: number, size: number}>}
 */
function readCentralDirectory(buf) {
    const entries = new Map();
    const eocd = findEocd(buf);
    if (!eocd) return entries;

    let p = eocd.centralOffset;
    for (let i = 0; i < eocd.entryCount; i++) {
        if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) break;

        const method = buf.readUInt16LE(p + 10);
        const compressedSize = buf.readUInt32LE(p + 20);
        const size = buf.readUInt32LE(p + 24);
        const nameLen = buf.readUInt16LE(p + 28);
        const extraLen = buf.readUInt16LE(p + 30);
        const commentLen = buf.readUInt16LE(p + 32);
        const localOffset = buf.readUInt32LE(p + 42);
        const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

        entries.set(name, { offset: localOffset, method, compressedSize, size });
        p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
}

class JarFile {
    /** @param {string} jarPath */
    constructor(jarPath) {
        this.buf = fs.readFileSync(jarPath);
        this.entries = readCentralDirectory(this.buf);
    }

    /** @returns {string[]} エントリ名の一覧 */
    list() {
        return [...this.entries.keys()];
    }

    /**
     * エントリを展開して Buffer で返す。存在しなければ null。
     * @param {string} name
     * @returns {Buffer|null}
     */
    read(name) {
        const e = this.entries.get(name);
        if (!e) return null;

        // ローカルヘッダを読んで実データ開始位置を求める
        const p = e.offset;
        if (this.buf.readUInt32LE(p) !== LOC_SIG) return null;
        const nameLen = this.buf.readUInt16LE(p + 26);
        const extraLen = this.buf.readUInt16LE(p + 28);
        const dataStart = p + 30 + nameLen + extraLen;
        const raw = this.buf.subarray(dataStart, dataStart + e.compressedSize);

        if (e.method === 0) return Buffer.from(raw);
        if (e.method === 8) return zlib.inflateRawSync(raw);
        return null; // 未対応の圧縮方式
    }

    /**
     * エントリを UTF-8 文字列で読む
     * @param {string} name
     * @returns {string|null}
     */
    readText(name) {
        const b = this.read(name);
        return b ? b.toString('utf8') : null;
    }
}

module.exports = { JarFile };
