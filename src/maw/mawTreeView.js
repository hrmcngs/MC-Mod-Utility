const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { readMawProject } = require('./mawProject');
const { loadCatalog } = require('./mawCatalog');

// =====================================================================
// エクスプローラーに出る「MAW アドオン」ビュー。
//
// テンプレートを使ったプロジェクトだと認識できた時だけ表示され、
// そのアドオンが今どんな武器・武器タイプ・鞘を宣言しているかを一覧する。
// 「どのファイルに何が書いてあるか」を覚えなくてよくするのが目的。
// =====================================================================

class MawTreeProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.root = null;
    }

    /** @param {string|null} root */
    setRoot(root) {
        this.root = root;
        this.refresh();
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element) {
        return element;
    }

    getChildren(element) {
        if (!this.root) return [];
        const project = readMawProject(this.root);
        if (!project) return [];

        if (!element) return this.rootNodes(project);
        if (element.sectionKey === 'weapons') return this.weaponNodes(project);
        if (element.sectionKey === 'types') return this.typeNodes(project);
        if (element.sectionKey === 'saya') return this.sayaNodes(project);
        if (element.sectionKey === 'files') return this.fileNodes(project);
        return [];
    }

    rootNodes(project) {
        const catalog = loadCatalog(project.root);

        const info = new vscode.TreeItem(project.modId);
        info.description = project.isSampleTemplate ? 'サンプルのままの ID' : 'MAW アドオン';
        info.iconPath = new vscode.ThemeIcon(project.isSampleTemplate ? 'warning' : 'verified');
        info.tooltip = new vscode.MarkdownString(
            `**MAW アドオンとして認識中**\n\n` +
            `- Mod ID: \`${project.modId}\`\n` +
            `- パッケージ: \`${project.basePackage || '不明'}\`\n` +
            `- 登録クラス: \`${project.registry ? project.registry.className : '不明'}\`\n` +
            `- 本体MOD: ${catalog.source.label}\n` +
            (project.isSampleTemplate ? '\n⚠ Mod ID がサンプルのままです。「MAW: Mod ID を変更」でリブランドできます。' : '')
        );
        if (project.isSampleTemplate) {
            info.command = { command: 'mc-mod-utility.mawRebrand', title: 'Mod ID を変更' };
        }

        return [
            info,
            section('⚔ 武器', 'weapons', project.weapons.length),
            section('🗡 武器タイプ', 'types', project.weaponTypes.length),
            section('🥋 鞘 (納刀)', 'saya', project.sayaEntries.length),
            section('📄 主要ファイル', 'files'),
        ];
    }

    weaponNodes(project) {
        if (project.weapons.length === 0) {
            return [hint('まだ武器がありません — 「MAW: 武器スタジオ」で作れます', 'mc-mod-utility.mawWeaponStudio')];
        }

        const declared = new Map();
        for (const t of project.weaponTypes) {
            for (const item of t.items) declared.set(item, t.id);
        }

        return project.weapons.map(w => {
            const ref = `${project.namespace}:${w.id}`;
            const item = new vscode.TreeItem(w.id);
            const type = declared.get(ref);
            item.description = type ? `${type}` : '⚠ 武器タイプ未登録';
            item.iconPath = new vscode.ThemeIcon(type ? 'tools' : 'warning');
            item.tooltip = type
                ? `${ref}\n武器タイプ: ${type}`
                : `${ref}\n\nweapon_types に登録されていないため、スキル (K キー) が使えません。`;

            const file = w.className
                ? path.join(project.javaSrc, (project.basePackage || '').replace(/\./g, path.sep), 'item', `${w.className}.java`)
                : null;
            if (file && fs.existsSync(file)) {
                item.command = { command: 'vscode.open', title: '開く', arguments: [vscode.Uri.file(file)] };
            }
            return item;
        });
    }

    typeNodes(project) {
        if (project.weaponTypes.length === 0) {
            return [hint('武器タイプの宣言がありません')];
        }
        return project.weaponTypes.map(t => {
            const item = new vscode.TreeItem(`${t.displayName} (${t.id})`);
            item.description = `${t.items.length} 個`;
            item.iconPath = new vscode.ThemeIcon(t.isNewType ? 'symbol-class' : 'symbol-interface');
            item.tooltip = (t.isNewType ? 'このアドオンが定義した新しいタイプ\n\n' : '本体MODのタイプに追加\n\n') + t.items.join('\n');
            item.command = openFile(project.paths.weaponTypes);
            return item;
        });
    }

    sayaNodes(project) {
        if (project.sayaEntries.length === 0) {
            return [hint('納刀登録がありません')];
        }
        return project.sayaEntries.map(e => {
            const item = new vscode.TreeItem(e.itemId.split(':').pop());
            item.description = e.sayaType;
            item.iconPath = new vscode.ThemeIcon('package');
            item.tooltip = `${e.itemId}\n→ ${e.model}`;
            item.command = openFile(project.paths.saya);
            return item;
        });
    }

    fileNodes(project) {
        const files = [
            ['mods.toml (MOD情報・依存)', project.paths.modsToml],
            ['weapon_types (スキル割り当て)', project.paths.weaponTypes],
            ['weapon_stats (ステータス上書き)', project.paths.weaponStats],
            ['maw_saya (納刀)', project.paths.saya],
            ['lang ja_jp (日本語名)', project.paths.langJa],
        ];
        if (project.registry) files.push([`${project.registry.className} (アイテム登録)`, project.registry.file]);
        if (project.mainClassFile) files.push([`${project.mainClass} (メインクラス)`, project.mainClassFile]);

        return files.map(([label, file]) => {
            const item = new vscode.TreeItem(label);
            const exists = fs.existsSync(file);
            item.iconPath = new vscode.ThemeIcon(exists ? 'file' : 'circle-slash');
            item.description = exists ? '' : '未作成';
            item.tooltip = file;
            if (exists) item.command = openFile(file);
            return item;
        });
    }
}

function section(label, key, count) {
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
    item.sectionKey = key;
    if (count !== undefined) item.description = String(count);
    item.contextValue = 'mawSection';
    return item;
}

function hint(text, command) {
    const item = new vscode.TreeItem(text);
    item.iconPath = new vscode.ThemeIcon('lightbulb');
    if (command) item.command = { command, title: text };
    return item;
}

function openFile(file) {
    return { command: 'vscode.open', title: '開く', arguments: [vscode.Uri.file(file)] };
}

module.exports = { MawTreeProvider };
