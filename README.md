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

---

## 4. MAW アドオン支援 — 「The four primitives and Weapons」のアドオンを作る

本体MOD [The four primitives and Weapons](https://github.com/Drowse-Lab/The-four-primitives-and-Weapons)（以下 MAW）のアドオン開発を、**JSON の書き方を覚えなくても** できるようにする機能群です。

### 自動認識

開いたプロジェクトが MAW アドオンだと判定されると、専用の UI が有効になります。判定材料は次のどれか 1 つでも当たれば OK:

| 材料 | 説明 |
|---|---|
| `.maw-addon.json` | この拡張機能が作った / リブランドしたアドオンの目印 |
| `META-INF/mods.toml` | 本体MOD (`the_four_primitives_and_weapons`) への依存が書いてある |
| `data/<ns>/weapon_types/` `maw_saya/` | MAW のデータ駆動ディレクトリがある |
| `build.gradle` | 本体MOD jar を参照している |

認識されると:

- ステータスバーに `⚔ MAW: <modId>` が出る（クリックで武器スタジオ）
- エクスプローラーに **「MAW アドオン」ビュー** が出る — その addon が今宣言している武器 / 武器タイプ / 納刀の一覧。武器タイプ未登録の武器には ⚠ が付く（＝スキルが使えない状態なので気づける）
- Mod ID がサンプルのまま (`the_four_primitives_and_weapons_addons_sample`) だと警告表示

### ⚔ 武器スタジオ（`MAW: 武器スタジオを開く`）

フォームを埋めるだけで、武器 1 つに必要な **6〜8 ファイルをまとめて生成・追記**します。

```
きほん      名前 / アイテムID / 武器タイプ（新規タイプも作れる）
つよさ      攻撃力・攻撃速度・耐久・エンチャント性・レア度（スライダー）
みため      刃と柄の色を選ぶ → 16x16 のテクスチャを自動生成（プレビュー付き）
こうげき    ブロックを ON にすると、そのぶん Java コードが組み上がる
            └ 背後から攻撃で追加ダメージ / 吸血 / 炎上 / 状態異常 /
              落雷 / 範囲攻撃 / メッセージ表示 / 右クリックで自己強化
さや        本体MOD の鞘モデルを継承して納刀対応
```

生成/追記されるもの:

| ファイル | 内容 |
|---|---|
| `item/<Name>Item.java` | アイテム本体（選んだブロックが `hurtEnemy` に展開される） |
| `init/AddonItems.java` | `RegistryObject` の登録行と import を**追記** |
| `models/item/<id>.json` | アイテムモデル |
| `textures/item/<id>.png` | 16x16 プレースホルダーテクスチャ |
| `lang/ja_jp.json` `en_us.json` | 表示名 |
| `data/<ns>/weapon_types/weapons.json` | 武器タイプ登録（これがないと K キーのスキルが使えない） |
| `data/<ns>/weapon_stats/weapons.json` | ステータス上書き（任意） |
| `data/<ns>/maw_saya/saya.jsonc` + 鞘モデル | 納刀対応（任意） |

既存ファイルは**上書きせずテキストを差し込む**ので、コメントも整形も壊れません。右側のペインに、生成される内容がリアルタイムでプレビューされます。

### 本体MOD の情報を動的に読む

武器タイプやモーションID（`thrust` / `spin_slash` / `dodge` …）、鞘の種類、継承できる鞘モデルの一覧は、拡張機能にハードコードせず **本体MOD から直接読みます**。読み込み順:

1. `gradle.properties` の `mawSourceProject`
2. 環境変数 `MAW_DIR`
3. `~/The-four-primitives-and-Weapons`
4. アドオン内の `.maw-src/`
5. アドオン内の `libs/local/.../*.jar`（jar から直接読む）
6. どれも無ければ内蔵スナップショット

本体MOD が武器タイプを追加しても、拡張機能を更新せずに追従します。読み込み元は `MAW: 本体MODの読み込み元を表示` で確認できます。

### その他のコマンド

| コマンド | 説明 |
|---|---|
| `MAW: アドオンを新規作成` | サンプルテンプレートを複製し、Mod ID / パッケージ / 作者を一括で書き換えて新規アドオンを作る（gradlew・CI・本体jar取得スクリプト込み） |
| `MAW: Mod ID を変更 (リブランド)` | サンプルのままのプロジェクトを自分の MOD に作り替える。テキスト置換だけでなく **Java パッケージ / `assets/` / `data/` のフォルダ名まで移動**する |
| `MAW: 情報を再読み込み` | 本体MOD のカタログとアドオンの状態を読み直す |

### 設定 (settings.json)

| 設定キー | デフォルト | 説明 |
|---|---|---|
| `mc-mod-utility.maw.templatePath` | `""` | 新規作成時に雛形にするローカルプロジェクトのパス |

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
