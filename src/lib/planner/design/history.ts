import type { Project } from '../model';
import { applyDesignCommand, type CommandResult, type DesignCommand } from './commands';

export type HistoryEntry = { label:string; before:Project; after:Project };
export type DesignHistory = { entries:HistoryEntry[]; cursor:number; limit:number };
export const createDesignHistory=(limit=100):DesignHistory=>({entries:[],cursor:0,limit:Number.isSafeInteger(limit)?Math.max(1,Math.min(limit,10_000)):100});
export type SessionResult={history:DesignHistory;project:Project;result:CommandResult};

export function commitSessionCommand(history:DesignHistory,project:Project,command:DesignCommand):SessionResult {
  const result=applyDesignCommand(project,command);if(!result.ok)return {history,project,result};
  const entries=history.entries.slice(0,history.cursor);entries.push({label:result.label,before:project,after:result.project});
  if(entries.length>history.limit)entries.splice(0,entries.length-history.limit);
  return {history:{...history,entries,cursor:entries.length},project:result.project,result};
}

export function undoSession(history:DesignHistory,project:Project):{history:DesignHistory;project:Project;label?:string} {
  if(history.cursor===0)return {history,project}; const entry=history.entries[history.cursor-1];
  return {history:{...history,cursor:history.cursor-1},project:entry.before,label:entry.label};
}
export function redoSession(history:DesignHistory,project:Project):{history:DesignHistory;project:Project;label?:string} {
  if(history.cursor>=history.entries.length)return {history,project};const entry=history.entries[history.cursor];
  return {history:{...history,cursor:history.cursor+1},project:entry.after,label:entry.label};
}

/** Provisional gestures live outside the document and history until valid commit. */
export type CommandSession={base:Project;provisional:Project;valid:boolean;error?:string};
export const beginCommandSession=(project:Project):CommandSession=>({base:project,provisional:project,valid:true});
export function updateCommandSession(session:CommandSession,command:DesignCommand):CommandSession {
  const result=applyDesignCommand(session.provisional,command);
  return result.ok?{...session,provisional:result.project,valid:true,error:undefined}:{...session,valid:false,error:result.code};
}
export const cancelCommandSession=(session:CommandSession)=>session.base;
export function commitCommandSession(history:DesignHistory,session:CommandSession):{history:DesignHistory;project:Project;committed:boolean} {
  if(!session.valid||session.provisional===session.base)return {history,project:session.base,committed:false};
  const entries=history.entries.slice(0,history.cursor);entries.push({label:'Edit gesture',before:session.base,after:session.provisional});if(entries.length>history.limit)entries.splice(0,entries.length-history.limit);
  return {history:{...history,entries,cursor:entries.length},project:session.provisional,committed:true};
}
