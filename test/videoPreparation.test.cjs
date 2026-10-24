const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const vm = require('node:vm');

test('loads original WebM immediately, offers compatibility playback and ignores outdated results', async () => {
    const load = Module._load;
    const uri = { scheme: 'file', fsPath: '/test.webm', path: '/test.webm', toString: () => '/test.webm' };
    const listeners = [];
    let finish;
    const prepared = new Promise(resolve => { finish = resolve; });
    Module._load = function(name, ...args) {
        if (name === 'vscode') return { workspace: { findFiles: async () => [{ ...uri, path: '/aaa.webm', fsPath: '/aaa.webm', toString: () => '/aaa.webm' }], asRelativePath: () => 'test.webm', fs: { stat: async () => ({ size: 2048 }) } }, Uri: { joinPath: () => uri } };
        if (name === './compatibility') return { compatibleVideo: () => prepared };
        return load.call(this, name, ...args);
    };
    const { renderPlayer } = require('../src/video/player');
    Module._load = load;
    class Element {
        constructor() { this.value = '1'; this.handlers = {}; this.childElementCount = 0; this.children = []; }
        addEventListener(name, handler) { this.handlers[name] = handler; }
        setAttribute() {}
        removeAttribute(name) { delete this[name]; }
        pause() {}
        load() {}
        append(...children) { this.children.push(...children); this.childElementCount = this.children.length; }
        replaceChildren() { this.children = []; this.childElementCount = 0; }
    }
    const elements = new Map();
    const classes = new Set();
    const document = { body: { classList: { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name), contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name) } }, getElementById: id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); }, createElement: () => new Element(), addEventListener() {} };
    document.getElementById('search').value = '';
    const requests = [];
    let onMessage;
    const webview = { cspSource: 'test:', asWebviewUri: () => uri, onDidReceiveMessage: callback => { listeners.push(callback); return { dispose() {} }; }, postMessage: async data => onMessage({ data }) };
    let registered = 0;
    const registrations = [];
    await renderPlayer(webview, uri, { origin: 'http://127.0.0.1', add: (file, options) => { registered++; registrations.push({ file, options }); return 'http://127.0.0.1/video'; } }, '/cache', []);
    const script = webview.html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
    vm.runInNewContext(script, { document, window: { addEventListener: (_, callback) => { onMessage = callback; } }, setTimeout: () => 1, clearTimeout() {}, acquireVsCodeApi: () => ({ postMessage: data => requests.push(data) }) });
    const video = document.getElementById('video');
    assert.equal(video.src, 'http://127.0.0.1/video', 'original video loads without waiting for conversion');
    assert.equal(requests.length, 0, 'does not start a conversion on open');
    assert.equal(video.poster, 'http://127.0.0.1/video');
    assert.equal(registered, 4, 'registers original videos and lazy thumbnails');
    assert.equal(registrations.find(item => item.options?.contentType === 'image/jpeg').options.contentType, 'image/jpeg');
    assert.equal(typeof registrations.find(item => item.options?.contentType === 'image/jpeg').options.prepare, 'function');
    assert.match(webview.html, /img-src test: http:\/\/127.0.0.1/);
    const image = document.getElementById('list').children[0].children[0].children[0];
    assert.equal(image.loading, 'lazy');
    assert.equal(image.src, 'http://127.0.0.1/video');
    document.getElementById('compatible').handlers.click();
    assert.equal(video.src, undefined);
    assert.equal(requests[0].index, 1, 'opens the selected file without moving it ahead of alphabetically earlier files');
    const task = listeners[0](requests[0]);
    assert.equal(video.src, undefined);
    finish('/cache/prepared.webm');
    await task;
    assert.equal(registrations.at(-1).options.contentType, 'video/webm');
    assert.equal(video.src, 'http://127.0.0.1/video');
    onMessage({ data: { type: 'sourceReady', requestId: 1, src: 'outdated' } });
    assert.equal(video.src, 'http://127.0.0.1/video');
    document.getElementById('volume').handlers.input({ target: { value: '0.4' } });
    assert.equal(video.volume, 0.4);
    assert.equal(video.muted, false);
    document.getElementById('mute').handlers.click();
    assert.equal(video.muted, true);
    document.getElementById('expandControl').handlers.click();
    assert.equal(classes.has('expanded'), true);
    await document.getElementById('fullControl').handlers.click();
    assert.equal(requests.at(-1).type, 'immersive');
    assert.equal(requests.at(-1).enabled, true);
    assert.equal(classes.has('expanded'), true);
    await document.getElementById('fullControl').handlers.click();
    assert.equal(requests.at(-1).enabled, false);
    assert.equal(classes.has('expanded'), false);
});
