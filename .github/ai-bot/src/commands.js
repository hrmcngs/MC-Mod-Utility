import { number, SafeError } from './core.js';

export function commandMatches(body,command){
  if(typeof body!=='string')return false;
  const text=body.trim();
  return text===command || (['/ai-fix','/ai-report-pr'].includes(command) && ['--reference','--no-reference'].some(flag=>text===`${command} ${flag}`));
}
export function referenceChoice(event,env,cfg){
  const fallback=cfg.referencePreviousPRs??true;
  if(typeof fallback!=='boolean')throw new SafeError('CONFIG');
  if(env.GITHUB_EVENT_NAME==='issue_comment'){
    const text=event.comment?.body?.trim();
    if(['/ai-fix','/ai-report-pr'].some(command=>text===`${command} --reference`))return true;
    if(['/ai-fix','/ai-report-pr'].some(command=>text===`${command} --no-reference`))return false;
  }
  if(env.GITHUB_EVENT_NAME==='workflow_dispatch'){
    const choice=event.inputs?.reference_previous??'default';
    if(!['default','on','off'].includes(choice))throw new SafeError('CONFIG');
    if(choice!=='default')return choice==='on';
  }
  return fallback;
}
export function isCommand(event, env, command) {
  return env.GITHUB_EVENT_NAME === 'issue_comment'
    && event.action === 'created'
    && !event.issue?.pull_request
    && event.comment?.user?.type === 'User'
    && event.comment.user.login === env.GITHUB_ACTOR
    && typeof event.comment.body === 'string'
    && commandMatches(event.comment.body,command);
}
// Re-read from GitHub at preparation and publication. Deleted/edited commands cannot authorize work.
export async function requireCommand(gh, event, env, command) {
  if (!isCommand(event,env,command) || event.repository?.full_name !== gh.repo) throw new SafeError('ACCESS');
  const n=number(event.issue?.number),id=number(event.comment.id);
  const current=await gh.request(gh.path(`/issues/comments/${id}`));
  if (current.user?.type !== 'User' || current.user.login !== env.GITHUB_ACTOR
    || current.issue_url !== `https://api.github.com/repos/${gh.repo}/issues/${n}`
    || typeof current.body !== 'string' || current.body.trim() !== event.comment.body.trim()) throw new SafeError('ACCESS');
  return n;
}
