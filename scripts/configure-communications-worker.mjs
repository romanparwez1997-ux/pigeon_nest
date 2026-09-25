import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const project=(await readFile(new URL('../supabase/.temp/project-ref',import.meta.url),'utf8')).trim();
if(!/^[a-z0-9]{20}$/.test(project))throw Error('Link a valid Supabase project first.');
const directory=await mkdtemp(join(tmpdir(),'pigeon-communications-'));
const secret=randomBytes(32).toString('hex');
const run=args=>{const result=spawnSync('npx',['supabase',...args],{stdio:['ignore','pipe','pipe'],encoding:'utf8'});if(result.status!==0)throw Error(`Supabase command failed: ${args.slice(0,2).join(' ')}. Recheck CLI login/project permissions; command output suppressed to protect secrets.`);};
try{
 const env=join(directory,'worker.env'),sql=join(directory,'worker.sql');
 await writeFile(env,`COMMUNICATION_WORKER_SECRET=${secret}\n`,{mode:0o600});
 run(['secrets','set','--env-file',env,'--project-ref',project]);
 await writeFile(sql,`do $setup$\ndeclare existing uuid;\nbegin\nselect id into existing from vault.secrets where name='pigeon_communication_secret' limit 1;\nif existing is null then perform vault.create_secret('${secret}','pigeon_communication_secret'); else perform vault.update_secret(existing,'${secret}'); end if;\nselect id into existing from vault.secrets where name='pigeon_communication_url' limit 1;\nif existing is null then perform vault.create_secret('https://${project}.supabase.co/functions/v1/communication-worker','pigeon_communication_url'); else perform vault.update_secret(existing,'https://${project}.supabase.co/functions/v1/communication-worker'); end if;\nend $setup$;`,{mode:0o600});
 run(['db','query','--linked','--file',sql]);
 console.log(`Communication worker configured for project ${project}. Secret values were not printed.`);
}finally{await rm(directory,{recursive:true,force:true});}
