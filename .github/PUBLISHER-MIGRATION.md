# hrmcngs 発行者への移管と自動公開の継続

この変更はMarketplace側の移管が完了するまでマージしません。現行の発行者・拡張を削除したり、同じ拡張を別IDで新規公開したりしないでください。GitHubリポジトリはそのまま利用します。

## 先に行う作業

1. Marketplace管理画面で、発行者ID `hrmcngs` を作成します（表示名は Hiromichi Nagase など）。IDが取得できない場合は、この変更内のIDも再検討します。
2. 管理画面の Contact Microsoft から、下記の問い合わせを送ります。既存利用者の自動更新・インストール数・評価を保持できるか確認し、Microsoftの案内に従って移管します。
3. 移管が完了し、拡張が `hrmcngs` 発行者の管理画面に表示されることを確認します。公開ページ・既存インストールからの更新に問題がないことをMicrosoftと確認します。
4. GitHubの Settings → Secrets and variables → Actions で、Repository variable `MARKETPLACE_PUBLISHER` を `hrmcngs` に設定します。移管前には変更しません。
5. Repository secret `VSCE_PAT` のアカウントが移管先への公開権限を持つことを確認します。必要なら更新します。トークンをIssue・PR・チャットへ貼らないでください。
6. mainの最新変更をこのPRに取り込み、レビュー後にマージします。mainへのpushにより従来どおり自動公開します。

## 問い合わせ文（未送信）

Subject: Transfer MC Mod Utility to publisher hrmcngs while preserving existing installations

Hello Visual Studio Marketplace Support,

I manage the existing extension MC-Mod-Utility.mc-mod-utility and would like to transfer it to my publisher hrmcngs.

Current extension ID: MC-Mod-Utility.mc-mod-utility
Requested destination publisher: hrmcngs
Repository: https://github.com/hrmcngs/MC-Mod-Utility

Please confirm the supported transfer procedure and whether existing installations will continue receiving automatic updates. I would also like to preserve the extension's download count, ratings and reviews. Please advise whether the extension ID or UUID changes and whether any client migration steps are required.

The extension is currently published by GitHub Actions using vsce and a VSCE_PAT repository secret. I have prepared a publisher manifest change but have not merged it or republished the extension under a new identity.

Please let me know when to update the manifest and resume publishing to the destination publisher.

Thank you.

## 自動公開が失敗した場合

Actions → Publish Extension の失敗したステップを確認します。

- 移管確認エラー: Marketplace側の移管完了と `MARKETPLACE_PUBLISHER` の一致を確認します。
- 認証エラー: `VSCE_PAT` の有効期限・Marketplace権限・発行者メンバー権限を確認します。権限確認はソースのリリースコミットを作る前に行います。
- 公開処理の失敗: 接続や認証を直した後、Actions → Publish Extension → Run workflow → main を選んで再公開できます。既存の公開を削除しないでください。
- タグ作成のみ失敗: Marketplaceにはすでに公開済みの場合があります。まず公開状況とGitHubのタグを確認してください。

この変更はPATを新規発行・保存する処理を含みません。自動公開先の移行は、Microsoft側の移管と新しい発行者への認証確認が完了するまで未完了です。

## 参考

- https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- https://github.com/microsoft/vscode/issues/92996 （Microsoft担当者による移管の問い合わせ案内。現在の移管条件はサポートに確認）
