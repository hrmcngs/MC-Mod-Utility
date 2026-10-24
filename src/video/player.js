const { sortVideos } = require('./videoOrder');
const vscode = require('vscode');
const crypto = require('crypto');
const { createVideoServer } = require('./streamServer');
const { compatibleVideo } = require('./compatibility');
const { videoThumbnail } = require('./thumbnail');

const iconPaths = {
    play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M7 5h3v14H7zm7 0h3v14h-3z" fill="currentColor" stroke="none"/>',
    volume: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    muted: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6m0-6-5 6"/>',
    theater: '<rect x="3" y="5" width="18" height="14" rx="1"/>',
    fullscreen: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',
    exitFullscreen: '<path d="M3 9h6V3m6 0v6h6M9 21v-6H3m12 6v-6h6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
};
const icons = Object.fromEntries(Object.entries(iconPaths).map(([name, paths]) => [name,
    `<svg class="icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`
]));

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function getVideoIssue(uri) {
    try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.size === 0) return '動画ファイルが空です。ダウンロードを完了してから再度開いてください。';
        if (stat.size <= 1024) {
            const contents = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
            if (contents.startsWith('version https://git-lfs.github.com/spec/v1')) {
                return '動画本体が未取得です（Git LFS参照ファイル）。この動画があるリポジトリで git lfs pull を実行し、エディターを開き直してください。';
            }
        }
        return '';
    } catch {
        return '動画ファイルにアクセスできません。ファイルの場所とアクセス権を確認してください。';
    }
}

async function renderPlayer(webview, uri, streamServer, cacheDirectory, disposables) {
    const files = await vscode.workspace.findFiles('**/*.{webm,WEBM}', '**/{node_modules,.git,build}/**', 200);
    const videos = sortVideos([uri, ...files.filter(file => file.toString() !== uri.toString())]);
    const initialIndex = videos.findIndex(file => file.toString() === uri.toString());
    webview.options = {
        enableScripts: true,
        localResourceRoots: videos.map(file => vscode.Uri.joinPath(file, '..')),
    };
    const nonce = crypto.randomBytes(18).toString('base64');
    const entries = await Promise.all(videos.map(async file => ({
        name: file.path.split('/').pop(),
        path: vscode.workspace.asRelativePath(file),
        src: streamServer && file.scheme === 'file' ? streamServer.add(file.fsPath) : webview.asWebviewUri(file).toString(),
        canPrepare: !!streamServer && file.scheme === 'file',
        issue: await getVideoIssue(file),
        thumbnail: streamServer && file.scheme === 'file' ? streamServer.add(file.fsPath, {
            contentType: 'image/jpeg', prepare: () => videoThumbnail(file.fsPath, cacheDirectory),
        }) : null,
    })));
    if (streamServer) disposables.push(webview.onDidReceiveMessage(async message => {
        if (message.type !== 'prepare' || !Number.isInteger(message.index) || !Number.isSafeInteger(message.requestId)) return;
        const file = videos[message.index];
        if (!file || file.scheme !== 'file' || entries[message.index].issue) return;
        try {
            const prepared = await compatibleVideo(file.fsPath, cacheDirectory);
            const src = streamServer.add(prepared, { contentType: 'video/webm' });
            await webview.postMessage({ type: 'sourceReady', requestId: message.requestId, src });
        } catch (error) {
            await webview.postMessage({ type: 'prepareError', requestId: message.requestId, message: error.message });
        }
    }));
    const data = JSON.stringify(entries).replace(/</g, '\\u003c');
    webview.html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} ${streamServer ? streamServer.origin : ''}; media-src ${webview.cspSource} ${streamServer ? streamServer.origin : ''}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<title>${escapeHtml(entries[initialIndex].name)}</title>
<style nonce="${nonce}">
*{box-sizing:border-box}body{margin:0;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);font-family:var(--vscode-font-family),sans-serif}header{display:flex;align-items:center;gap:24px;padding:18px 24px;border-bottom:1px solid var(--vscode-panel-border)}.brand{font-size:19px;font-weight:700;white-space:nowrap}.logo{display:inline-block;background:#e53935;color:white;padding:3px 10px;border-radius:8px;margin-right:8px}input{width:100%;max-width:520px;padding:10px 16px;border:1px solid var(--vscode-input-border,var(--vscode-panel-border));border-radius:24px;background:var(--vscode-input-background);color:var(--vscode-input-foreground)}main{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:24px;max-width:1600px;padding:24px;margin:auto}video{width:100%;max-height:70vh;aspect-ratio:16/9;background:#000;border-radius:12px}h1{font-size:21px;margin:18px 0 8px;overflow-wrap:anywhere}.path{font-size:12px;opacity:.7;overflow-wrap:anywhere}.toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:20px;padding:14px 0;border-top:1px solid var(--vscode-panel-border)}button,select{font:inherit;color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground);border:0;border-radius:8px;padding:9px 12px;cursor:pointer}button:hover{background:var(--vscode-button-secondaryHoverBackground)}:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:3px}h2{font-size:16px;margin:0 0 16px}.item{display:flex;gap:12px;width:100%;text-align:left;margin-bottom:10px;padding:10px;background:transparent}.item[aria-current="true"]{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}.thumb{display:grid;place-items:center;flex:0 0 88px;height:54px;background:#252525;border-radius:6px;color:#fff}.details{min-width:0}.name{display:block;font-weight:600;overflow-wrap:anywhere}.tag{display:block;font-size:11px;opacity:.65;margin-top:6px}#status{margin-top:14px;line-height:1.6}#empty,.hint{font-size:12px;opacity:.7}.hint{line-height:1.7}button[aria-pressed="true"]{outline:2px solid var(--vscode-focusBorder)}@media(max-width:850px){main{grid-template-columns:1fr;padding:16px}header{flex-wrap:wrap;padding:16px}input{max-width:none}video{max-height:60vh}}
body.expanded{overflow:hidden}body.expanded header,body.expanded aside,body.expanded h1,body.expanded .path,body.expanded .hint{display:none}body.expanded main{display:block;max-width:none;padding:0}body.expanded video{position:fixed;inset:0;width:100vw;height:100vh;max-height:none;aspect-ratio:auto;object-fit:contain;border-radius:0}body.expanded .toolbar{position:fixed;top:12px;right:12px;z-index:2;border:0;background:var(--vscode-editor-background);border-radius:8px;padding:8px;margin:0}body.expanded .toolbar>:not(#fullscreen):not(#windowFullscreen){display:none}body.expanded #status{position:fixed;top:70px;left:16px;right:16px;z-index:2}
.playback{display:flex;align-items:center;gap:10px;padding:10px;background:var(--vscode-editor-background);border-radius:8px;flex-wrap:wrap}.playback input[type=range]{padding:0;border:0;border-radius:0;cursor:pointer;accent-color:#e53935}#seek{flex:1;min-width:90px;max-width:none}#volume{width:90px}#time{font-variant-numeric:tabular-nums;font-size:12px}body.expanded .playback{position:fixed;bottom:0;left:0;right:0;z-index:3;border-radius:0}body.expanded{background:#000}body.expanded video{height:100vh}body.expanded .toolbar{display:none}body.expanded .playback{color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.85));padding:35px 20px 15px;transition:opacity .2s}body.expanded .playback button{color:#fff;background:transparent}body.expanded.controls-hidden{cursor:none}body.expanded.controls-hidden .playback{opacity:0;pointer-events:none}body.expanded #expandControl{display:none}
.stage{position:relative;width:100%;aspect-ratio:16/9;max-height:70vh;background:#000;border-radius:12px;overflow:hidden}.stage video{display:block;width:100%;height:100%;max-height:none;aspect-ratio:auto;object-fit:contain}.playback{position:absolute;bottom:0;left:0;right:0;z-index:5;display:flex;flex-wrap:wrap;gap:6px;padding:36px 16px 10px;background:linear-gradient(transparent,rgba(0,0,0,.8));color:#fff;border-radius:0;transition:opacity .18s}.playback button{background:transparent;color:#fff;border-radius:4px;min-width:38px;height:36px;padding:4px;font-size:23px}.playback button:hover{background:rgba(255,255,255,.18)}#seek{order:-1;flex:none;width:100%;height:16px;min-width:0;margin:0;accent-color:#f03;cursor:pointer}#volume{width:74px;accent-color:#fff;background:transparent}#time{font-size:13px;margin-left:8px;white-space:nowrap}#mute{order:1}#volume{order:2}#time{order:3}#expandControl{order:4;margin-left:auto}#fullControl{order:5}.controls-hidden .playback{opacity:0;pointer-events:none}.stage .playback:has(:focus-visible){opacity:1;pointer-events:auto}body.expanded .stage{position:fixed;inset:0;width:100vw;height:100vh;max-height:none;border-radius:0}body.expanded .stage video{position:absolute;inset:0;width:100%;height:100%}body.expanded #fullControl{margin-left:auto}body.expanded .playback{position:absolute;padding:36px 20px 14px}@media(max-width:500px){#volume{width:50px}.playback{padding-left:8px;padding-right:8px;gap:3px}#time{font-size:11px}}
.thumb{overflow:hidden;position:relative}.thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.icon{display:inline-block;vertical-align:middle;flex-shrink:0}.playback button{display:inline-flex;align-items:center;justify-content:center}.logo{display:inline-flex;align-items:center;justify-content:center}#open .icon{width:18px;height:18px}
</style></head><body>
<header><div class="brand"><span class="logo">${icons.play}</span>WebM Player</div><input id="search" type="search" placeholder="動画を検索" aria-label="動画一覧を検索"></header>
<main><section aria-label="動画プレーヤー"><div class="stage"><video id="video" playsinline preload="metadata"></video><div class="playback" aria-label="再生操作"><button id="play" aria-label="再生">${icons.play}</button><span id="time">0:00 / 0:00</span><input id="seek" type="range" min="0" max="1000" value="0" aria-label="再生位置"><button id="mute" title="ミュート" aria-label="ミュート" aria-pressed="false">${icons.volume}</button><input id="volume" type="range" min="0" max="1" step="0.01" value="1" aria-label="音量"><button id="expandControl" title="シアターモード" aria-label="シアターモード">${icons.theater}</button><button id="fullControl" title="全画面" aria-label="全画面">${icons.fullscreen}</button></div></div><h1 id="title"></h1><div id="path" class="path"></div><div class="toolbar"><button id="open">${icons.plus} 動画を開く</button><button id="retry">再読み込み</button><button id="compatible">互換再生</button><label>再生速度 <select id="speed" aria-label="再生速度"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>標準</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label><button id="loop" aria-pressed="false">ループ</button><button id="fullscreen" aria-pressed="false">動画を拡大</button><button id="windowFullscreen">全画面</button></div><div id="status" role="status">動画プレーヤーを起動しています…</div><p class="hint">再生画面にフォーカスすると、標準の動画コントロールをキーボードでも操作できます。</p></section>
<aside><h2>ワークスペースの動画 <span id="count"></span></h2><div id="list"></div><p id="empty" hidden>一致する動画がありません。</p><p class="hint">WebMを最大200件表示。追加した動画はエディターを開き直すと反映されます。</p></aside></main>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const entries = ${data};
const icons = ${JSON.stringify(icons)};
const video = document.getElementById('video');
const list = document.getElementById('list');
function formatTime(seconds) {
 if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
 const minutes = Math.floor(seconds / 60);
 return minutes + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
}
function updatePlayback() {
 document.getElementById('play').innerHTML = video.paused ? icons.play : icons.pause;
 document.getElementById('play').setAttribute('aria-label', video.paused ? '再生' : '一時停止');
 document.getElementById('time').textContent = formatTime(video.currentTime) + ' / ' + formatTime(video.duration);
 document.getElementById('seek').value = video.duration > 0 ? String(video.currentTime / video.duration * 1000) : '0';
 document.getElementById('mute').innerHTML = video.muted || video.volume === 0 ? icons.muted : icons.volume;
 document.getElementById('mute').setAttribute('aria-pressed', String(video.muted));
 document.getElementById('volume').value = String(video.volume);
}
document.getElementById('play').addEventListener('click', async () => {
 if (preparing) { document.getElementById('status').textContent = '互換動画を準備しています。完了までお待ちください。'; return; }
 if (video.paused) {
  try { await video.play(); } catch (error) { document.getElementById('status').textContent = '再生できません: ' + error.message; }
 } else video.pause();
});
document.getElementById('seek').addEventListener('input', event => {
 if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Number(event.target.value) / 1000 * video.duration;
});
document.getElementById('mute').addEventListener('click', () => { video.muted = !video.muted; });
document.getElementById('volume').addEventListener('input', event => { video.volume = Number(event.target.value); video.muted = video.volume === 0; });
document.getElementById('expandControl').addEventListener('click', () => expandVideo(!document.body.classList.contains('expanded')));
document.getElementById('fullControl').addEventListener('click', toggleFullscreen);
for (const event of ['timeupdate', 'durationchange', 'play', 'pause', 'volumechange', 'loadedmetadata', 'emptied']) video.addEventListener(event, updatePlayback);
let selected = ${initialIndex};
let requestId = 0;
let preparing = false;
function select(index, compatible = false) {
 selected = index;
 requestId++;
 preparing = !entries[index].issue && compatible && entries[index].canPrepare;
 if (preparing) entries[index].compatibilityAttempted = true;
 document.getElementById('compatible').disabled = !entries[index].canPrepare || preparing;
 video.poster = entries[index].thumbnail || '';
 video.pause();
 document.getElementById('status').textContent = preparing
  ? '互換動画を準備しています…（音声を変換しています）'
  : '動画を読み込んでいます…';
 if (entries[index].issue) {
  video.removeAttribute('src');
  video.load();
 } else if (preparing) {
 video.removeAttribute('src');
 video.load();
 vscode.postMessage({ type: 'prepare', index, requestId });
 } else {
 video.src = entries[index].src;
 video.load();
 }
 video.playbackRate = Number(document.getElementById('speed').value);
 document.getElementById('title').textContent = entries[index].name;
 document.getElementById('path').textContent = entries[index].path;
 if (entries[index].issue) document.getElementById('status').textContent = entries[index].issue;
 draw();
}
function draw() {
 const query = document.getElementById('search').value.toLowerCase();
 list.replaceChildren();
 entries.forEach((entry, index) => {
  if (!entry.path.toLowerCase().includes(query)) return;
  const button = document.createElement('button'); button.className = 'item';
  button.setAttribute('aria-current', String(index === selected));
  const thumb = document.createElement('span'); thumb.className = 'thumb'; thumb.innerHTML = icons.play; thumb.setAttribute('aria-hidden', 'true');
  if (entry.thumbnail && !entry.issue) {
   const image = document.createElement('img'); image.alt = ''; image.loading = 'lazy'; image.src = entry.thumbnail;
   image.addEventListener('error', () => image.remove());
   thumb.append(image);
  }
  const details = document.createElement('span'); details.className = 'details';
  const name = document.createElement('span'); name.className = 'name'; name.textContent = entry.name;
  const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = entry.path;
  details.append(name, tag); button.append(thumb, details); button.addEventListener('click', () => select(index)); list.append(button);
 });
 document.getElementById('empty').hidden = list.childElementCount !== 0;
 document.getElementById('count').textContent = '(' + list.childElementCount + ')';
}
let immersive = false;
let usingHostFullscreen = false;
let hideControlsTimer;
function showControls() {
 document.body.classList.remove('controls-hidden');
 clearTimeout(hideControlsTimer);
 if (!video.paused) hideControlsTimer = setTimeout(() => document.body.classList.add('controls-hidden'), 2500);
}
async function exitFullscreen() {
 immersive = false;
 if (document.fullscreenElement) await document.exitFullscreen();
 if (usingHostFullscreen) {
  usingHostFullscreen = false;
  vscode.postMessage({ type: 'immersive', enabled: false });
 }
 expandVideo(false);
 document.getElementById('fullControl').innerHTML = icons.fullscreen;
 showControls();
}
async function toggleFullscreen() {
 if (immersive) { await exitFullscreen(); return; }
 immersive = true;
 expandVideo(true);
 document.getElementById('fullControl').innerHTML = icons.exitFullscreen;
 document.getElementById('fullControl').setAttribute('aria-label', '全画面を終了');
 try {
  if (!document.fullscreenEnabled || !document.documentElement.requestFullscreen) throw new Error('Use host fullscreen');
  await document.documentElement.requestFullscreen();
 } catch {
  usingHostFullscreen = true;
  vscode.postMessage({ type: 'immersive', enabled: true });
 }
 showControls();
}
document.addEventListener('fullscreenchange', () => { if (immersive && !document.fullscreenElement && !usingHostFullscreen) void exitFullscreen(); });
document.addEventListener('mousemove', showControls);
document.addEventListener('pointerdown', showControls);
document.addEventListener('keydown', showControls);
video.addEventListener('dblclick', toggleFullscreen);
video.addEventListener('play', showControls);
video.addEventListener('pause', showControls);
function expandVideo(expanded) {
 document.body.classList.toggle('expanded', expanded);
 const button = document.getElementById('fullscreen');
 button.setAttribute('aria-pressed', String(expanded));
 button.textContent = expanded ? '拡大を解除（Esc）' : '動画を拡大';
}
document.getElementById('fullscreen').addEventListener('click', () => expandVideo(!document.body.classList.contains('expanded')));
document.getElementById('windowFullscreen').addEventListener('click', toggleFullscreen);
document.addEventListener('keydown', event => {
 if (event.key === 'Escape' && document.body.classList.contains('expanded')) {
  if (immersive) void exitFullscreen();
  else expandVideo(false);
  event.preventDefault();
  event.stopPropagation();
 }
});
document.getElementById('search').addEventListener('input', draw);
document.getElementById('open').addEventListener('click', () => vscode.postMessage({type:'open'}));
document.getElementById('speed').addEventListener('change', event => { video.playbackRate = Number(event.target.value); });
document.getElementById('loop').addEventListener('click', event => { video.loop = !video.loop; event.currentTarget.setAttribute('aria-pressed', String(video.loop)); });
document.getElementById('retry').addEventListener('click', () => select(selected));
document.getElementById('compatible').addEventListener('click', () => select(selected, true));
video.addEventListener('loadedmetadata', () => {
 document.getElementById('status').textContent = '再生ボタンを押すと再生します。音が出ない場合は「互換再生」を試してください。';
 video.playbackRate = Number(document.getElementById('speed').value);
});
video.addEventListener('error', () => {
 if (entries[selected].issue || preparing) return;
 if (entries[selected].canPrepare && !entries[selected].compatibilityAttempted) { select(selected, true); return; }
 const error = video.error;
 const reasons = {
  1: '読み込みが中断されました。再読み込みを試してください。',
  2: '動画ファイルの読み込みに失敗しました。ファイルの場所とアクセス権を確認してください。',
  3: '動画のデコードに失敗しました。動画の破損や非対応のコーデックが考えられます。',
  4: '動画の形式が非対応、または動画ファイルにアクセスできません。'
 };
 document.getElementById('status').textContent = '再生エラー: ' + (reasons[error?.code] || '原因不明') + ' [code=' + (error?.code ?? 'unknown') + '] ' + (error?.message || '');
});
window.addEventListener('message', event => {
 if (event.data?.type === 'pause') video.pause();
 if (event.data?.requestId !== requestId) return;
 if (event.data.type === 'sourceReady') {
  preparing = false;
  document.getElementById('compatible').disabled = !entries[selected].canPrepare;
  entries[selected].src = event.data.src;
  video.src = event.data.src;
  video.load();
  document.getElementById('status').textContent = '動画を読み込んでいます…';
 }
 if (event.data.type === 'prepareError') {
  preparing = false;
  document.getElementById('compatible').disabled = !entries[selected].canPrepare;
  document.getElementById('status').textContent = event.data.message;
 }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); });
select(${initialIndex});
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
                panel.webview.html = '<!doctype html><html lang="ja"><meta charset="utf-8"><h1>WebM Player</h1><p role="status">動画を読み込んでいます…</p></html>';
                let hostImmersive = false;
                panel.onDidDispose(() => {
                    if (hostImmersive) void vscode.commands.executeCommand('workbench.action.toggleZenMode');
                });
                panel.webview.onDidReceiveMessage(message => {
                    if (message.type === 'open') void open();
                    if (message.type === 'immersive' && typeof message.enabled === 'boolean' && message.enabled !== hostImmersive) {
                        hostImmersive = message.enabled;
                        void vscode.commands.executeCommand('workbench.action.toggleZenMode');
                    }
                }, undefined, context.subscriptions);
                let streamServer;
                try {
                    streamServer = document.uri.scheme === 'file' && !vscode.env.remoteName
                    ? await createVideoServer(error => { console.error('Video stream error:', error); }) : undefined;
                } catch (error) {
                    console.error('Video server unavailable; using webview resources:', error);
                }
                if (streamServer) panel.onDidDispose(() => streamServer.dispose());
                panel.onDidChangeViewState(() => {
                    if (!panel.visible) void panel.webview.postMessage({ type: 'pause' });
                });
                const disposables = [];
                panel.onDidDispose(() => disposables.forEach(item => item.dispose()));
                try {
                    await renderPlayer(panel.webview, document.uri, streamServer, vscode.Uri.joinPath(context.globalStorageUri, 'video-cache').fsPath, disposables);
                } catch (error) {
                    streamServer?.dispose();
                    panel.webview.html = '<!doctype html><html lang="ja"><meta charset="utf-8"><h1>動画を開けませんでした</h1><p role="alert">' + escapeHtml(error.message) + '</p><p>動画のタブを閉じて開き直してください。</p></html>';
                }
            },
        }, { webviewOptions: { retainContextWhenHidden: false } })
    );
}

module.exports = { registerVideoPlayer, getVideoIssue, renderPlayer };
