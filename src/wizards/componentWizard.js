const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { validateComponentName } = require('../util/validation');
const { toPackagePath, toSnakeCase, toUpperSnakeCase } = require('../util/pathBuilder');

/**
 * ワークスペースから既存プロジェクトの情報を自動検出する
 * @param {import('vscode').Uri} [contextUri] 右クリックで選択されたフォルダ
 * @returns {object|null} 検出結果 { loader, modId, groupId, language, workspacePath } or null
 */
function detectProject(contextUri) {
    // 右クリック元からプロジェクトルートを探索（親を辿ってmods.toml等を探す）
    let root = null;
    if (contextUri) {
        let dir = contextUri.fsPath;
        // ファイルの場合は親ディレクトリを使用
        if (fs.existsSync(dir) && !fs.statSync(dir).isDirectory()) {
            dir = path.dirname(dir);
        }
        // 親を辿ってbuild.gradleがあるディレクトリを探す
        let current = dir;
        while (current && current !== path.dirname(current)) {
            if (fs.existsSync(path.join(current, 'build.gradle')) ||
                fs.existsSync(path.join(current, 'build.gradle.kts'))) {
                root = current;
                break;
            }
            current = path.dirname(current);
        }
    }
    if (!root) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) return null;
        root = workspaceFolders[0].uri.fsPath;
    }

    // ローダー検出
    let loader = null;
    if (fs.existsSync(path.join(root, 'src/main/resources/META-INF/neoforge.mods.toml'))) {
        loader = 'neoforge';
    } else if (fs.existsSync(path.join(root, 'src/main/resources/META-INF/mods.toml'))) {
        loader = 'forge';
    } else if (fs.existsSync(path.join(root, 'src/main/resources/fabric.mod.json'))) {
        loader = 'fabric';
    }

    if (!loader) return null;

    // gradle.properties から modId を読み取る試み、見つからなければフォルダ名を使用
    let modId = path.basename(root);
    const gradlePropsPath = path.join(root, 'gradle.properties');
    if (fs.existsSync(gradlePropsPath)) {
        const props = fs.readFileSync(gradlePropsPath, 'utf8');
        const match = props.match(/mod_id\s*=\s*(.+)/);
        if (match) modId = match[1].trim();
    }

    // 言語検出: kotlin ソースがあれば kotlin、なければ java
    const kotlinDir = path.join(root, 'src/main/kotlin');
    const language = fs.existsSync(kotlinDir) ? 'kotlin' : 'java';

    // groupId 検出: ソースディレクトリ構造から推定
    let groupId = 'com.example';
    const srcDir = language === 'kotlin' ? 'src/main/kotlin' : 'src/main/java';
    const srcPath = path.join(root, srcDir);
    if (fs.existsSync(srcPath)) {
        // 最初のパッケージディレクトリを辿る
        const parts = [];
        let current = srcPath;
        while (true) {
            try {
                const entries = fs.readdirSync(current).filter(
                    e => fs.statSync(path.join(current, e)).isDirectory()
                );
                if (entries.length === 1) {
                    parts.push(entries[0]);
                    current = path.join(current, entries[0]);
                } else {
                    break;
                }
            } catch {
                break;
            }
        }
        if (parts.length >= 2) {
            // 最後のパートが modId と一致する場合は groupId から除外
            if (parts[parts.length - 1] === modId) {
                groupId = parts.slice(0, -1).join('.');
            } else {
                groupId = parts.join('.');
            }
        }
    }

    return { loader, modId, groupId, language, workspacePath: root };
}

/**
 * コンポーネント追加ウィザードを実行し、設定オブジェクトを返す
 * @param {import('vscode').Uri} [contextUri] 右クリックで選択されたフォルダ
 * @returns {Promise<object|null>}
 */
async function runComponentWizard(contextUri) {
    const project = detectProject(contextUri);
    if (!project) {
        vscode.window.showErrorMessage(
            'No Minecraft mod project detected in the current workspace. ' +
            'Please open a mod project folder first.'
        );
        return null;
    }

    // Step 1: コンポーネント種別選択
    const componentType = await vscode.window.showQuickPick(
        [
            { label: 'Block', value: 'block' },
            { label: 'Item', value: 'item' },
            { label: 'Entity', value: 'entity' },
            { label: 'Block Entity', value: 'blockentity' },
            { label: 'Creative Tab', value: 'creativetab' },
        ],
        { placeHolder: 'Select component type to add', ignoreFocusOut: true }
    );
    if (!componentType) return null;

    // Step 2: コンポーネント名入力
    const componentName = await vscode.window.showInputBox({
        prompt: 'Enter component name in PascalCase (e.g. RubyOre, DiamondSword)',
        placeHolder: 'RubyOre',
        ignoreFocusOut: true,
        validateInput: validateComponentName,
    });
    if (!componentName) return null;

    const packagePath = toPackagePath(project.groupId, project.modId);
    const packageName = `${project.groupId}.${project.modId}`;

    return {
        loader: project.loader,
        language: project.language,
        modId: project.modId,
        groupId: project.groupId,
        componentType: componentType.value,
        componentName,
        componentNameLower: toSnakeCase(componentName),
        componentNameUpper: toUpperSnakeCase(componentName),
        packagePath,
        packageName,
        workspacePath: project.workspacePath,
    };
}

module.exports = { runComponentWizard };
