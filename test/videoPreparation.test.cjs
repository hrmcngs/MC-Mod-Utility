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
    const classes = new Set();
    const document = { body: { classList: { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name), contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name) } }, getElementById: id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); }, createElement: () => new Element(), addEventListener() {} };
    document.getElementById('search').value = '';
    const requests = [];
    let onMessage;
    const webview = { cspSource: 'test:', asWebviewUri: () => uri, onDidReceiveMessage: callback => { listeners.push(callback); return { dispose() {} }; }, postMessage: async data => onMessage({ data }) };
    let registered = 0;
    await renderPlayer(webview, uri, { origin: 'http://127.0.0.1', add: () => { registered++; return 'http://127.0.0.1/video'; } }, '/cache', []);
    const script = webview.html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
    vm.runInNewContext(script, { document, window: { addEventListener: (_, callback) => { onMessage = callback; } }, setTimeout: () => 1, clearTimeout() {}, acquireVsCodeApi: () => ({ postMessage: data => requests.push(data) }) });
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
