const vscode = require('vscode');

// VS Code の workbench.colorCustomizations で扱える主要な色キー。
// 公式リファレンス: https://code.visualstudio.com/api/references/theme-color
// 全 700+ 個は多すぎるので、見た目に直結する主要キーをカテゴリ別に厳選。
const COLOR_CATEGORIES = [
    {
        id: 'editor',
        name: 'エディタ',
        keys: [
            { key: 'editor.background', desc: '本文の背景' },
            { key: 'editor.foreground', desc: '本文の文字色' },
            { key: 'editor.selectionBackground', desc: '選択範囲の背景' },
            { key: 'editor.selectionHighlightBackground', desc: '同一語のハイライト' },
            { key: 'editor.lineHighlightBackground', desc: 'カーソル行の背景' },
            { key: 'editor.findMatchBackground', desc: '検索ヒット (現在) の背景' },
            { key: 'editor.findMatchHighlightBackground', desc: '検索ヒット (その他) の背景' },
            { key: 'editorCursor.foreground', desc: 'カーソル' },
            { key: 'editorWhitespace.foreground', desc: '空白文字の点' },
            { key: 'editorLineNumber.foreground', desc: '行番号' },
            { key: 'editorLineNumber.activeForeground', desc: '現在行の行番号' },
            { key: 'editorIndentGuide.background1', desc: 'インデントガイド' },
            { key: 'editorIndentGuide.activeBackground1', desc: 'アクティブなインデントガイド' },
            { key: 'editorBracketMatch.background', desc: '対応する括弧の背景' },
            { key: 'editorBracketMatch.border', desc: '対応する括弧の枠' },
        ],
    },
    {
        id: 'activityBar',
        name: 'アクティビティバー (左端)',
        keys: [
            { key: 'activityBar.background', desc: '背景' },
            { key: 'activityBar.foreground', desc: 'アクティブなアイコン' },
            { key: 'activityBar.inactiveForeground', desc: '非アクティブなアイコン' },
            { key: 'activityBar.border', desc: '境界線' },
            { key: 'activityBar.activeBorder', desc: 'アクティブ項目の縦線' },
            { key: 'activityBarBadge.background', desc: 'バッジ背景' },
            { key: 'activityBarBadge.foreground', desc: 'バッジ文字' },
        ],
    },
    {
        id: 'sideBar',
        name: 'サイドバー (エクスプローラ)',
        keys: [
            { key: 'sideBar.background', desc: '背景' },
            { key: 'sideBar.foreground', desc: '文字色' },
            { key: 'sideBar.border', desc: '境界線' },
            { key: 'sideBarTitle.foreground', desc: 'タイトル文字' },
            { key: 'sideBarSectionHeader.background', desc: 'セクション見出しの背景' },
            { key: 'sideBarSectionHeader.foreground', desc: 'セクション見出しの文字' },
        ],
    },
    {
        id: 'statusBar',
        name: 'ステータスバー (下端)',
        keys: [
            { key: 'statusBar.background', desc: '通常時の背景' },
            { key: 'statusBar.foreground', desc: '文字色' },
            { key: 'statusBar.border', desc: '境界線' },
            { key: 'statusBar.noFolderBackground', desc: 'フォルダ未オープン時の背景' },
            { key: 'statusBar.debuggingBackground', desc: 'デバッグ中の背景' },
            { key: 'statusBarItem.hoverBackground', desc: 'ホバー時' },
            { key: 'statusBarItem.remoteBackground', desc: 'リモート接続表示の背景' },
            { key: 'statusBarItem.remoteForeground', desc: 'リモート接続表示の文字' },
        ],
    },
    {
        id: 'titleBar',
        name: 'タイトルバー (上端)',
        keys: [
            { key: 'titleBar.activeBackground', desc: 'アクティブ時の背景' },
            { key: 'titleBar.activeForeground', desc: 'アクティブ時の文字' },
            { key: 'titleBar.inactiveBackground', desc: '非アクティブ時の背景' },
            { key: 'titleBar.inactiveForeground', desc: '非アクティブ時の文字' },
            { key: 'titleBar.border', desc: '境界線' },
        ],
    },
    {
        id: 'tab',
        name: 'タブ',
        keys: [
            { key: 'tab.activeBackground', desc: 'アクティブタブ背景' },
            { key: 'tab.activeForeground', desc: 'アクティブタブ文字' },
            { key: 'tab.inactiveBackground', desc: '非アクティブタブ背景' },
            { key: 'tab.inactiveForeground', desc: '非アクティブタブ文字' },
            { key: 'tab.border', desc: 'タブ境界線' },
            { key: 'tab.activeBorder', desc: 'アクティブタブ下の線' },
            { key: 'tab.activeBorderTop', desc: 'アクティブタブ上の線' },
            { key: 'tab.hoverBackground', desc: 'ホバー時の背景' },
            { key: 'editorGroupHeader.tabsBackground', desc: 'タブ列全体の背景' },
        ],
    },
    {
        id: 'panel',
        name: 'パネル (ターミナル / 出力)',
        keys: [
            { key: 'panel.background', desc: 'パネル背景' },
            { key: 'panel.border', desc: '上端の境界線' },
            { key: 'panelTitle.activeForeground', desc: 'アクティブ見出し' },
            { key: 'panelTitle.inactiveForeground', desc: '非アクティブ見出し' },
            { key: 'panelTitle.activeBorder', desc: 'アクティブ見出しの下線' },
        ],
    },
    {
        id: 'terminal',
        name: 'ターミナル',
        keys: [
            { key: 'terminal.background', desc: '背景' },
            { key: 'terminal.foreground', desc: '通常文字' },
            { key: 'terminalCursor.foreground', desc: 'カーソル' },
            { key: 'terminal.ansiBlack', desc: 'ANSI 黒' },
            { key: 'terminal.ansiRed', desc: 'ANSI 赤' },
            { key: 'terminal.ansiGreen', desc: 'ANSI 緑' },
            { key: 'terminal.ansiYellow', desc: 'ANSI 黄' },
            { key: 'terminal.ansiBlue', desc: 'ANSI 青' },
            { key: 'terminal.ansiMagenta', desc: 'ANSI マゼンタ' },
            { key: 'terminal.ansiCyan', desc: 'ANSI シアン' },
            { key: 'terminal.ansiWhite', desc: 'ANSI 白' },
            { key: 'terminal.ansiBrightBlack', desc: 'ANSI 明るい黒' },
            { key: 'terminal.ansiBrightRed', desc: 'ANSI 明るい赤' },
            { key: 'terminal.ansiBrightGreen', desc: 'ANSI 明るい緑' },
            { key: 'terminal.ansiBrightYellow', desc: 'ANSI 明るい黄' },
            { key: 'terminal.ansiBrightBlue', desc: 'ANSI 明るい青' },
            { key: 'terminal.ansiBrightMagenta', desc: 'ANSI 明るいマゼンタ' },
            { key: 'terminal.ansiBrightCyan', desc: 'ANSI 明るいシアン' },
            { key: 'terminal.ansiBrightWhite', desc: 'ANSI 明るい白' },
        ],
    },
    {
        id: 'input',
        name: '入力欄 / セレクト',
        keys: [
            { key: 'input.background', desc: '背景' },
            { key: 'input.foreground', desc: '文字色' },
            { key: 'input.border', desc: '枠線' },
            { key: 'input.placeholderForeground', desc: 'プレースホルダ' },
            { key: 'dropdown.background', desc: 'ドロップダウン背景' },
            { key: 'dropdown.foreground', desc: 'ドロップダウン文字' },
            { key: 'dropdown.border', desc: 'ドロップダウン枠' },
        ],
    },
    {
        id: 'button',
        name: 'ボタン',
        keys: [
            { key: 'button.background', desc: '通常背景' },
            { key: 'button.foreground', desc: '文字色' },
            { key: 'button.hoverBackground', desc: 'ホバー時背景' },
            { key: 'button.secondaryBackground', desc: 'セカンダリ背景' },
            { key: 'button.secondaryForeground', desc: 'セカンダリ文字' },
            { key: 'button.secondaryHoverBackground', desc: 'セカンダリホバー' },
        ],
    },
    {
        id: 'list',
        name: 'リスト / ツリー',
        keys: [
            { key: 'list.activeSelectionBackground', desc: '選択中の項目背景' },
            { key: 'list.activeSelectionForeground', desc: '選択中の項目文字' },
            { key: 'list.inactiveSelectionBackground', desc: 'フォーカス外の選択背景' },
            { key: 'list.hoverBackground', desc: 'ホバー時背景' },
            { key: 'list.hoverForeground', desc: 'ホバー時文字' },
            { key: 'list.focusBackground', desc: 'フォーカス時背景' },
            { key: 'list.highlightForeground', desc: 'マッチハイライト' },
        ],
    },
    {
        id: 'scrollbar',
        name: 'スクロールバー',
        keys: [
            { key: 'scrollbar.shadow', desc: '影' },
            { key: 'scrollbarSlider.background', desc: 'スライダー' },
            { key: 'scrollbarSlider.hoverBackground', desc: 'ホバー時' },
            { key: 'scrollbarSlider.activeBackground', desc: 'ドラッグ中' },
        ],
    },
    {
        id: 'notification',
        name: '通知',
        keys: [
            { key: 'notifications.background', desc: '背景' },
            { key: 'notifications.foreground', desc: '文字色' },
            { key: 'notifications.border', desc: '枠線' },
            { key: 'notificationCenterHeader.background', desc: 'ヘッダ背景' },
            { key: 'notificationCenterHeader.foreground', desc: 'ヘッダ文字' },
        ],
    },
    {
        id: 'gitDecoration',
        name: 'Git デコレーション',
        keys: [
            { key: 'gitDecoration.addedResourceForeground', desc: '追加 (A)' },
            { key: 'gitDecoration.modifiedResourceForeground', desc: '変更 (M)' },
            { key: 'gitDecoration.deletedResourceForeground', desc: '削除 (D)' },
            { key: 'gitDecoration.untrackedResourceForeground', desc: '未追跡 (U)' },
            { key: 'gitDecoration.ignoredResourceForeground', desc: '無視' },
            { key: 'gitDecoration.conflictingResourceForeground', desc: '競合' },
        ],
    },
    {
        id: 'diff',
        name: 'Diff エディタ',
        keys: [
            { key: 'diffEditor.insertedTextBackground', desc: '追加行の背景' },
            { key: 'diffEditor.removedTextBackground', desc: '削除行の背景' },
            { key: 'diffEditor.insertedLineBackground', desc: '追加行の行背景' },
            { key: 'diffEditor.removedLineBackground', desc: '削除行の行背景' },
            { key: 'diffEditor.border', desc: '境界線' },
        ],
    },
    {
        id: 'badge',
        name: 'バッジ / プログレス',
        keys: [
            { key: 'badge.background', desc: 'バッジ背景' },
            { key: 'badge.foreground', desc: 'バッジ文字' },
            { key: 'progressBar.background', desc: 'プログレスバー' },
        ],
    },
    {
        id: 'focus',
        name: 'フォーカス / リンク',
        keys: [
            { key: 'focusBorder', desc: '全体のフォーカス枠' },
            { key: 'foreground', desc: '基本文字色' },
            { key: 'descriptionForeground', desc: '説明文' },
            { key: 'errorForeground', desc: 'エラー文字' },
            { key: 'textLink.foreground', desc: 'リンク' },
            { key: 'textLink.activeForeground', desc: 'リンク (アクティブ)' },
        ],
    },
];

const ALL_MANAGED_KEYS = COLOR_CATEGORIES.flatMap((c) => c.keys.map((k) => k.key));

async function handleThemeColorEditor() {
    const panel = vscode.window.createWebviewPanel(
        'mcModUtility.themeColorEditor',
        'テーマカラーエディタ',
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.webview.html = renderHtml(panel.webview);

    const sendState = () => {
        const config = vscode.workspace.getConfiguration('workbench');
        const custom = config.get('colorCustomizations') || {};
        const themeName = vscode.workspace.getConfiguration('workbench').get('colorTheme');
        const kind = vscode.window.activeColorTheme && vscode.window.activeColorTheme.kind;
        panel.webview.postMessage({
            type: 'state',
            categories: COLOR_CATEGORIES,
            custom,
            themeName,
            themeKind: kind, // 1=Light, 2=Dark, 3=HighContrast, 4=HighContrastLight
        });
    };

    panel.webview.onDidReceiveMessage(async (msg) => {
        const config = vscode.workspace.getConfiguration('workbench');
        const current = { ...(config.get('colorCustomizations') || {}) };

        if (msg.type === 'ready') {
            sendState();
            return;
        }
        if (msg.type === 'set') {
            const { key, value } = msg;
            if (value && /^#[0-9a-fA-F]{3,8}$/.test(value)) {
                current[key] = value;
            } else if (!value) {
                delete current[key];
            } else {
                return;
            }
            await config.update('colorCustomizations', current, vscode.ConfigurationTarget.Global);
            return;
        }
        if (msg.type === 'resetKey') {
            delete current[msg.key];
            await config.update('colorCustomizations', current, vscode.ConfigurationTarget.Global);
            sendState();
            return;
        }
        if (msg.type === 'resetAll') {
            for (const k of ALL_MANAGED_KEYS) delete current[k];
            await config.update('colorCustomizations', current, vscode.ConfigurationTarget.Global);
            sendState();
            return;
        }
        if (msg.type === 'openSettingsJson') {
            await vscode.commands.executeCommand('workbench.action.openSettingsJson');
            return;
        }
    });

    const sub = vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('workbench.colorCustomizations') ||
            e.affectsConfiguration('workbench.colorTheme')) {
            sendState();
        }
    });
    panel.onDidDispose(() => sub.dispose());
}

function renderHtml(webview) {
    const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';`;
    return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>テーマカラーエディタ</title>
<style>
:root {
    color-scheme: light dark;
}
body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    margin: 0;
    padding: 0;
}
header {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-panel-border);
    padding: 12px 16px;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
}
header h1 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
}
header .theme-info {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
}
#search {
    flex: 1 1 240px;
    min-width: 160px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    padding: 6px 10px;
    font-family: inherit;
    font-size: inherit;
}
#search:focus {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
}
button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 6px 12px;
    font-family: inherit;
    font-size: inherit;
    cursor: pointer;
    border-radius: 2px;
}
button:hover { background: var(--vscode-button-hoverBackground); }
button.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
}
button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }

nav.toc {
    position: sticky;
    top: 56px;
    z-index: 9;
    background: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-panel-border);
    padding: 8px 16px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 12px;
}
nav.toc a {
    color: var(--vscode-textLink-foreground);
    text-decoration: none;
    padding: 2px 8px;
    border-radius: 10px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
}
nav.toc a:hover { background: var(--vscode-button-hoverBackground); color: var(--vscode-button-foreground); }

main { padding: 16px; }

section.category {
    margin-bottom: 24px;
}
section.category h2 {
    margin: 0 0 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--vscode-panel-border);
    font-size: 13px;
    font-weight: 600;
}
.row {
    display: grid;
    grid-template-columns: 32px minmax(180px, 1fr) minmax(160px, 2fr) 120px 60px;
    gap: 10px;
    align-items: center;
    padding: 4px 0;
}
.row.hidden { display: none; }
.chip-wrap {
    position: relative;
    width: 28px;
    height: 28px;
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid var(--vscode-panel-border);
    background:
        linear-gradient(45deg, #888 25%, transparent 25%) 0 0/8px 8px,
        linear-gradient(-45deg, #888 25%, transparent 25%) 0 4px/8px 8px,
        linear-gradient(45deg, transparent 75%, #888 75%) 4px -4px/8px 8px,
        linear-gradient(-45deg, transparent 75%, #888 75%) -4px 0/8px 8px,
        #444;
}
.chip {
    position: absolute;
    inset: 0;
    background: transparent;
}
.row input[type="color"] {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
    opacity: 0;
}
.key { font-family: var(--vscode-editor-font-family); font-size: 12px; word-break: break-all; }
.desc { color: var(--vscode-descriptionForeground); font-size: 12px; }
.row input[type="text"] {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    padding: 4px 6px;
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    width: 100%;
    box-sizing: border-box;
}
.row input[type="text"].invalid { outline: 1px solid var(--vscode-errorForeground); }
.row .reset {
    font-size: 11px;
    padding: 3px 8px;
    background: transparent;
    color: var(--vscode-descriptionForeground);
    border: 1px solid var(--vscode-panel-border);
}
.row .reset:hover { color: var(--vscode-foreground); background: var(--vscode-list-hoverBackground); }
.row .reset:disabled { opacity: 0.3; cursor: default; }

.hint {
    margin: 8px 16px 16px;
    padding: 8px 12px;
    background: var(--vscode-textBlockQuote-background, transparent);
    border-left: 3px solid var(--vscode-textLink-foreground);
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
}
</style>
</head>
<body>
<header>
    <h1>テーマカラーエディタ</h1>
    <span class="theme-info" id="themeInfo"></span>
    <input id="search" type="text" placeholder="キー名・説明で絞り込み" />
    <button id="openJson" class="secondary" type="button">settings.json を開く</button>
    <button id="resetAll" class="secondary" type="button">カスタム値を全部リセット</button>
</header>
<nav class="toc" id="toc"></nav>
<p class="hint">編集はユーザー設定 (グローバル) の <code>workbench.colorCustomizations</code> に即座に書き込まれます。8桁の16進 (#AARRGGBB) も入力欄で指定できます。</p>
<main id="main"></main>

<script>
const vscode = acquireVsCodeApi();
let categories = [];
let custom = {};

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function chipBg(value) {
    return value && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : 'transparent';
}

function build() {
    const main = document.getElementById('main');
    main.innerHTML = '';
    const toc = document.getElementById('toc');
    toc.innerHTML = '';

    categories.forEach((cat) => {
        const link = document.createElement('a');
        link.href = '#cat-' + cat.id;
        link.textContent = cat.name;
        toc.appendChild(link);

        const section = document.createElement('section');
        section.className = 'category';
        section.id = 'cat-' + cat.id;
        section.innerHTML = '<h2>' + escapeHtml(cat.name) + '</h2>';

        cat.keys.forEach((k) => {
            const cur = custom[k.key] || '';
            const row = document.createElement('div');
            row.className = 'row';
            row.dataset.key = k.key.toLowerCase();
            row.dataset.desc = (k.desc || '').toLowerCase();
            row.innerHTML = \`
                <div class="chip-wrap">
                    <div class="chip" style="background:\${escapeHtml(chipBg(cur))}"></div>
                    <input type="color" data-key="\${escapeHtml(k.key)}" value="\${escapeHtml(/^#[0-9a-fA-F]{6}$/.test(cur) ? cur : '#000000')}">
                </div>
                <div>
                    <div class="key">\${escapeHtml(k.key)}</div>
                    <div class="desc">\${escapeHtml(k.desc || '')}</div>
                </div>
                <input type="text" class="hex" data-key="\${escapeHtml(k.key)}" value="\${escapeHtml(cur)}" placeholder="#RRGGBB / #AARRGGBB" />
                <div></div>
                <button type="button" class="reset" data-key="\${escapeHtml(k.key)}" \${cur ? '' : 'disabled'}>Reset</button>
            \`;
            section.appendChild(row);
        });

        main.appendChild(section);
    });

    // Wire events
    main.querySelectorAll('input[type="color"]').forEach((el) => {
        el.addEventListener('input', (e) => {
            const key = e.target.dataset.key;
            const value = e.target.value; // #rrggbb (no alpha)
            applyChange(key, value);
        });
    });
    main.querySelectorAll('input.hex').forEach((el) => {
        el.addEventListener('input', (e) => {
            const key = e.target.dataset.key;
            const value = e.target.value.trim();
            const isValid = value === '' || /^#[0-9a-fA-F]{3,8}$/.test(value);
            e.target.classList.toggle('invalid', !isValid);
            if (!isValid) return;
            applyChange(key, value);
        });
    });
    main.querySelectorAll('button.reset').forEach((el) => {
        el.addEventListener('click', () => {
            const key = el.dataset.key;
            vscode.postMessage({ type: 'resetKey', key });
        });
    });

    applySearch();
}

function applyChange(key, value) {
    if (value) custom[key] = value; else delete custom[key];
    updateRow(key);
    vscode.postMessage({ type: 'set', key, value });
}

function updateRow(key) {
    const row = document.querySelector('.row[data-key="' + CSS.escape(key.toLowerCase()) + '"]');
    if (!row) return;
    const cur = custom[key] || '';
    const chip = row.querySelector('.chip');
    chip.style.background = chipBg(cur);
    const resetBtn = row.querySelector('button.reset');
    resetBtn.disabled = !cur;
    const hex = row.querySelector('input.hex');
    if (hex && document.activeElement !== hex) hex.value = cur;
    const picker = row.querySelector('input[type="color"]');
    if (picker && /^#[0-9a-fA-F]{6}$/.test(cur)) picker.value = cur;
}

function applySearch() {
    const q = document.getElementById('search').value.trim().toLowerCase();
    document.querySelectorAll('.row').forEach((row) => {
        const match = !q || row.dataset.key.includes(q) || row.dataset.desc.includes(q);
        row.classList.toggle('hidden', !match);
    });
    document.querySelectorAll('section.category').forEach((sec) => {
        const anyVisible = sec.querySelectorAll('.row:not(.hidden)').length > 0;
        sec.style.display = anyVisible ? '' : 'none';
    });
}

document.getElementById('search').addEventListener('input', applySearch);
document.getElementById('openJson').addEventListener('click', () => {
    vscode.postMessage({ type: 'openSettingsJson' });
});
document.getElementById('resetAll').addEventListener('click', () => {
    if (confirm('管理している全色のカスタム値を削除します。よろしいですか？')) {
        vscode.postMessage({ type: 'resetAll' });
    }
});

window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'state') {
        categories = msg.categories;
        custom = msg.custom || {};
        const themeInfo = document.getElementById('themeInfo');
        const kindLabel = { 1: 'Light', 2: 'Dark', 3: 'High Contrast', 4: 'High Contrast Light' }[msg.themeKind] || '';
        themeInfo.textContent = msg.themeName ? \`現在のテーマ: \${msg.themeName}\${kindLabel ? ' (' + kindLabel + ')' : ''}\` : '';
        build();
    }
});

vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}

module.exports = { handleThemeColorEditor, COLOR_CATEGORIES };
