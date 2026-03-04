/**
 * Group ID + Mod ID をファイルシステムパスに変換
 * ('com.example', 'my_mod') -> 'com/example/my_mod'
 */
function toPackagePath(groupId, modId) {
    return `${groupId.replace(/\./g, '/')}/${modId}`;
}

/**
 * Mod ID を PascalCase クラス名に変換
 * 'my_cool_mod' -> 'MyCoolMod'
 */
function modIdToClassName(modId) {
    return modId
        .split('_')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}

/**
 * PascalCase を snake_case に変換 (レジストリ名用)
 * 'RubyOre' -> 'ruby_ore'
 */
function toSnakeCase(pascalCase) {
    return pascalCase
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
        .replace(/^_/, '');
}

/**
 * PascalCase を UPPER_SNAKE_CASE に変換 (定数名用)
 * 'RubyOre' -> 'RUBY_ORE'
 */
function toUpperSnakeCase(pascalCase) {
    return toSnakeCase(pascalCase).toUpperCase();
}

module.exports = { toPackagePath, modIdToClassName, toSnakeCase, toUpperSnakeCase };
