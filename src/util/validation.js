/**
 * @param {string} value
 * @returns {string|null} エラーメッセージ or null (valid)
 */
function validateModId(value) {
    if (!value) return 'Mod ID is required';
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(value)) {
        return 'Mod ID must start with a lowercase letter, contain only [a-z0-9_], max 64 chars';
    }
    return null;
}

/**
 * @param {string} value
 * @returns {string|null}
 */
function validateGroupId(value) {
    if (!value) return 'Group ID is required';
    if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/.test(value)) {
        return 'Must be a valid Java package name (e.g. com.example)';
    }
    return null;
}

/**
 * @param {string} value
 * @returns {string|null}
 */
function validateComponentName(value) {
    if (!value) return 'Component name is required';
    if (!/^[A-Z][a-zA-Z0-9]+$/.test(value)) {
        return 'Must be PascalCase (e.g. RubyOre)';
    }
    return null;
}

module.exports = { validateModId, validateGroupId, validateComponentName };
