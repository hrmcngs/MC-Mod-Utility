const http = require('node:http');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { Readable, pipeline } = require('node:stream');

// One panel owns one server; only explicitly registered files can be served.
async function createVideoServer(onError = () => {}) {
    const files = new Map();
    const jobs = new Set();
    let disposed = false;
    const server = http.createServer(async (req, res) => {
        const file = files.get(req.url);
        if (!file || !['GET', 'HEAD'].includes(req.method)) {
            res.writeHead(404).end();
            return;
        }
        let handle;
        try {
            if (file.progressive && !file.progressive.complete) {
                const job = file.progressive;
                await job.ready;
                if (res.destroyed) return;
                res.writeHead(200, { 'Content-Type': file.contentType, 'Cache-Control': 'no-store', 'Accept-Ranges': 'none', 'X-Content-Type-Options': 'nosniff' });
                if (req.method === 'HEAD') { res.end(); return; }
                const controller = new AbortController();
                res.on('close', () => controller.abort());
                pipeline(Readable.from(job.chunks(controller.signal)), res, () => {});
                return;
            }
            handle = await fs.promises.open(file.progressive ? file.progressive.path : file.prepare ? await file.prepare() : file.path, 'r');
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
            const headers = { 'Content-Type': file.contentType, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
            if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
            res.writeHead(range ? 206 : 200, headers);
            if (req.method === 'HEAD') { await handle.close(); res.end(); return; }
            const stream = handle.createReadStream({ start, end, highWaterMark: 64 * 1024 });
            res.on('close', () => stream.destroy());
            pipeline(stream, res, () => {});
        } catch (error) {
            onError(error);
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
        add(file, options = {}) {
            if (disposed) throw new Error('動画プレーヤーは閉じられています');
            if (options.progressive && !jobs.has(options.progressive)) { jobs.add(options.progressive); options.progressive.retain(); }
            const key = '/' + crypto.randomBytes(24).toString('hex');
            files.set(key, { path: file, contentType: options.contentType || 'video/webm', prepare: options.prepare, progressive: options.progressive });
            return origin + key;
        },
        remove(url) {
            const key = new URL(url).pathname;
            const entry = files.get(key);
            files.delete(key);
            if (entry?.progressive && ![...files.values()].some(file => file.progressive === entry.progressive)) {
                jobs.delete(entry.progressive); entry.progressive.release();
            }
        },
        dispose() { disposed = true; for (const job of jobs) job.release(); jobs.clear(); files.clear(); server.close(); server.closeAllConnections(); },
    };
}
module.exports = { createVideoServer };
