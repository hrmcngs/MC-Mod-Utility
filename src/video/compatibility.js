const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { setTimeout: delay } = require('node:timers/promises');
const run = promisify(execFile);
const pending = new Map();

async function prepareCompatibleVideo(file, cacheDirectory) {
    const stat = await fs.stat(file);
    const key = crypto.createHash('sha256').update(JSON.stringify(['fragmented-h264-mp3-v6', file, stat.size, stat.mtimeMs])).digest('hex');
    const target = path.join(cacheDirectory, key + '.mp4');
    if (pending.has(target)) return pending.get(target);
    const task = (async () => {
        await fs.mkdir(cacheDirectory, { recursive: true });
        try {
            await fs.access(target);
            return { path: target, complete: true, duration: null, ready: Promise.resolve(target), done: Promise.resolve(target), retain() {}, release() {}, subscribe() { return { dispose() {} }; } };
        } catch { /* Cache miss. */ }
        let duration = null;
        try {
            const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file], { timeout: 10000, maxBuffer: 65536 });
            const value = Number(JSON.parse(stdout).format?.duration);
            if (Number.isFinite(value) && value > 0) duration = value;
        } catch { /* Playback can start even when ffprobe is unavailable. */ }
        return startConversion(file, target, duration);
    })();
    pending.set(target, task);
    task.then(job => job.done).then(() => pending.delete(target), () => pending.delete(target));
    return task;
}

function startConversion(file, target, duration) {
    const temporary = target + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
    let resolveReady, rejectReady, resolveDone, rejectDone;
    const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
    // A caller may be waiting only for the first playable fragment.
    ready.catch(() => {}); done.catch(() => {});
    let complete = false, failure, settled = false, references = 0, stderr = '', progress = 0, progressBuffer = '';
    const listeners = new Set();
    const child = spawn('ffmpeg', ['-nostdin', '-v', 'error', '-i', file, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-pix_fmt', 'yuv420p', '-threads', '2', '-g', '48', '-c:a', 'libmp3lame', '-b:a', '128k', '-movflags', '+frag_keyframe+empty_moov+default_base_moof', '-frag_duration', '1000000', '-progress', 'pipe:1', '-nostats', '-f', 'mp4', temporary], { stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { child.kill(); }, 30 * 60 * 1000);
    const poll = setInterval(() => { fs.stat(temporary).then(info => { if (info.size > 0) resolveReady(temporary); }).catch(() => {}); }, 100);
    async function fail(error) {
        if (settled) return;
        settled = true; failure = error;
        clearInterval(poll); clearTimeout(timer);
        await fs.rm(temporary, { force: true }).catch(() => {});
        rejectReady(error); rejectDone(error);
    }
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-65536); });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
        progressBuffer += chunk;
        const lines = progressBuffer.split('\n'); progressBuffer = lines.pop();
        for (const line of lines) if (line.startsWith('out_time_us=')) {
            const seconds = Number(line.slice(12)) / 1000000;
            if (duration && Number.isFinite(seconds)) progress = Math.max(progress, Math.min(99, Math.floor(seconds / duration * 100)));
            for (const listener of listeners) listener(progress);
        }
    });
    child.on('error', error => { void fail(new Error(error.code === 'ENOENT' ? '互換再生にはffmpegが必要です。ffmpegをインストールしてVS Codeを再起動してください。' : error.message)); });
    child.on('close', code => {
        if (settled) return;
        if (code !== 0) { void fail(new Error('互換動画の準備に失敗しました: ' + (stderr || '変換が中断されました'))); return; }
        void (async () => {
            try {
                await fs.rename(temporary, target);
                complete = true; settled = true;
                clearInterval(poll); clearTimeout(timer);
                resolveReady(target); resolveDone(target);
            } catch (error) { await fail(error); }
        })();
    });
    return {
        get path() { return complete ? target : temporary; },
        get complete() { return complete; }, duration, ready, done,
        retain() { references++; },
        release() { if (--references <= 0 && !settled) child.kill(); },
        subscribe(listener) { listeners.add(listener); listener(progress); return { dispose() { listeners.delete(listener); } }; },
        async *chunks(signal) {
            await ready;
            let handle;
            try { handle = await fs.open(complete ? target : temporary, 'r'); }
            catch (error) { if (error.code !== 'ENOENT') throw error; handle = await fs.open(await done, 'r'); }
            try {
                let position = 0;
                while (!signal.aborted) {
                    const buffer = Buffer.allocUnsafe(65536);
                    const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
                    if (bytesRead) { position += bytesRead; yield buffer.subarray(0, bytesRead); }
                    else if (failure) throw failure;
                    else if (complete) break;
                    else await delay(75);
                }
            } finally { await handle.close(); }
        },
    };
}

async function compatibleVideo(file, cacheDirectory) {
    const job = await prepareCompatibleVideo(file, cacheDirectory);
    job.retain();
    try { return await job.done; } finally { job.release(); }
}
module.exports = { compatibleVideo, prepareCompatibleVideo };
