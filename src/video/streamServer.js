const http = require('node:http');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream');

// One panel owns one server; only explicitly registered files can be served.
async function createVideoServer() {
    const files = new Map();
    const server = http.createServer(async (req, res) => {
        const file = files.get(req.url);
        if (!file || !['GET', 'HEAD'].includes(req.method)) {
            res.writeHead(404).end();
            return;
        }
        let handle;
        try {
            handle = await fs.promises.open(file, 'r');
            const stat = await handle.stat();
            const size = stat.size;
            if (!stat.isFile() || !size) { await handle.close(); res.writeHead(404).end(); return; }
            let start = 0, end = size - 1;
            const range = req.headers.range;
            if (range) {
                const match = /^bytes=(\d*)-(\d*)$/.exec(range);
                if (match && (match[1] || match[2])) {
                    if (!match[1]) start = Math.max(0, size - Number(match[2]));
                    else {
                        start = Number(match[1]);
                        if (match[2]) end = Math.min(end, Number(match[2]));
                    }
                }
                if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
                    await handle.close();
                    res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
                    return;
                }
            }
            const headers = { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
            if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
            res.writeHead(range ? 206 : 200, headers);
            if (req.method === 'HEAD') { await handle.close(); res.end(); return; }
            const stream = handle.createReadStream({ start, end, highWaterMark: 64 * 1024 });
            res.on('close', () => stream.destroy());
            pipeline(stream, res, () => {});
        } catch {
            if (handle) await handle.close().catch(() => {});
            if (!res.headersSent) res.writeHead(404).end();
            else res.destroy();
        }
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    return {
        origin,
        add(file) {
            const key = '/' + crypto.randomBytes(24).toString('hex');
            files.set(key, file);
            return origin + key;
        },
        dispose() { files.clear(); server.close(); server.closeAllConnections(); },
    };
}
module.exports = { createVideoServer };
