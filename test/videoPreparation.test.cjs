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
        if (name === './thumbnail') return { thumbnailData: async () => 'data:image/jpeg;base64,/9j/test' };
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
    let observer;
    class IntersectionObserver {
        constructor(callback) { this.callback = callback; this.targets = []; observer = this; }
        observe(target) { this.targets.push(target); }
        unobserve() {}
        disconnect() { this.targets = []; }
    }
    const webview = { cspSource: 'test:', asWebviewUri: () => uri, onDidReceiveMessage: callback => { listeners.push(callback); return { dispose() {} }; }, postMessage: async data => onMessage({ data }) };
    let registered = 0;
    const registrations = [];
    await renderPlayer(webview, uri, { origin: 'http://127.0.0.1', add: (file, options) => { registered++; registrations.push({ file, options }); return 'http://127.0.0.1/video'; } }, '/cache', []);
    const script = webview.html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
    vm.runInNewContext(script, { document, IntersectionObserver, window: { addEventListener: (_, callback) => { onMessage = callback; } }, setTimeout: () => 1, clearTimeout() {}, acquireVsCodeApi: () => ({ postMessage: data => requests.push(data) }) });
    const video = document.getElementById('video');
    assert.equal(video.src, 'http://127.0.0.1/video', 'original video loads without waiting for conversion');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].type, 'thumbnail', 'opening only prepares a thumbnail, never converts the video');
    assert.equal(requests[0].index, 1);
    await listeners[0](requests.shift());
    assert.equal(video.poster, 'data:image/jpeg;base64,/9j/test');
    assert.equal(registered, 2, 'only videos use the HTTP server');
    assert.match(webview.html, /img-src test: data:/);
    const image = document.getElementById('list').children[0].children[0].children[0];
    assert.equal(image.hidden, true, 'waits for thumbnail data');
    observer.callback([{ target: observer.targets[0], isIntersecting: true }]);
    assert.equal(requests[0].type, 'thumbnail');
    await listeners[0](requests.shift());
    assert.equal(image.src, 'data:image/jpeg;base64,/9j/test');
    assert.equal(image.hidden, false, 'displays the actual image after receiving data');
    document.getElementById('search').handlers.input();
    const restored = document.getElementById('list').children[0].children[0].children[0];
    assert.equal(restored.src, image.src, 'keeps thumbnails when the list redraws');
    assert.equal(restored.hidden, false);
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
