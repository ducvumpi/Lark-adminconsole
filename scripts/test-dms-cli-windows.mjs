import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {inventory,safePath} from 'file:///C:/Users/Win10/AppData/Local/npm-cache/_npx/2fa7f77791b5d55e/node_modules/@lark-base-open/base-database-cli/dist/app-builder/core.mjs';
const root=mkdtempSync(join(tmpdir(),'dms-path-test-'));
try{
 mkdirSync(join(root,'functions','test'),{recursive:true});writeFileSync(join(root,'functions','test','index.js'),'module.exports = {}');
 assert.equal(inventory(root)[0].path,'functions/test/index.js');
 assert.equal(safePath(root,'functions/test/index.js'),join(root,'functions','test','index.js'));
 for(const unsafe of ['../outside','functions/../outside','functions\\test\\index.js',resolve(root,'functions/test/index.js')])assert.throws(()=>safePath(root,unsafe),/Invalid artifact path/);
 console.log('PASS: Windows artifact names normalized; traversal, absolute paths and external backslash paths still rejected.');
}finally{
 if(!resolve(root).startsWith(resolve(tmpdir())+'\\'))throw Error('Unexpected test cleanup path');
 rmSync(root,{recursive:true,force:true});
}
