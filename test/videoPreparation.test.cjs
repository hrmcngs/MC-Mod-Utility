const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const vm = require('node:vm');

test('waits for compatibility preparation and ignores outdated video results', async () => {
    const load = Module._load;
    const uri = { scheme: 'file', fsPath: '/test.webm', path: '/test.webm', toString: () => '/test.webm' };
    const listeners = [];
    let finish;
    const prepared = new Promise(resolve => { finish = resolve; });
    Module._load = function(name, ...args) {
        if (name === 'vscode') return { workspace: { findFiles: async () => [], asRelativePath: () => 'test.webm', fs: { stat: async () => ({ size: 2048 }) } }, Uri: { joinPath: () => uri } };
        if (name === './compatibility') return { compatibleVideo: () => prepared };
        return load.call(this, name, ...args);
    };
    const { renderPlayer } = require('../src/video/player');
    Module._load = load;
    class Element {
        constructor() { this.value = '1'; this.handlers = {}; this.childElementCount = 0; }
        addEventListener(name, handler) { this.handlers[name] = handler; }
        setAttribute() {}
        removeAttribute(name) { delete this[name]; }
        pause() {}
        load() {}
        append() { this.childElementCount++; }
        replaceChildren() { this.childElementCount = 0; }
    }
    const elements = new Map();
    const document = { getElementById: id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); }, createElement: () => new Element(), addEventListener() {} };
    document.getElementById('search').value = '';
    const requests = [];
    let onMessage;
    const webview = { cspSource: 'test:', asWebviewUri: () => uri, onDidReceiveMessage: callback => { listeners.push(callback); return { dispose() {} }; }, postMessage: async data => onMessage({ data }) };
    let registered = 0;
    await renderPlayer(webview, uri, { origin: 'http://127.0.0.1', add: () => { registered++; return 'http://127.0.0.1/video'; } }, '/cache', []);
    const script = webview.html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
    vm.runInNewContext(script, { document, window: { addEventListener: (_, callback) => { onMessage = callback; } }, acquireVsCodeApi: () => ({ postMessage: data => requests.push(data) }) });
    const video = document.getElementById('video');
    assert.equal(video.src, undefined);
    assert.equal(registered, 0);
    const task = listeners[0](requests[0]);
    assert.equal(video.src, undefined);
    finish('/cache/prepared.mp4');
    await task;
    assert.equal(video.src, 'http://127.0.0.1/video');
    onMessage({ data: { type: 'sourceReady', requestId: 0, src: 'outdated' } });
    assert.equal(video.src, 'http://127.0.0.1/video');
});
