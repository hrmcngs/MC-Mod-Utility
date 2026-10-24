const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const pending = new Map();

// Use H.264 and MP3 for VS Code webviews; AAC audio is unsupported.
async function compatibleVideo(file, cacheDirectory) {
    const stat = await fs.stat(file);
    const key = crypto.createHash('sha256').update(JSON.stringify(['h264-mp3-v3', file, stat.size, stat.mtimeMs])).digest('hex');
    const target = path.join(cacheDirectory, key + '.mp4');
    if (pending.has(target)) return pending.get(target);
    const task = (async () => {
        await fs.mkdir(cacheDirectory, { recursive: true });
        try { await fs.access(target); return target; } catch { /* Cache miss. */ }
        const temporary = target + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
        try {
            await run('ffmpeg', ['-nostdin', '-v', 'error', '-i', file, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-pix_fmt', 'yuv420p', '-c:a', 'libmp3lame', '-b:a', '128k', '-movflags', '+faststart', '-f', 'mp4', temporary], { timeout: 30 * 60 * 1000, maxBuffer: 1024 * 1024 });
            await fs.rename(temporary, target);
            return target;
        } catch (error) {
            await fs.rm(temporary, { force: true });
            if (error.code === 'ENOENT') throw new Error('互換再生にはffmpegが必要です。ffmpegをインストールしてVS Codeを再起動してください。');
            throw new Error('互換動画の準備に失敗しました: ' + (error.stderr || error.message));
        }
    })();
    pending.set(target, task);
    try { return await task; } finally { pending.delete(target); }
}
module.exports = { compatibleVideo };
