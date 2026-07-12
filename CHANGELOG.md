# Change Log

All notable changes to the "mc-mod-utility" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.2.0]

MAW（The four primitives and Weapons）アドオン開発支援を追加。

- **アドオン自動認識** — `.maw-addon.json` / `mods.toml` の本体依存 / `weapon_types`・`maw_saya` ディレクトリ / `build.gradle` から MAW アドオンだと判定し、ステータスバー・専用ビュー・コマンドを有効化する
- **⚔ 武器スタジオ** — フォームとブロックを組み合わせるだけで、武器1本に必要な 6〜8 ファイル（Java クラス・レジストリ登録・モデル・テクスチャ・lang・weapon_types・weapon_stats・鞘）を生成/追記する Webview。生成内容はリアルタイムでプレビューされる
- **本体MOD の情報を動的に読む** — 武器タイプ・モーションID・鞘モデルを、本体MOD のソースまたは jar から直接読む（見つからなければ内蔵スナップショット）
- **MAW アドオンビュー** — 宣言済みの武器 / 武器タイプ / 納刀を一覧。武器タイプ未登録の武器には警告を出す
- **アドオン新規作成 / リブランド** — テンプレートを複製し、Mod ID・Java パッケージ・assets/data フォルダ名まで一括で書き換える

## [Unreleased]

- Initial release