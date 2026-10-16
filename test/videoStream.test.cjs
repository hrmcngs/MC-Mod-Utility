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
