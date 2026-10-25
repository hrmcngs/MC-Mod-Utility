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
    let finishConversion;
    const completed = new Promise(resolve => { finishConversion = resolve; });
    Module._load = function(name, ...args) {
        if (name === 'vscode') return { workspace: { findFiles: async () => [{ ...uri, path: '/aaa.webm', fsPath: '/aaa.webm', toString: () => '/aaa.webm' }], asRelativePath: () => 'test.webm', fs: { stat: async () => ({ size: 2048 }) } }, Uri: { joinPath: () => uri } };
        if (name === './thumbnail') return { thumbnailData: async () => 'data:image/jpeg;base64,/9j/test' };
        if (name === './compatibility') return { prepareCompatibleVideo: async (_file, _cache, position) => ({ offset: position, path: '/cache/prepared.tmp', ready: prepared, done: completed, complete: false, duration: 120, subscribe: listener => { listener(35); return { dispose() {} }; } }) };
        return load.call(this, name, ...args);
    };
    const { renderPlayer } = require('../src/video/player');
    Module._load = load;
    class Element {
        constructor() { this.attributes = {}; this.value = '1'; this.paused = true; this.playCalls = 0; this.handlers = {}; this.childElementCount = 0; this.children = []; }
        addEventListener(name, handler) { this.handlers[name] = handler; }
        setAttribute(name, value) { this.attributes[name] = value; }
        set innerHTML(value) { this.markup = value; this.htmlWrites = (this.htmlWrites || 0) + 1; }
        get innerHTML() { return this.markup; }
        removeAttribute(name) { delete this[name]; }
        pause() { this.paused = true; }
        async play() { this.playCalls++; this.paused = false; }
        load() { this.currentTime = 0; }
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
    await renderPlayer(webview, uri, { origin: 'http://127.0.0.1', remove: () => {}, add: (file, options) => { registered++; registrations.push({ file, options }); return 'http://127.0.0.1/video'; } }, '/cache', []);
    const script = webview.html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
    let nextTimer = 0; const timers = new Map(); const windowHandlers = {};
    const fireHold = () => { const [id, timer] = [...timers].find(([,timer]) => timer.delay === 400); timers.delete(id); timer.callback(); };
    vm.runInNewContext(script, { document, IntersectionObserver, window: { addEventListener: (name, callback) => { windowHandlers[name] = callback; if (name === 'message') onMessage = callback; } }, setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; }, clearTimeout: id => timers.delete(id), acquireVsCodeApi: () => ({ postMessage: data => requests.push(data) }) });
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
    await document.getElementById('play').handlers.click();
    assert.equal(video.playCalls, 0, 'remembers the click instead of playing an empty source during conversion');
    assert.match(document.getElementById('stage-status').textContent, /準備中/);
    finish('/cache/prepared.mp4');
    await task;
    assert.equal(registrations.at(-1).options.contentType, 'video/mp4');
    assert.equal(video.playCalls, 1, 'starts playback automatically once conversion completes');
    assert.equal(video.paused, false);
    video.duration = 2; // The first fragment knows only its own short duration.
    video.handlers.loadedmetadata();
    video.handlers.durationchange();
    assert.match(document.getElementById('time').textContent, /2:00/);
    assert.equal(document.getElementById('seek').disabled, false, 'seeking stays enabled during conversion');
    const seek = document.getElementById('seek');
    seek.value = '750'; seek.handlers.input({ target: seek });
    video.currentTime = 10; video.handlers.timeupdate();
    assert.equal(seek.value, '750', 'playback updates do not move the slider while dragging');
    seek.handlers.change({ target: seek });
    assert.equal(requests.at(-1).position, 90, 'unconverted positions start conversion from the requested time');
    await listeners[0](requests.at(-1));
    video.currentTime = 2; video.handlers.timeupdate();
    assert.match(document.getElementById('time').textContent, /1:32 \/ 2:00/, 'elapsed time includes the seek offset');
    document.getElementById('retry').handlers.click();
    assert.equal(requests.at(-1).type, 'prepare', 'reselecting a streaming entry reconnects its duration and progress');
    await listeners[0](requests.at(-1));
    finishConversion('/cache/prepared.mp4');
    await completed;
    await Promise.resolve();
    assert.equal(document.getElementById('seek').disabled, false);
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
    const click = { preventDefault() {} };
    await video.handlers.click(click);
    assert.equal(video.paused, false, 'clicking the video starts playback');
    await video.handlers.click(click);
    assert.equal(video.paused, true, 'clicking the video pauses immediately');
    await document.getElementById('play').handlers.click();
    const writes = document.getElementById('play').htmlWrites;
    video.handlers.timeupdate(); video.handlers.timeupdate();
    assert.equal(document.getElementById('play').htmlWrites, writes, 'time updates keep the clickable icon in place');
    video.playbackRate = 1.5;
    const pointer = { button: 0, pointerId: 7, isPrimary: true, clientX: 10, clientY: 10 };
    video.handlers.pointerdown(pointer); fireHold();
    assert.equal(video.playbackRate, 2);
    assert.equal(document.getElementById('hold-speed').hidden, false);
    video.handlers.pointerup(pointer); video.handlers.click(click);
    assert.equal(video.playbackRate, 1.5, 'releasing restores the previous speed');
    assert.equal(video.paused, false, 'the click generated after a long press does not pause playback');
    assert.equal(document.getElementById('hold-speed').hidden, true);
    video.handlers.pointerdown(pointer); fireHold();
    video.handlers.pointercancel(pointer);
    assert.equal(video.playbackRate, 1.5, 'cancelling a press restores speed');
    video.handlers.pointerdown(pointer); fireHold(); windowHandlers.blur();
    assert.equal(video.playbackRate, 1.5, 'leaving the window restores speed');
    video.handlers.pointerdown(pointer); video.handlers.pointerup(pointer); video.handlers.click(click);
    assert.equal(video.paused, true, 'a short tap still pauses');
    const originalPlay = video.play.bind(video);
    let rejectOld;
    video.play = () => { video.paused = false; return new Promise((_, reject) => { rejectOld = reject; }); };
    const oldClick = document.getElementById('play').handlers.click();
    await document.getElementById('play').handlers.click();
    video.play = originalPlay;
    await document.getElementById('play').handlers.click();
    rejectOld(new Error('old aborted play'));
    await oldClick;
    assert.equal(video.paused, false, 'rapid play-pause-play keeps the latest playback request');
    assert.equal(document.getElementById('play').attributes['aria-label'], '一時停止');
    assert.doesNotMatch(document.getElementById('status').textContent, /old aborted play/);
});
