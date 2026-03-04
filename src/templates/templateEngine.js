const fs = require('fs');
const path = require('path');

/**
 * テンプレートファイルの {{key}} プレースホルダーを値で置換する
 * @param {string} templatePath - .template ファイルの絶対パス
 * @param {Record<string, string>} variables - 置換キー・値ペア
 * @returns {string} レンダリング済みの内容
 */
function renderTemplate(templatePath, variables) {
    let content = fs.readFileSync(templatePath, 'utf8');
    for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        content = content.replace(regex, value);
    }
    return content;
}

/**
 * Extension の templates/ ディレクトリ内のテンプレートファイルパスを解決する
 * @param {string} extensionPath - context.extensionPath
 * @param {...string} segments - 例: ('forge', 'project', 'java', 'build.gradle.template')
 * @returns {string} 絶対パス
 */
function getTemplatePath(extensionPath, ...segments) {
    return path.join(extensionPath, 'templates', ...segments);
}

module.exports = { renderTemplate, getTemplatePath };
