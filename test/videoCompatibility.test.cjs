const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { compatibleVideo } = require('../src/video/compatibility');
const { videoThumbnail, thumbnailData } = require('../src/video/thumbnail');
let hasFFmpeg = true;
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); } catch { hasFFmpeg = false; }
const probe = file => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', file]));

test('WebM keeps its video and plays with Opus audio; silent clips and thumbnails work', { skip: !hasFFmpeg }, async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'webm-compat-'));
    const cache = path.join(dir, 'cache');
    try {
        const source = path.join(dir, '日本語 clip.webm');
        execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:size=160x90:rate=10', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '0.5', '-c:v', 'libvpx', '-c:a', 'libopus', source]);
        const [converted, duplicate] = await Promise.all([compatibleVideo(source, cache), compatibleVideo(source, cache)]);
        assert.equal(converted, duplicate);
        assert.equal(path.extname(converted), '.webm');
        const streams = probe(converted).streams;
        assert.equal(streams.find(s => s.codec_type === 'video').codec_name, 'vp8');
        assert.equal(streams.find(s => s.codec_type === 'audio').codec_name, 'opus');
        // A bit-exact decoded frame confirms the video was preserved.
        const frame = file => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v:0', '-frames:v', '1', '-f', 'md5', '-']).toString();
        assert.equal(frame(converted), frame(source));
        execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-i', converted, '-f', 'null', '-']);
        const before = await fs.stat(converted);
        assert.equal(await compatibleVideo(source, cache), converted);
        assert.equal((await fs.stat(converted)).mtimeMs, before.mtimeMs);
        const thumbnail = await videoThumbnail(source, cache);
        assert.equal(probe(thumbnail).streams[0].codec_name, 'mjpeg');
        assert.equal(probe(thumbnail).streams[0].width, 320);
        assert.equal(await videoThumbnail(source, cache), thumbnail);
        const data = await thumbnailData(source, cache);
        assert.match(data, /^data:image\/jpeg;base64,/);
        assert.deepEqual(Buffer.from(data.split(',')[1], 'base64'), await fs.readFile(thumbnail));
        const silent = path.join(dir, 'silent.webm');
        execFileSync('ffmpeg', ['-v', 'error', '-i', source, '-an', '-c:v', 'copy', silent]);
        assert.equal(probe(await compatibleVideo(silent, cache)).streams.length, 1);
        const broken = path.join(dir, 'broken.webm');
        await fs.writeFile(broken, 'not a video');
        await assert.rejects(videoThumbnail(broken, cache));
        await assert.rejects(compatibleVideo(broken, cache));
        assert.equal(probe(await videoThumbnail(silent, cache)).streams[0].codec_name, 'mjpeg');
        assert.equal((await fs.readdir(cache)).some(name => name.endsWith('.tmp')), false);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
