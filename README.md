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

### 3. Rotation Editor - 回転パラメータ調整

コマンドパレットから `MC Mod Utility: Rotation Editor` を実行すると、Javaファイル内の回転パラメータをスライダーで調整できるWebviewパネルが開きます。

**どのMODプロジェクトでも使えます (Forge / Fabric / NeoForge / Quilt)**

#### 基本の使い方

1. レンダラー等のJava/Kotlinファイルにマーカーコメントを追加する:

```java
// @RotationParams(表示名)
public static float YAW = 0f;   // Y軸回転
public static float PITCH = 90f; // X軸回転
public static float ROLL = 0f;   // Z軸回転
public static float SCALE = 1.0f; // サイズ
// @EndRotationParams
```

2. コマンドパレット → `MC Mod Utility: Rotation Editor` を実行
3. スライダーまたは数値入力でパラメータを調整
4. 値はJavaファイルにリアルタイムで書き戻されます

#### ゲーム内コマンド連携 (cmd=)

`@RotationParams` に `cmd=` オプションを付けると、現在のパラメータ値からMinecraftコマンドを生成・コピーできます。

```java
// @RotationParams(Gate直刀, cmd=/test gaterot {YAW_OFFSET} {PITCH_OFFSET} {ROLL_OFFSET} {SCALE})
public static float YAW_OFFSET = 0f;   // Y軸回転オフセット
public static float PITCH_OFFSET = 90f; // X軸回転（90=縦向き）
public static float ROLL_OFFSET = 45f;  // Z軸回転（刃の傾き）
public static float SCALE = 0.8f;       // 表示サイズ
// @EndRotationParams
```

- `{変数名}` がスライダーの現在値に置換されます
- Rotation Editor上にコマンドプレビューと **Copy** ボタンが表示されます
- コピーしたコマンドをMinecraftのチャットに貼り付けて、ゲーム内でリアルタイムに確認できます

#### マーカーの書式ルール

| 要素 | 書式 | 例 |
|---|---|---|
| ブロック開始 | `// @RotationParams(表示名)` | `// @RotationParams(Gate直刀)` |
| コマンド付き | `// @RotationParams(名前, cmd=コマンド)` | `// @RotationParams(剣, cmd=/rot {YAW} {PITCH})` |
| パラメータ行 | `public static float 変数名 = 値f; // ラベル` | `public static float YAW = 0f; // Y軸回転` |
| ブロック終了 | `// @EndRotationParams` | |

- パラメータ行には `// ラベル` のコメントが必須です（Rotation Editorに表示されます）
- `float` と `double` に対応
- 1ファイルに複数の `@RotationParams` ブロックを配置可能
- `cmd=` の `{変数名}` は同ブロック内のパラメータ名と一致させてください

#### 設定 (settings.json)

| 設定キー | デフォルト | 説明 |
|---|---|---|
| `mc-mod-utility.rotationEditor.searchPatterns` | `["src/main/java/**/*.java", "src/main/kotlin/**/*.kt", "src/client/java/**/*.java", "src/client/kotlin/**/*.kt", "src/**/*.java", "src/**/*.kt"]` | 検索するglobパターン |
| `mc-mod-utility.rotationEditor.excludePatterns` | `"**/build/**"` | 除外パターン |
| `mc-mod-utility.rotationEditor.maxFiles` | `200` | 最大スキャンファイル数 |

独自のプロジェクト構造を使っている場合は `searchPatterns` にパスを追加してください。

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

### 0.1.1

- Rotation Editor: `cmd=` オプションでゲーム内コマンド連携に対応
- Rotation Editor: 検索パスを設定で変更可能に（任意のMODプロジェクト構造に対応）

### 0.1.0

- Mod プロジェクト新規作成機能 (Forge / Fabric / NeoForge, Java / Kotlin)
- コンポーネント追加機能 (Block, Item, Entity, Block Entity, Creative Tab)
- Rotation Editor: スライダーで回転パラメータを調整
- Minecraft 1.20.1, 1.20.4, 1.21.1 対応
