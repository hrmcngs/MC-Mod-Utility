const vscode = require('vscode');

// =====================================================================
// おまけ機能: Nyan Cat
//
// サイドバー (エクスプローラー) に webview ビューを 1 枚出して、
// レインボーを引きながら飛ぶ nyan cat をひたすら再生するだけの遊び。
// 外部アセットは一切使わず、SVG + CSS アニメーションで完結させる。
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

/** @param {vscode.Webview} webview */
function renderHtml(webview) {
    const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:;`;
    return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
:root { color-scheme: light dark; }
html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
body {
    background: #0b0a1a;
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
        radial-gradient(1px 1px at 80px 70px, #fff, transparent),
        radial-gradient(2px 2px at 130px 20px, #fff, transparent),
        radial-gradient(1px 1px at 170px 90px, #fff, transparent),
        radial-gradient(1px 1px at 50px 110px, #fff, transparent),
        radial-gradient(2px 2px at 110px 130px, #fff, transparent);
    background-size: 200px 160px;
    background-repeat: repeat;
    animation: stars 6s linear infinite;
    opacity: 0.7;
}
@keyframes stars { from { background-position: 0 0; } to { background-position: -200px 0; } }

/* 上下にゆらゆら飛ぶ nyan cat 本体 */
#nyan {
    position: relative;
    width: 220px;
    animation: bob 0.6s steps(2) infinite;
}
@keyframes bob { 0%,100% { transform: translateY(-4px); } 50% { transform: translateY(4px); } }

svg { display: block; width: 100%; height: auto; }

/* レインボーの各セグメントを 1 コマずつずらして波打たせる */
.rb { animation: rbwave 0.4s steps(1) infinite; }
.rb:nth-child(1) { animation-delay: 0s; }
.rb:nth-child(2) { animation-delay: 0.1s; }
.rb:nth-child(3) { animation-delay: 0.2s; }
.rb:nth-child(4) { animation-delay: 0.3s; }
@keyframes rbwave { 0% { transform: translateY(0); } 50% { transform: translateY(6px); } 100% { transform: translateY(0); } }

/* しっぽ・足パタパタ */
#tail { transform-origin: 30px 62px; animation: tail 0.5s steps(2) infinite; }
@keyframes tail { 0%,100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } }
#legs rect { animation: legs 0.4s steps(2) infinite; }
@keyframes legs { 0%,100% { transform: translateY(0); } 50% { transform: translateY(2px); } }
</style>
</head>
<body>
<div id="sky"></div>
<div id="nyan">
<svg viewBox="0 0 220 120" shape-rendering="crispEdges">
  <!-- レインボー (左へたなびく) -->
  <g>
    <g class="rb"><rect x="0"  y="46" width="26" height="7" fill="#ff0000"/><rect x="0"  y="53" width="26" height="7" fill="#ff9900"/><rect x="0"  y="60" width="26" height="7" fill="#ffff00"/><rect x="0"  y="67" width="26" height="7" fill="#33ff00"/><rect x="0"  y="74" width="26" height="7" fill="#0099ff"/><rect x="0"  y="81" width="26" height="7" fill="#6633ff"/></g>
    <g class="rb"><rect x="26" y="46" width="26" height="7" fill="#ff0000"/><rect x="26" y="53" width="26" height="7" fill="#ff9900"/><rect x="26" y="60" width="26" height="7" fill="#ffff00"/><rect x="26" y="67" width="26" height="7" fill="#33ff00"/><rect x="26" y="74" width="26" height="7" fill="#0099ff"/><rect x="26" y="81" width="26" height="7" fill="#6633ff"/></g>
    <g class="rb"><rect x="52" y="46" width="26" height="7" fill="#ff0000"/><rect x="52" y="53" width="26" height="7" fill="#ff9900"/><rect x="52" y="60" width="26" height="7" fill="#ffff00"/><rect x="52" y="67" width="26" height="7" fill="#33ff00"/><rect x="52" y="74" width="26" height="7" fill="#0099ff"/><rect x="52" y="81" width="26" height="7" fill="#6633ff"/></g>
    <g class="rb"><rect x="78" y="46" width="26" height="7" fill="#ff0000"/><rect x="78" y="53" width="26" height="7" fill="#ff9900"/><rect x="78" y="60" width="26" height="7" fill="#ffff00"/><rect x="78" y="67" width="26" height="7" fill="#33ff00"/><rect x="78" y="74" width="26" height="7" fill="#0099ff"/><rect x="78" y="81" width="26" height="7" fill="#6633ff"/></g>
  </g>

  <!-- しっぽ -->
  <g id="tail"><rect x="18" y="58" width="16" height="8" fill="#9d9d9d" stroke="#000" stroke-width="2"/></g>

  <!-- ポップタルトの胴体 -->
  <g>
    <rect x="104" y="44" width="70" height="52" rx="6" fill="#ff9db0" stroke="#000" stroke-width="3"/>
    <rect x="112" y="52" width="54" height="36" fill="#febcd3"/>
    <!-- スプリンクル -->
    <rect x="120" y="58" width="5" height="5" fill="#ff4d94"/>
    <rect x="140" y="66" width="5" height="5" fill="#4d94ff"/>
    <rect x="152" y="56" width="5" height="5" fill="#ffe14d"/>
    <rect x="128" y="76" width="5" height="5" fill="#4dff88"/>
    <rect x="150" y="78" width="5" height="5" fill="#ff4d94"/>
    <rect x="134" y="60" width="5" height="5" fill="#b84dff"/>
  </g>

  <!-- 足 -->
  <g id="legs" fill="#9d9d9d" stroke="#000" stroke-width="2">
    <rect x="112" y="92" width="12" height="12"/>
    <rect x="130" y="92" width="12" height="12"/>
    <rect x="148" y="92" width="12" height="12"/>
    <rect x="166" y="92" width="12" height="12"/>
  </g>

  <!-- 顔 -->
  <g>
    <rect x="170" y="42" width="40" height="40" rx="8" fill="#9d9d9d" stroke="#000" stroke-width="3"/>
    <!-- 耳 -->
    <path d="M172 44 L172 32 L184 44 Z" fill="#9d9d9d" stroke="#000" stroke-width="2"/>
    <path d="M208 44 L208 32 L196 44 Z" fill="#9d9d9d" stroke="#000" stroke-width="2"/>
    <!-- 目 -->
    <rect x="180" y="54" width="8" height="10" fill="#000"/>
    <rect x="182" y="56" width="3" height="3" fill="#fff"/>
    <rect x="194" y="54" width="8" height="10" fill="#000"/>
    <rect x="196" y="56" width="3" height="3" fill="#fff"/>
    <!-- ほっぺ -->
    <circle cx="178" cy="70" r="4" fill="#ff8fb3"/>
    <circle cx="204" cy="70" r="4" fill="#ff8fb3"/>
    <!-- 口 -->
    <rect x="188" y="68" width="6" height="4" fill="#000"/>
    <rect x="186" y="72" width="10" height="2" fill="#000"/>
    <!-- ひげ -->
    <rect x="168" y="62" width="10" height="2" fill="#000"/>
    <rect x="168" y="68" width="10" height="2" fill="#000"/>
    <rect x="204" y="62" width="10" height="2" fill="#000"/>
    <rect x="204" y="68" width="10" height="2" fill="#000"/>
  </g>
</svg>
</div>
</body>
</html>`;
}

module.exports = { registerNyanCat };
