const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sortVideos } = require('../src/video/videoOrder');

test('orders folders before files and sorts episode numbers naturally', () => {
    const paths = ['/other/第10話.webm', '/z.webm', '/other/第2話.webm', '/other/第1話.webm', '/a.webm'];
    const files = paths.map(path => ({ scheme: 'file', path }));
    assert.deepEqual(sortVideos(files).map(file => file.path), ['/other/第1話.webm', '/other/第2話.webm', '/other/第10話.webm', '/a.webm', '/z.webm']);
    assert.deepEqual(files.map(file => file.path), paths);
});
