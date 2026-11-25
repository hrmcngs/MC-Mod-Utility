import {readFile,appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {GitHub,botOwned} from './github.js';
import {config,number,SafeError} from './core.js';
import {isCommand,requireCommand} from './commands.js';

// Reusable workers receive routing from the trusted selector, never from AI output.
export function workerEvent(env,event){
  if(env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.AI_BOT_WORKER!=='true')return event;
  return {...event,inputs:{...event.inputs,number:env.AI_BOT_NUMBER,target:env.AI_BOT_TARGET,
    result:env.AI_BOT_RESULT||'comment',reference_previous:env.AI_BOT_REFERENCE||'default',ai:env.AI_BOT_AI||'default'}};
}
export async function selectTargets(gh,event,env,cfg,mode){
  if(!['fix','investigate'].includes(mode))throw new SafeError('CONFIG');
  if(event.repository?.full_name!==gh.repo)throw new SafeError('ACCESS');
  const trigger=env.GITHUB_EVENT_NAME;
  if(trigger==='issue_comment'&&!isCommand(event,env,mode==='fix'?'/ai-fix':'/ai-investigate',mode==='fix')
    &&!(mode==='investigate'&&isCommand(event,env,'/ai-report-pr')))return [];
  const repo=await gh.request(gh.path());
  if(env.GITHUB_REF!==`refs/heads/${repo.default_branch}`)throw new SafeError('ACCESS');
  if(repo.private&&env.ALLOW_PRIVATE_REPOSITORY!=='true')throw new SafeError('PRIVATE');
  if(!['workflow_dispatch','issue_comment','issues','schedule'].includes(trigger))throw new SafeError('ACCESS');
  if(trigger!=='schedule'){
    const role=await gh.request(gh.path(`/collaborators/${encodeURIComponent(env.GITHUB_ACTOR)}/permission`));
    if(!['write','maintain','admin'].includes(role.permission))throw new SafeError('ACCESS');
  }
  if(trigger==='issue_comment'){
    const command=mode==='fix'?'/ai-fix':isCommand(event,env,'/ai-report-pr')?'/ai-report-pr':'/ai-investigate';
    return [{kind:event.issue?.pull_request?'pull':'issue',number:String(await requireCommand(gh,event,env,command,mode==='fix'))}];
  }
  if(trigger==='issues'){
    const label=mode==='fix'?cfg.fix?.label:cfg.issueLabel;
    if(event.action!=='labeled'||event.label?.name!==label||event.issue?.pull_request||(mode==='investigate'&&cfg.mode!=='automatic')||(mode==='fix'&&!cfg.fix?.enabled))return [];
    return [{kind:'issue',number:String(number(event.issue.number))}];
  }
  if(trigger==='schedule'&&(mode==='fix'||cfg.mode!=='automatic'))return [];
  if(trigger==='schedule')return [{kind:'dependabot',number:'schedule'}];
  const kind=mode==='fix'?'issue':trigger==='schedule'?'dependabot':event.inputs?.target||'all';
  if(!['issue','dependabot','all'].includes(kind))throw new SafeError('CONFIG');
  if(String(event.inputs?.number||'').trim()){
    if(kind==='all')throw new SafeError('CONFIG');
    return [{kind,number:String(number(event.inputs.number))}];
  }
  if(mode==='investigate'&&event.inputs?.result==='report-pr'&&kind!=='issue')throw new SafeError('CONFIG');
  const targets=[];
  if(kind!=='dependabot'){
    const issues=await gh.list(gh.path('/issues?state=open&sort=created&direction=asc'));
    for(const issue of issues)if(!issue.pull_request&&issue.state==='open'&&!botOwned(issue))targets.push({kind:'issue',number:String(number(issue.number))});
  }
  if(kind!=='issue'){
    // Fail visibly rather than claiming that every alert was processed without access.
    const alerts=await gh.list(gh.path('/dependabot/alerts?state=open&sort=created&direction=asc'));
    for(const alert of alerts)if(alert.state==='open')targets.push({kind:'dependabot',number:String(number(alert.number))});
  }
  if(targets.length>256)throw new SafeError('BULK_LIMIT');
  return targets;
}
export async function select(env=process.env,ghArg){
  const gh=ghArg||new GitHub(env.GITHUB_REPOSITORY,env.GH_TOKEN);
  const event=JSON.parse(await readFile(env.GITHUB_EVENT_PATH,'utf8'));
  const cfg=config(JSON.parse(await readFile('.github/ai-bot/config.json','utf8')));
  const targets=await selectTargets(gh,event,env,cfg,process.argv[2]==='scan-fix'?'fix':'investigate');
  if(env.GITHUB_OUTPUT)await appendFile(env.GITHUB_OUTPUT,`ready=${targets.length>0}\nmatrix=${JSON.stringify({include:targets})}\n`);
  const text=`対象: ${targets.length}件。各対象を個別に処理し、検証失敗時は修正PRを作成しません。`;
  console.log(text);if(env.GITHUB_STEP_SUMMARY)await appendFile(env.GITHUB_STEP_SUMMARY,text+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{await select();}catch(error){console.error(error.code==='BULK_LIMIT'?'対象が256件を超えています。IssueとDependabotを分けるか、対象を整理して再実行してください。':'対象一覧を取得できませんでした。権限・Dependabotの有効化・private送信許可を確認してください。');process.exitCode=1;}
}
