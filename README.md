# MC Mod Utility

Minecraft Mod 開発のプロジェクト構成を自動生成する VSCode 拡張機能です。

## 機能

### 1. New Mod Project - Mod プロジェクト新規作成

コマンドパレットから `MC Mod Utility: New Mod Project` を実行すると、ウィザード形式で Mod プロジェクトを一括生成します。

**対応 Mod ローダー:**
- Forge
- Fabric
- NeoForge

**対応 Minecraft バージョン:**
- 1.20.1
- 1.20.4
- 1.21.1

**対応言語:**
- Java
- Kotlin

**生成されるファイル:**
- `build.gradle` / `settings.gradle` / `gradle.properties`
- メインクラス (`@Mod` アノテーション付き)
- Mod メタデータ (`mods.toml` / `fabric.mod.json`)
- `pack.mcmeta`
- Gradle Wrapper 設定
- `.gitignore`

### 2. Add Component - コンポーネント追加

既存の Mod プロジェクトを開いた状態で `MC Mod Utility: Add Component` を実行すると、コンポーネントのテンプレートを生成します。

**追加可能なコンポーネント:**
- Block (ブロック)
- Item (アイテム)
- Entity (エンティティ)
- Block Entity (ブロックエンティティ)
- Creative Tab (クリエイティブタブ)

生成されたファイルにはレジストリ登録のコメントヒントが含まれます。

## 使い方

### プロジェクト新規作成

1. コマンドパレットを開く (`Ctrl+Shift+P`)
2. `MC Mod Utility: New Mod Project` を選択
3. ウィザードに従って入力:
   - Mod ローダーを選択 (Forge / Fabric / NeoForge)
   - Minecraft バージョンを選択
   - 言語を選択 (Java / Kotlin)
   - Mod ID を入力 (例: `my_cool_mod`)
   - Mod 表示名を入力 (例: `My Cool Mod`)
   - Group ID を入力 (例: `com.example`)
   - 出力先フォルダを選択
4. プロジェクトが生成され、新しいウィンドウで開きます

### コンポーネント追加

1. 既存の Mod プロジェクトフォルダを VSCode で開く
2. コマンドパレットを開く (`Ctrl+Shift+P`)
3. `MC Mod Utility: Add Component` を選択
4. コンポーネント種別を選択 (Block / Item / Entity / Block Entity / Creative Tab)
5. コンポーネント名を PascalCase で入力 (例: `RubyOre`)
6. ファイルが生成され、エディタで開きます

> **注意:** Add Component はワークスペースの `mods.toml` / `fabric.mod.json` を検出して Mod ローダーと言語を自動判別します。

## 開発・デバッグ

1. このプロジェクトを VSCode で開く
2. `F5` キーを押して Extension Development Host を起動
3. 新しく開いたウィンドウでコマンドパレットから機能をテスト

## 生成されるプロジェクト構成例

### Forge (Java) の場合

```
my_cool_mod/
├── build.gradle
├── settings.gradle
├── gradle.properties
├── .gitignore
├── gradle/wrapper/gradle-wrapper.properties
└── src/main/
    ├── java/com/example/my_cool_mod/
    │   └── MyCoolMod.java
    └── resources/
        ├── META-INF/mods.toml
        └── pack.mcmeta
```

### Fabric (Java) の場合

```
my_cool_mod/
├── build.gradle
├── settings.gradle
├── gradle.properties
├── .gitignore
├── gradle/wrapper/gradle-wrapper.properties
└── src/main/
    ├── java/com/example/my_cool_mod/
    │   └── MyCoolMod.java
    └── resources/
        ├── fabric.mod.json
        └── pack.mcmeta
```

### NeoForge (Java) の場合

```
my_cool_mod/
├── build.gradle
├── settings.gradle
├── gradle.properties
├── .gitignore
├── gradle/wrapper/gradle-wrapper.properties
└── src/main/
    ├── java/com/example/my_cool_mod/
    │   └── MyCoolMod.java
    └── resources/
        ├── META-INF/neoforge.mods.toml
        └── pack.mcmeta
```

## リリースノート

### 0.1.0

- Mod プロジェクト新規作成機能 (Forge / Fabric / NeoForge, Java / Kotlin)
- コンポーネント追加機能 (Block, Item, Entity, Block Entity, Creative Tab)
- Minecraft 1.20.1, 1.20.4, 1.21.1 対応
