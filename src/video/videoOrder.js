const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// Compare each directory level, with folders before files like Explorer.
function sortVideos(files) {
    return [...files].sort((a, b) => {
        const left = `${a.scheme}://${a.authority || ''}${a.path}`.split('/');
        const right = `${b.scheme}://${b.authority || ''}${b.path}`.split('/');
        for (let i = 0; i < Math.min(left.length, right.length); i++) {
            const leftFolder = i < left.length - 1;
            const rightFolder = i < right.length - 1;
            if (leftFolder !== rightFolder) return leftFolder ? -1 : 1;
            const result = collator.compare(left[i], right[i]) || left[i].localeCompare(right[i]);
            if (result) return result;
        }
        return left.length - right.length;
    });
}

module.exports = { sortVideos };
