// MAW のデータファイルは .jsonc (コメント付き JSON) を許容する。
// 読み取り用のパーサと、コメントを壊さずに追記するためのテキストパッチを提供する。

/**
 * コメント (// と /* *\/) と末尾カンマを除去して JSON.parse する
 * @param {string} text
 * @returns {any}
 */
function parseJsonc(text) {
    return JSON.parse(stripJsonc(text));
}

/**
 * 文字列リテラルを避けつつコメントと末尾カンマを取り除く
 * @param {string} text
 * @returns {string}
 */
function stripJsonc(text) {
    let out = '';
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i + 1];

        if (inString) {
            out += c;
            if (escaped) escaped = false;
            else if (c === '\\') escaped = true;
            else if (c === '"') inString = false;
            continue;
        }

        if (c === '"') {
            inString = true;
            out += c;
            continue;
        }

        if (c === '/' && next === '/') {
            while (i < text.length && text[i] !== '\n') i++;
            out += '\n';
            continue;
        }

        if (c === '/' && next === '*') {
            i += 2;
            while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
            i++; // '/' の分
            continue;
        }

        out += c;
    }

    // 末尾カンマ ( , } / , ] ) を除去
    return out.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * `"blockKey": {` ... `}` のブロックを探し、その範囲を返す
 * @param {string} text
 * @param {string} blockKey
 * @returns {{ openIndex: number, closeIndex: number, body: string } | null}
 *          openIndex = '{' の位置, closeIndex = 対応する '}' の位置
 */
function findBlock(text, blockKey) {
    const keyRe = new RegExp(`"${escapeRegExp(blockKey)}"\\s*:\\s*\\{`);
    const m = keyRe.exec(text);
    if (!m) return null;

    const openIndex = m.index + m[0].length - 1;
    const closeIndex = matchBrace(text, openIndex);
    if (closeIndex < 0) return null;

    return { openIndex, closeIndex, body: text.slice(openIndex + 1, closeIndex) };
}

/**
 * openIndex の '{' に対応する '}' の位置を返す (文字列・コメントを考慮)
 * @returns {number} 見つからなければ -1
 */
function matchBrace(text, openIndex) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = openIndex; i < text.length; i++) {
        const c = text[i];
        const next = text[i + 1];

        if (inString) {
            if (escaped) escaped = false;
            else if (c === '\\') escaped = true;
            else if (c === '"') inString = false;
            continue;
        }

        if (c === '"') { inString = true; continue; }
        if (c === '/' && next === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
        if (c === '/' && next === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i++; continue; }

        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

/**
 * ブロックの中身が (コメントを除いて) 空かどうか
 */
function isBlockEmpty(body) {
    return stripJsonc(body).trim() === '';
}

/**
 * `"blockKey": { ... }` の先頭に `"entryKey": <entryJson>` を追記する。
 * コメントを含む既存テキストをそのまま保ったままの差し込みなので .jsonc でも安全。
 *
 * @param {string} text  元のファイル内容
 * @param {string} blockKey  差し込み先ブロックのキー (例: "katana")
 * @param {string} entryKey  追加するキー (例: "my_mod:my_katana")
 * @param {string} entryJson 追加する値の JSON 表現 (例: '"my_mod:custom/saya/katana/saya_x"')
 * @param {string} [comment] エントリ直前に置く // コメント
 * @returns {string} 更新後のテキスト
 */
function insertIntoBlock(text, blockKey, entryKey, entryJson, comment) {
    const block = findBlock(text, blockKey);
    if (!block) throw new Error(`ブロック "${blockKey}" が見つかりません`);

    const indent = detectIndent(text, block.openIndex);
    const needsComma = !isBlockEmpty(block.body);

    const lines = [];
    if (comment) lines.push(`${indent}// ${comment}`);
    lines.push(`${indent}"${entryKey}": ${entryJson}${needsComma ? ',' : ''}`);

    const insertion = `\n${lines.join('\n')}`;
    return text.slice(0, block.openIndex + 1) + insertion + text.slice(block.openIndex + 1);
}

/**
 * ブロック開始行のインデントから、その中身のインデントを推定する
 */
function detectIndent(text, openIndex) {
    const lineStart = text.lastIndexOf('\n', openIndex) + 1;
    const line = text.slice(lineStart, openIndex);
    const base = (line.match(/^[ \t]*/) || [''])[0];
    return base + '  ';
}

/**
 * `"key": [ ... ]` の配列の先頭に要素を追記する。
 * @param {string} text
 * @param {string} arrayKey 配列のキー (例: "items")
 * @param {string} entryJson 追加する要素の JSON 表現 (例: '"my_mod:my_sword"')
 * @param {number} [from] 探索開始位置 (ブロック内に限定したい時に使う)
 * @returns {string}
 */
function insertIntoArray(text, arrayKey, entryJson, from = 0) {
    const re = new RegExp(`"${escapeRegExp(arrayKey)}"\\s*:\\s*\\[`);
    const m = re.exec(text.slice(from));
    if (!m) throw new Error(`配列 "${arrayKey}" が見つかりません`);

    const openIndex = from + m.index + m[0].length - 1;
    const closeIndex = matchBracket(text, openIndex);
    if (closeIndex < 0) throw new Error(`配列 "${arrayKey}" が閉じていません`);

    const body = text.slice(openIndex + 1, closeIndex);
    const needsComma = stripJsonc(body).trim() !== '';
    const indent = detectIndent(text, openIndex);

    const insertion = `\n${indent}${entryJson}${needsComma ? ',' : ''}`;
    return text.slice(0, openIndex + 1) + insertion + text.slice(openIndex + 1);
}

/** openIndex の '[' に対応する ']' の位置 */
function matchBracket(text, openIndex) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = openIndex; i < text.length; i++) {
        const c = text[i];
        const next = text[i + 1];

        if (inString) {
            if (escaped) escaped = false;
            else if (c === '\\') escaped = true;
            else if (c === '"') inString = false;
            continue;
        }

        if (c === '"') { inString = true; continue; }
        if (c === '/' && next === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
        if (c === '/' && next === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i++; continue; }

        if (c === '[') depth++;
        else if (c === ']') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

/**
 * ブロック内に指定キーが既にあるか
 */
function blockHasKey(text, blockKey, entryKey) {
    const block = findBlock(text, blockKey);
    if (!block) return false;
    const re = new RegExp(`"${escapeRegExp(entryKey)}"\\s*:`);
    return re.test(stripJsonc(block.body));
}

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
    parseJsonc,
    stripJsonc,
    findBlock,
    matchBrace,
    matchBracket,
    isBlockEmpty,
    insertIntoBlock,
    insertIntoArray,
    blockHasKey,
    escapeRegExp,
};
