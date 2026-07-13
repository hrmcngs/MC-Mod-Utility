# Change Log

All notable changes to the "mc-mod-utility" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.3.1]

- 3D モデルのテクスチャは**鉄（iron）の武器のものをサンプルとして採用**するようにした（刃・鍔・柄・柄頭・グリップ・ガードが一通り揃っていて、塗り替えの下地に向くため）
- **鞘（saya）のテクスチャも複製する**ようにした。本体の鞘モデルは「刃と鞘」「鍔・柄・柄頭」が親子に分かれているので、parent チェーンを辿って全スロットを解決してからコピーする
- 鞘モデルは「形を継承 + テクスチャ複製」と「形ごと複製（Blockbench で改造）」を選べる

## [0.3.0]

- **3Dモデルテンプレート** — 本体MOD の 3Dベース（`custom/weapon/<種類>/…`）と鞘モデルを読み込み、4 方式（平面 / 見た目を継承 / 形は本体+テクスチャ自前 / 形ごと複製して Blockbench で改造）から選べるようにした。テクスチャスロット（`#0`=刃、`#1`=鍔 …）は本体の既存武器の割り当てから逆算して日本語ラベルを付ける
- 3D の「テクスチャ自前」「複製」方式では、本体のテクスチャ PNG をアドオンにコピーするので、塗り替えるだけでオリジナルの見た目になる
- コマンド `MAW: 3Dモデルテンプレートを挿入` を追加（武器スタジオを使わずモデルだけ差し替えたい時用）
- README に使い方（5分で武器を1本追加する手順）を追記

## [0.2.0]

MAW（The four primitives and Weapons）アドオン開発支援を追加。

- **アドオン自動認識** — `.maw-addon.json` / `mods.toml` の本体依存 / `weapon_types`・`maw_saya` ディレクトリ / `build.gradle` から MAW アドオンだと判定し、ステータスバー・専用ビュー・コマンドを有効化する
- **⚔ 武器スタジオ** — フォームとブロックを組み合わせるだけで、武器1本に必要な 6〜8 ファイル（Java クラス・レジストリ登録・モデル・テクスチャ・lang・weapon_types・weapon_stats・鞘）を生成/追記する Webview。生成内容はリアルタイムでプレビューされる
- **本体MOD の情報を動的に読む** — 武器タイプ・モーションID・鞘モデルを、本体MOD のソースまたは jar から直接読む（見つからなければ内蔵スナップショット）
- **MAW アドオンビュー** — 宣言済みの武器 / 武器タイプ / 納刀を一覧。武器タイプ未登録の武器には警告を出す
- **アドオン新規作成 / リブランド** — テンプレートを複製し、Mod ID・Java パッケージ・assets/data フォルダ名まで一括で書き換える

## [Unreleased]

- Initial release