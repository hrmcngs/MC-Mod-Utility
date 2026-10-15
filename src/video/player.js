const vscode = require('vscode');
const crypto = require('crypto');

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function renderPlayer(webview, uri) {
    const files = await vscode.workspace.findFiles('**/*.{webm,WEBM}', '**/{node_modules,.git,build}/**', 200);
    const videos = [uri, ...files.filter(file => file.toString() !== uri.toString())];
    webview.options = {
        enableScripts: true,
        localResourceRoots: videos.map(file => vscode.Uri.joinPath(file, '..')),
    };
    const nonce = crypto.randomBytes(18).toString('base64');
    const entries = videos.map(file => ({
        name: file.path.split('/').pop(),
        path: vscode.workspace.asRelativePath(file),
        src: webview.asWebviewUri(file).toString(),
    }));
    const data = JSON.stringify(entries).replace(/</g, '\\u003c');
    webview.html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src ${webview.cspSource}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<title>${escapeHtml(entries[0].name)}</title>
<style nonce="${nonce}">
*{box-sizing:border-box}body{margin:0;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);font-family:var(--vscode-font-family),sans-serif}header{display:flex;align-items:center;gap:24px;padding:18px 24px;border-bottom:1px solid var(--vscode-panel-border)}.brand{font-size:19px;font-weight:700;white-space:nowrap}.logo{display:inline-block;background:#e53935;color:white;padding:3px 10px;border-radius:8px;margin-right:8px}input{width:100%;max-width:520px;padding:10px 16px;border:1px solid var(--vscode-input-border,var(--vscode-panel-border));border-radius:24px;background:var(--vscode-input-background);color:var(--vscode-input-foreground)}main{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:24px;max-width:1600px;padding:24px;margin:auto}video{width:100%;max-height:70vh;aspect-ratio:16/9;background:#000;border-radius:12px}h1{font-size:21px;margin:18px 0 8px;overflow-wrap:anywhere}.path{font-size:12px;opacity:.7;overflow-wrap:anywhere}.toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:20px;padding:14px 0;border-top:1px solid var(--vscode-panel-border)}button,select{font:inherit;color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground);border:0;border-radius:8px;padding:9px 12px;cursor:pointer}button:hover{background:var(--vscode-button-secondaryHoverBackground)}:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:3px}h2{font-size:16px;margin:0 0 16px}.item{display:flex;gap:12px;width:100%;text-align:left;margin-bottom:10px;padding:10px;background:transparent}.item[aria-current="true"]{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}.thumb{display:grid;place-items:center;flex:0 0 88px;height:54px;background:#252525;border-radius:6px;color:#fff}.details{min-width:0}.name{display:block;font-weight:600;overflow-wrap:anywhere}.tag{display:block;font-size:11px;opacity:.65;margin-top:6px}#status{margin-top:14px;line-height:1.6}#empty,.hint{font-size:12px;opacity:.7}.hint{line-height:1.7}button[aria-pressed="true"]{outline:2px solid var(--vscode-focusBorder)}@media(max-width:850px){main{grid-template-columns:1fr;padding:16px}header{flex-wrap:wrap;padding:16px}input{max-width:none}video{max-height:60vh}}
</style></head><body>
<header><div class="brand"><span class="logo">▶</span>WebM Player</div><input id="search" type="search" placeholder="動画を検索" aria-label="動画一覧を検索"></header>
<main><section aria-label="動画プレーヤー"><video id="video" controls playsinline preload="metadata"></video><h1 id="title"></h1><div id="path" class="path"></div><div class="toolbar"><button id="open">＋ 動画を開く</button><button id="retry">再読み込み</button><label>再生速度 <select id="speed" aria-label="再生速度"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>標準</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label><button id="loop" aria-pressed="false">ループ</button></div><div id="status" role="status"></div><p class="hint">再生画面にフォーカスすると、標準の動画コントロールをキーボードでも操作できます。</p></section>
<aside><h2>ワークスペースの動画 <span id="count"></span></h2><div id="list"></div><p id="empty" hidden>一致する動画がありません。</p><p class="hint">WebMを最大200件表示。追加した動画はエディターを開き直すと反映されます。</p></aside></main>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const entries = ${data};
const video = document.getElementById('video');
const list = document.getElementById('list');
let selected = 0;
function select(index) {
 selected = index;
 document.getElementById('status').textContent = '動画を読み込んでいます…';
 video.src = entries[index].src;
 video.load();
 video.playbackRate = Number(document.getElementById('speed').value);
 document.getElementById('title').textContent = entries[index].name;
 document.getElementById('path').textContent = entries[index].path;
 draw();
}
function draw() {
 const query = document.getElementById('search').value.toLowerCase();
 list.replaceChildren();
 entries.forEach((entry, index) => {
  if (!entry.path.toLowerCase().includes(query)) return;
  const button = document.createElement('button'); button.className = 'item';
  button.setAttribute('aria-current', String(index === selected));
  const thumb = document.createElement('span'); thumb.className = 'thumb'; thumb.textContent = '▶'; thumb.setAttribute('aria-hidden', 'true');
  const details = document.createElement('span'); details.className = 'details';
  const name = document.createElement('span'); name.className = 'name'; name.textContent = entry.name;
  const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = entry.path;
  details.append(name, tag); button.append(thumb, details); button.addEventListener('click', () => select(index)); list.append(button);
 });
 document.getElementById('empty').hidden = list.childElementCount !== 0;
 document.getElementById('count').textContent = '(' + list.childElementCount + ')';
}
document.getElementById('search').addEventListener('input', draw);
document.getElementById('open').addEventListener('click', () => vscode.postMessage({type:'open'}));
document.getElementById('speed').addEventListener('change', event => { video.playbackRate = Number(event.target.value); });
document.getElementById('loop').addEventListener('click', event => { video.loop = !video.loop; event.currentTarget.setAttribute('aria-pressed', String(video.loop)); });
document.getElementById('retry').addEventListener('click', () => select(selected));
video.addEventListener('loadedmetadata', () => {
 document.getElementById('status').textContent = '';
 video.playbackRate = Number(document.getElementById('speed').value);
});
video.addEventListener('error', () => {
 const error = video.error;
 const reasons = {
  1: '読み込みが中断されました。再読み込みを試してください。',
  2: '動画ファイルの読み込みに失敗しました。ファイルの場所とアクセス権を確認してください。',
  3: '動画のデコードに失敗しました。動画の破損や非対応のコーデックが考えられます。',
  4: '動画の形式が非対応、または動画ファイルにアクセスできません。'
 };
 document.getElementById('status').textContent = '再生エラー: ' + (reasons[error?.code] || '原因不明') + ' [code=' + (error?.code ?? 'unknown') + '] ' + (error?.message || '');
});
select(0);
</script></body></html>`;
}

function registerVideoPlayer(context) {
    const open = async (uri) => {
        if (!uri) {
            const files = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'WebM 動画': ['webm'] } });
            uri = files && files[0];
        }
        if (uri) await vscode.commands.executeCommand('vscode.openWith', uri, 'mcModUtility.webmPlayer');
    };
    context.subscriptions.push(
        vscode.commands.registerCommand('mc-mod-utility.openVideo', open),
        vscode.window.registerCustomEditorProvider('mcModUtility.webmPlayer', {
            openCustomDocument: uri => ({ uri, dispose() {} }),
            async resolveCustomEditor(document, panel) {
                panel.webview.onDidReceiveMessage(message => {
                    if (message.type === 'open') void open();
                }, undefined, context.subscriptions);
                await renderPlayer(panel.webview, document.uri);
            },
        }, { webviewOptions: { retainContextWhenHidden: true } })
    );
}

module.exports = { registerVideoPlayer };
