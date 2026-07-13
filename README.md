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

### 使い方 — 5 分で武器を 1 本追加する

**手順 0. アドオンを用意する**

すでにアドオンがあるならそれを VS Code で開くだけ。無ければコマンドパレット（`Cmd/Ctrl + Shift + P`）で `MAW: アドオンを新規作成` → 雛形の入手元（GitHub / 手元のアドオン）→ Mod ID・表示名・作者・Java パッケージ → 作成先フォルダ、と答えるだけで、gradlew や CI 込みのプロジェクトができます。

サンプルを `git clone` しただけの状態（Mod ID が `..._addons_sample` のまま）なら、`MAW: Mod ID を変更 (リブランド)` を実行すると、Java パッケージや `assets/` `data/` のフォルダ名まで含めて自分の MOD に作り替えられます。

**手順 1. 認識されているか確認する**

アドオンとして認識されると、ステータスバー左下に `⚔ MAW: <modId>` が出て、エクスプローラーに **MAW アドオン** ビューが増えます。出ていなければ `MAW: 情報を再読み込み` を実行してください。

**手順 2. 武器スタジオを開く**

ステータスバーの `⚔ MAW: …` をクリック（またはコマンドパレットで `MAW: 武器スタジオを開く`）。

**手順 3. 上から順に埋める**

| セクション | やること |
|---|---|
| 🟦 きほん | 名前を入れる（アイテム ID は英語名から自動で埋まる）／**武器タイプ**を選ぶ ← ここが一番大事。選んだタイプのスキルが `K` キーの画面で使えるようになる |
| 🟧 つよさ | 攻撃力・攻撃速度などをスライダーで。耐久を `0` にすると壊れない武器になる |
| 🟪 みため | 平面か 3D か（後述）。平面なら刃と柄の色を選ぶだけでテクスチャが生成される |
| 🟩 こうげき | 使いたいブロックを ON にする。ON にした分だけ右側の Java コードが伸びていく |
| 🟥 さや | ON にすると納刀（`R` キー）に対応する |

右側のペインには、**これから作られる/追記されるファイルが常に出ています**。クリックすると中身が見えるので、「このブロックを ON にするとコードのどこが増えるのか」を見ながら作れます。

**手順 4. 「⚔ この武器を作る」を押す**

ファイルが生成され、Java クラスがエディタで開きます。あとは:

```bash
./run_client.sh          # または ./gradlew runClient
```

ゲーム内で `/give @p <modId>:<itemId>` → `K` キーでスキルを割り当て → 完成。

> 生成後のコードは普通の Java です。物足りなくなったら `hurtEnemy` を直接書き換えて構いません。スタジオは「最初の 1 本を動く状態で用意する」ためのものです。

### 🧊 3D モデルテンプレート（`MAW: 3Dモデルテンプレートを挿入`）

本体MOD の 3D 武器は「**3Dベース**（`custom/weapon/<種類>/…` = 形と持ち方）→ 中間モデル（テクスチャ割り当て）→ アイテムモデル」の 3 段構成になっています。この構造とテクスチャスロット（`#0` = 刃、`#1` = 鍔…）を知らないと 3D 武器は書けないので、**選ぶだけ**で正しく生成します。

武器スタジオの「🟪 みため」でも、単体コマンド `MAW: 3Dモデルテンプレートを挿入` でも、同じ 4 方式が使えます:

| 方式 | 生成されるもの | こんな時に |
|---|---|---|
| **平面** | `parent: item/handheld` + 16x16 PNG | まず動かしたい。バニラの剣と同じ方式 |
| **3D・本体の見た目をそのまま使う** | `parent` を 1 行書くだけ | 鉄の刀と同じ見た目でいい |
| **3D・形は本体、テクスチャは自分の** | 3Dベースを `parent` 継承 + **本体のテクスチャをアドオンにコピー** | コピーされた `blade.png` `tsuba.png` … を塗り替えれば自分の武器になる |
| **3D・形ごとコピーして改造** | 3Dモデル（`elements`）ごと複製 | Blockbench で開いて形から作り替える |

#### テクスチャは「鉄」のものがサンプルとして出てくる

3D を選ぶと、本体MOD の**鉄（iron）の武器のテクスチャ**が、パーツごとに分かれた PNG としてアドオンにコピーされます:

```
assets/<modid>/textures/item/<itemId>/
├── blade.png    刃
├── tsuba.png    鍔
├── tsuka.png    柄
└── kasira.png   柄頭
```

鞘を有効にすると、鞘の分も同じようにコピーされます（`saya.png` / `blade.png` / `tsuba.png` / `tsuka.png` / `kasira.png`）。本体の鞘モデルは「刃と鞘のテクスチャ」と「鍔・柄・柄頭のテクスチャ」が親子に分かれているので、**親まで辿って全部のパーツを集めてから**コピーしています。

つまり、生成直後は鉄の武器と同じ見た目で確実に動き、**コピーされた PNG を塗り替えるだけで自分の武器になります**。テクスチャスロット（`#0` `#1` …）が刃なのか鍔なのかは、生成された JSON にコメントとして書かれます。

どのベースが選べるか・どのスロットが何なのかは本体MOD から実際に読むので、本体に 3D モデルが増えれば自動で選択肢に出ます。

鞘（saya）のモデルだけを作りたい時も、同じコマンドから「継承＋テクスチャ複製」か「形ごと複製」を選べます。

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
| `models/item/<id>.json` | アイテムモデル（平面 / 3D は選べる） |
| `textures/item/<id>.png` | テクスチャ（平面なら自動生成、3D なら本体のものを複製） |
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
| `MAW: 3Dモデルテンプレートを挿入` | 本体の 3D 武器モデル / 鞘モデルを、継承 or 複製でアドオンに取り込む |
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
