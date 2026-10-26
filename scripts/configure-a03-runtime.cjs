// User explicitly authorized reuse of this application's existing server config.
// Secrets travel only in memory and the CLI child's independent stdin pipe.
const fs=require('node:fs'),{spawnSync}=require('node:child_process');
const raw=JSON.parse(fs.readFileSync('data/config.json','utf8'));
const appId='cli_aa881b5fa0781eea';
const profiles=Array.isArray(raw.bases)?raw.bases:[raw];
const matches=profiles.filter(p=>p.appId===appId&&typeof p.appSecret==='string'&&p.appSecret.trim());
const secrets=[...new Set(matches.map(p=>p.appSecret))];
if(secrets.length!==1)throw Error('Expected exactly one existing secret for the authorized app ID. Nothing copied.');
const node22='C:/Users/Win10/AppData/Local/npm-cache/_npx/52027bd8fc0022aa/node_modules/node/node_modules/node-win-x64/bin/node.exe';
const cli='C:/Users/Win10/AppData/Local/npm-cache/_npx/2fa7f77791b5d55e/node_modules/@lark-base-open/base-database-cli/dist/cli.js';
const env={...process.env,BASE_DATABASE_LARK_CLI_PATH:'C:/Users/Win10/AppData/Roaming/npm/node_modules/@larksuite/cli/bin/lark-cli.exe'};
for(const [name,value]of [['A03_LARK_APP_ID',appId],['A03_LARK_APP_SECRET',secrets[0]]]){
 const r=spawnSync(node22,[cli,'--profile','lark-test','environment-variables','set',name,'a03-lark-app','--target','preview','--value-stdin'],{input:value,env,encoding:'utf8',timeout:60000,maxBuffer:2000000});
 if(r.status!==0)throw Error('Runtime configuration failed for '+name+'; exit '+r.status+'. Secret output suppressed.');
 const b=JSON.parse(r.stdout);if(b.variables?.find(v=>v.name===name)?.configured!==true)throw Error('Configuration receipt did not confirm '+name);
 console.log(JSON.stringify({name,configured:true,target:'preview'}));
}
