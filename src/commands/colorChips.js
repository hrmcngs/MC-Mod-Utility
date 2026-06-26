const vscode = require('vscode');

// 対応フォーマット:
//   #RGB        / #RRGGBB    / #AARRGGBB   (CSS/Java 風)
//   0xRRGGBB    / 0xAARRGGBB                (Java int 風、Minecraft 慣例で alpha 先頭)
// 単語境界で囲まれた箇所のみ。識別子の途中 (例: foo#abcdef) は除外。
const HEX_COLOR_RE = /(?<![\w#])(#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})|0[xX](?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}))(?!\w)/g;

function parseHex(text) {
    let body, prefix;
    if (text.startsWith('#')) {
        prefix = '#';
        body = text.slice(1);
    } else {
        prefix = text.slice(0, 2);
        body = text.slice(2);
    }

    if (body.length === 3) {
        body = body.split('').map((c) => c + c).join('');
    }

    let r, g, b, a;
    if (body.length === 6) {
        r = parseInt(body.slice(0, 2), 16);
        g = parseInt(body.slice(2, 4), 16);
        b = parseInt(body.slice(4, 6), 16);
        a = 255;
    } else if (body.length === 8) {
        // Minecraft / Java の慣例で alpha 先頭 (AARRGGBB)
        a = parseInt(body.slice(0, 2), 16);
        r = parseInt(body.slice(2, 4), 16);
        g = parseInt(body.slice(4, 6), 16);
        b = parseInt(body.slice(6, 8), 16);
    } else {
        return null;
    }

    return { r: r / 255, g: g / 255, b: b / 255, a: a / 255, prefix, length: body.length };
}

function byteHex(value) {
    return Math.round(value * 255).toString(16).padStart(2, '0');
}

function matchCase(original, hex) {
    // 元のテキストが大文字なら大文字に揃える
    const isUpper = original === original.toUpperCase();
    return isUpper ? hex.toUpperCase() : hex.toLowerCase();
}

const colorProvider = {
    provideDocumentColors(document) {
        const result = [];
        const text = document.getText();
        const re = new RegExp(HEX_COLOR_RE.source, 'g');
        let match;
        while ((match = re.exec(text)) !== null) {
            const parsed = parseHex(match[0]);
            if (!parsed) continue;
            const start = document.positionAt(match.index);
            const end = document.positionAt(match.index + match[0].length);
            result.push(new vscode.ColorInformation(
                new vscode.Range(start, end),
                new vscode.Color(parsed.r, parsed.g, parsed.b, parsed.a)
            ));
        }
        return result;
    },

    provideColorPresentations(color, context) {
        const original = context.document.getText(context.range);
        const r = byteHex(color.red);
        const g = byteHex(color.green);
        const b = byteHex(color.blue);
        const a = byteHex(color.alpha);
        const hasAlpha = color.alpha < 1;

        // 元の表記スタイルを保ったまま値だけ差し替える
        let body;
        if (original.startsWith('#')) {
            body = '#' + (hasAlpha ? a + r + g + b : r + g + b);
        } else {
            const prefix = original.slice(0, 2); // 0x or 0X
            body = prefix + (hasAlpha ? a + r + g + b : r + g + b);
        }

        return [new vscode.ColorPresentation(matchCase(original, body))];
    },
};

function register(context) {
    // scheme で絞り、言語は問わない (Java/Kotlin/JSON/YAML/MD etc.)
    const selector = [{ scheme: 'file' }, { scheme: 'untitled' }];
    context.subscriptions.push(
        vscode.languages.registerColorProvider(selector, colorProvider)
    );
}

module.exports = { register, parseHex, HEX_COLOR_RE };
