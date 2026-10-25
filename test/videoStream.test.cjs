const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createVideoServer } = require('../src/video/streamServer');

test('video streaming supports seeking and rejects unregistered files', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'webm-stream-'));
    const file = path.join(dir, '日本語 [test].webm');
    const bytes = Buffer.from('0123456789');
    await fs.writeFile(file, bytes);
    const server = await createVideoServer();
    try {
        const url = server.add(file);
        let prepared = false;
        const compatible = server.add('unused', { contentType: 'video/mp4', prepare: async () => { prepared = true; return file; } });
        assert.equal(prepared, false);
        const cached = await fetch(compatible, { headers: { Range: 'bytes=0-1' } });
        assert.equal(cached.headers.get('content-type'), 'video/mp4');
        assert.equal(await cached.text(), '01');
        assert.equal(prepared, true);
        let result = await fetch(url, { headers: { Range: 'bytes=2-5' } });
        assert.equal(result.status, 206);
        assert.equal(result.headers.get('content-range'), 'bytes 2-5/10');
        assert.equal(await result.text(), '2345');
        result = await fetch(url, { headers: { Range: 'bytes=-3' } });
        assert.equal(await result.text(), '789');
        result = await fetch(url, { headers: { Range: 'bytes=7-' } });
        assert.equal(await result.text(), '789');
        result = await fetch(url, { headers: { Range: 'bytes=99-' } });
        assert.equal(result.status, 416);
        result = await fetch(url, { method: 'HEAD' });
        assert.equal(result.headers.get('content-length'), '10');
        assert.equal(await result.text(), '');
        result = await fetch(url);
        assert.equal(await result.text(), bytes.toString());
        result = await fetch(server.origin + '/unknown');
        assert.equal(result.status, 404);
    } finally {
        server.dispose();
        await fs.rm(dir, { recursive: true, force: true });
    }
});


test('progressive MP4 sends playable bytes before conversion ends and supports ranges afterward', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-progressive-'));
    const file = path.join(dir, 'converted.mp4');
    await fs.writeFile(file, '0123456789');
    let finish;
    const completion = new Promise(resolve => { finish = resolve; });
    let complete = false, references = 0;
    const job = {
        path: file, ready: Promise.resolve(file), get complete() { return complete; },
        retain() { references++; }, release() { references--; },
        async *chunks() { yield Buffer.from('01'); await completion; yield Buffer.from('23456789'); },
    };
    const server = await createVideoServer();
    try {
        const url = server.add(file, { contentType: 'video/mp4', progressive: job });
        const result = await fetch(url, { headers: { Range: 'bytes=0-' } });
        assert.equal(result.status, 200);
        assert.equal(result.headers.get('content-type'), 'video/mp4');
        assert.equal(result.headers.get('content-length'), null);
        const reader = result.body.getReader();
        assert.equal(Buffer.from((await reader.read()).value).toString(), '01');
        assert.equal(complete, false, 'first bytes arrive before conversion completes');
        assert.equal(references, 1);
        complete = true; finish();
        let remaining = '';
        for (;;) { const next = await reader.read(); if (next.done) break; remaining += Buffer.from(next.value).toString(); }
        assert.equal(remaining, '23456789');
        const seek = await fetch(url, { headers: { Range: 'bytes=6-9' } });
        assert.equal(seek.status, 206);
        assert.equal(await seek.text(), '6789');
        const replacement = server.add(file, { contentType: 'video/mp4', progressive: job });
        server.remove(url);
        assert.equal(references, 1, 'reselecting the same conversion keeps it alive');
        server.remove(replacement);
        assert.equal(references, 0, 'stops retaining old conversions after a seek');
        assert.equal((await fetch(url)).status, 404);
    } finally {
        finish(); server.dispose();
        assert.equal(references, 0);
        await fs.rm(dir, { recursive: true, force: true });
    }
});
