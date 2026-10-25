const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { compatibleVideo, prepareCompatibleVideo } = require('../src/video/compatibility');
const { videoThumbnail, thumbnailData } = require('../src/video/thumbnail');
let hasFFmpeg = true;
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); } catch { hasFFmpeg = false; }
const probe = file => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', file]));

test('WebM fallback uses H.264 and MP3; silent clips and thumbnails work', { skip: !hasFFmpeg }, async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'webm-compat-'));
    const cache = path.join(dir, 'cache');
    try {
        const source = path.join(dir, '日本語 clip.webm');
        execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:size=160x90:rate=10', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '0.5', '-c:v', 'libvpx', '-c:a', 'libopus', source]);
        const [converted, duplicate] = await Promise.all([compatibleVideo(source, cache), compatibleVideo(source, cache)]);
        assert.equal(converted, duplicate);
        assert.equal(path.extname(converted), '.mp4');
        assert.ok((await fs.readFile(converted)).includes(Buffer.from('moof')), 'uses fragments for playback during conversion');
        const streams = probe(converted).streams;
        assert.equal(streams.find(s => s.codec_type === 'video').codec_name, 'h264');
        assert.equal(streams.find(s => s.codec_type === 'audio').codec_name, 'mp3');
        execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-i', converted, '-f', 'null', '-']);
        const seekJob = await prepareCompatibleVideo(source, cache, 0.2);
        seekJob.retain();
        try {
            const seekFile = await seekJob.done;
            assert.notEqual(seekFile, converted);
            assert.equal(seekJob.offset, 0.2);
            assert.ok(seekJob.duration >= 0.5);
            execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-i', seekFile, '-f', 'null', '-']);
        } finally { seekJob.release(); }
        await assert.rejects(prepareCompatibleVideo(source, cache, -1));
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
