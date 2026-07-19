const vscode = require('vscode');
const { WIDTH, HEIGHT, PALETTE, FRAMES } = require('./nyanFrames');

// =====================================================================
// おまけ機能: Nyan Cat
//
// サイドバー (エクスプローラー) に webview ビューを 1 枚出して、
// nyan cat をひたすら再生する遊び。
// ドット絵は klange/nyancat (https://github.com/klange/nyancat) の
// 12フレームをそのまま使い、canvas に描いてループさせる。
// 外部アセットは一切使わない (フレームデータは同梱)。
// =====================================================================

const VIEW_ID = 'mcModUtility.nyanCat';

class NyanCatViewProvider {
    /** @param {vscode.Uri} _extensionUri */
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
    }

    /** @param {vscode.WebviewView} webviewView */
    resolveWebviewView(webviewView) {
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = renderHtml();
    }
}

/** @param {vscode.ExtensionContext} context */
function registerNyanCat(context) {
    const provider = new NyanCatViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
            webviewOptions: { retainContextWhenHidden: true },
        })
    );
}

function getNonce() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
}

function renderHtml() {
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    const bg = PALETTE[',']; // 背景色 (青)

    const data = JSON.stringify({ WIDTH, HEIGHT, PALETTE, FRAMES });

    return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
:root { color-scheme: light dark; }
html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: ${bg}; }
body { display: flex; align-items: center; justify-content: center; }
canvas {
    width: 100%;
    height: auto;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    display: block;
}
</style>
</head>
<body>
<canvas id="nyan"></canvas>
<script nonce="${nonce}">
(function () {
    const { WIDTH, HEIGHT, PALETTE, FRAMES } = ${data};
    const SCALE = 8;              // 1ドットあたりの描画ピクセル
    const FRAME_MS = 90;          // klange/nyancat と同じテンポ

    // フレーム文字列を2次元配列に展開しておく
    const grids = FRAMES.map((f) => f.split('\\n'));

    const canvas = document.getElementById('nyan');
    canvas.width = WIDTH * SCALE;
    canvas.height = HEIGHT * SCALE;
    const ctx = canvas.getContext('2d');

    function draw(grid) {
        for (let r = 0; r < HEIGHT; r++) {
            const row = grid[r];
            for (let c = 0; c < WIDTH; c++) {
                const color = PALETTE[row[c]] || PALETTE[','];
                ctx.fillStyle = color;
                ctx.fillRect(c * SCALE, r * SCALE, SCALE, SCALE);
            }
        }
    }

    let i = 0;
    draw(grids[0]);
    setInterval(function () {
        i = (i + 1) % grids.length;
        draw(grids[i]);
    }, FRAME_MS);
})();
</script>
</body>
</html>`;
}

module.exports = { registerNyanCat };
