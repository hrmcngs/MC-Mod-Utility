const vscode = require('vscode');

// =====================================================================
// おまけ機能: Nyan Cat
//
// サイドバー (エクスプローラー) に webview ビューを 1 枚出して、
// レインボーを引きながら飛ぶ nyan cat をひたすら再生するだけの遊び。
// 外部アセットもスクリプトも使わず、ドット絵を SVG の矩形に展開して
// CSS アニメーションだけで動かす。
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
        webviewView.webview.html = renderHtml(webviewView.webview);
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

// --- ドット絵の色パレット -------------------------------------------------
const C = {
    K: '#000000', // 輪郭・線
    g: '#9d9d9d', // 猫のグレー
    G: '#7c7c7c', // グレーの影
    t: '#ffcc99', // ポップタルトの縁 (タン)
    p: '#ffb3d9', // フロスティング (ピンク)
    d: '#ff3d92', // タルトの粒々
    c: '#ff8fb3', // ほっぺ
    w: '#ffffff', // 目のハイライト
    // レインボー6色
    r1: '#ff1a1a', r2: '#ff9933', r3: '#ffff33', r4: '#33cc33', r5: '#3399ff', r6: '#6633ff',
};

const PX = 8; // 1ドットの大きさ

/** ドット矩形を1つ返す */
function dot(col, row, w, h, fill) {
    return `<rect x="${col * PX}" y="${row * PX}" width="${w * PX}" height="${h * PX}" fill="${fill}"/>`;
}

/** 猫本体 (胴・顔・足・しっぽ) のドット絵を組み立てる */
function buildCat() {
    const s = [];

    // しっぽ (左)
    s.push(`<g id="tail">`);
    s.push(dot(11, 10, 4, 1, C.K));
    s.push(dot(11, 11, 4, 2, C.g));
    s.push(dot(11, 13, 4, 1, C.K));
    s.push(`</g>`);

    // ポップタルト胴体: 黒枠 → タン縁 → ピンク中身
    s.push(dot(14, 4, 13, 13, C.K));
    s.push(dot(15, 5, 11, 11, C.t));
    s.push(dot(16, 6, 9, 9, C.p));
    // 粒々スプリンクル
    [[17, 7], [20, 6], [23, 8], [18, 10], [21, 11], [24, 9], [19, 13], [22, 13]]
        .forEach(([cx, cy]) => s.push(dot(cx, cy, 1, 1, C.d)));

    // 足 (4本) — パタパタ動かすので個別グループ
    const legX = [16, 19, 22, 25];
    s.push(`<g id="legs">`);
    legX.forEach((lx) => {
        s.push(dot(lx, 17, 2, 2, C.g));
        s.push(dot(lx, 19, 2, 1, C.K));
    });
    s.push(`</g>`);

    // 顔 (グレー) 黒枠 → グレー
    s.push(dot(26, 5, 9, 12, C.K));
    s.push(dot(26, 6, 8, 10, C.g));
    // 耳
    s.push(dot(27, 3, 2, 3, C.K)); s.push(dot(27, 4, 2, 2, C.g));
    s.push(dot(31, 3, 2, 3, C.K)); s.push(dot(31, 4, 2, 2, C.g));
    // 目 (黒 + 白ハイライト)
    s.push(dot(28, 9, 2, 3, C.K)); s.push(dot(28, 9, 1, 1, C.w));
    s.push(dot(31, 9, 2, 3, C.K)); s.push(dot(31, 9, 1, 1, C.w));
    // ほっぺ
    s.push(dot(27, 11, 1, 2, C.c));
    s.push(dot(33, 11, 1, 2, C.c));
    // 口 (にっこり)
    s.push(dot(29, 13, 3, 1, C.K));
    s.push(dot(29, 12, 1, 1, C.K));
    s.push(dot(31, 12, 1, 1, C.K));

    return s.join('');
}

/** レインボー: 6色の帯を縦スライスに分割し、偶数/奇数列を上下に揺らして「うねり」を作る */
function buildRainbow() {
    const bands = [C.r1, C.r2, C.r3, C.r4, C.r5, C.r6]; // 上から
    const startRow = 5;      // 帯の開始行
    const bandH = 2;         // 1色あたり2ドット
    const cols = 14;         // 横14ドット
    const even = [];
    const odd = [];
    for (let cx = 0; cx < cols; cx++) {
        const target = (cx % 2 === 0) ? even : odd;
        bands.forEach((color, i) => {
            const row = startRow + i * bandH;
            // 上端・下端は少し伸ばして、揺れても背景が覗かないようにする
            const h = bandH + (i === 0 ? 1 : 0) + (i === bands.length - 1 ? 1 : 0);
            const r0 = row - (i === 0 ? 1 : 0);
            target.push(dot(cx, r0, 1, h, color));
        });
    }
    return `<g class="rb rbA">${even.join('')}</g><g class="rb rbB">${odd.join('')}</g>`;
}

/** @param {vscode.Webview} webview */
function renderHtml(webview) {
    const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:;`;
    const vbW = 36 * PX;
    const vbH = 22 * PX;
    const sprite = buildRainbow() + buildCat();

    return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
:root { color-scheme: light dark; }
html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
body {
    background: #0d2b5e;
    display: flex;
    align-items: center;
    justify-content: center;
}
/* 星が流れる夜空 */
#sky {
    position: absolute;
    inset: 0;
    background-image:
        radial-gradient(1px 1px at 20px 30px, #fff, transparent),
        radial-gradient(2px 2px at 80px 70px, #fff, transparent),
        radial-gradient(1px 1px at 130px 20px, #fff, transparent),
        radial-gradient(1px 1px at 170px 90px, #fff, transparent),
        radial-gradient(2px 2px at 50px 110px, #fff, transparent),
        radial-gradient(1px 1px at 110px 140px, #fff, transparent);
    background-size: 200px 160px;
    background-repeat: repeat;
    animation: stars 5s linear infinite;
    opacity: 0.85;
}
@keyframes stars { from { background-position: 0 0; } to { background-position: -200px 0; } }

/* 上下にゆらゆら飛ぶ nyan cat 本体 */
#nyan {
    position: relative;
    width: 88%;
    max-width: 300px;
}
svg { display: block; width: 100%; height: auto; }
#nyan { animation: bob 0.5s steps(2) infinite; }
@keyframes bob { 0%,100% { transform: translateY(-4px); } 50% { transform: translateY(4px); } }

/* レインボーのうねり: 偶数列と奇数列を逆位相で上下させる */
.rb { animation-duration: 0.4s; animation-timing-function: steps(1); animation-iteration-count: infinite; }
.rbA { animation-name: wobbleA; }
.rbB { animation-name: wobbleB; }
@keyframes wobbleA { 0%,49% { transform: translateY(0); } 50%,100% { transform: translateY(6px); } }
@keyframes wobbleB { 0%,49% { transform: translateY(6px); } 50%,100% { transform: translateY(0); } }

/* しっぽパタパタ */
#tail { transform-origin: 120px 92px; animation: tail 0.5s steps(2) infinite; }
@keyframes tail { 0%,100% { transform: rotate(-10deg); } 50% { transform: rotate(6deg); } }
/* 足パタパタ */
#legs { animation: legs 0.35s steps(2) infinite; }
@keyframes legs { 0%,100% { transform: translateY(0); } 50% { transform: translateY(3px); } }
</style>
</head>
<body>
<div id="sky"></div>
<div id="nyan">
<svg viewBox="0 0 ${vbW} ${vbH}" shape-rendering="crispEdges">
${sprite}
</svg>
</div>
</body>
</html>`;
}

module.exports = { registerNyanCat };
