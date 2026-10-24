const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const pending = new Map();
let queue = Promise.resolve();

// Generate only requested images, one at a time, independently of playback.
async function videoThumbnail(file, cacheDirectory) {
    const stat = await fs.stat(file);
    const key = crypto.createHash('sha256').update(JSON.stringify(['thumbnail-v1', file, stat.size, stat.mtimeMs])).digest('hex');
    const target = path.join(cacheDirectory, key + '.jpg');
    if (pending.has(target)) return pending.get(target);
    const task = queue.then(async () => {
        await fs.mkdir(cacheDirectory, { recursive: true });
        try { await fs.access(target); return target; } catch { /* Cache miss. */ }
        const temporary = target + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
        try {
            await run('ffmpeg', ['-nostdin', '-v', 'error', '-i', file, '-map', '0:v:0', '-frames:v', '1', '-vf', 'scale=320:-1', '-q:v', '3', '-threads', '1', '-f', 'image2', temporary], { timeout: 30000, maxBuffer: 1024 * 1024 });
            await fs.rename(temporary, target);
            return target;
        } finally {
            await fs.rm(temporary, { force: true });
        }
    });
    queue = task.catch(() => {});
    pending.set(target, task);
    try { return await task; } finally { pending.delete(target); }
}
module.exports = { videoThumbnail };
