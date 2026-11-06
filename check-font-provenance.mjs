import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const directory=path.join(path.dirname(fileURLToPath(import.meta.url)),'assets/fonts');
const files=['noto-serif-sc.metadata.json','source-serif-4.metadata.json','FONT-SOURCES.json'];
let urls=0,encoded=0,assets=0;
function visit(value){
  if(Array.isArray(value)){value.forEach(visit);return;}
  if(value&&typeof value==='object'){Object.values(value).forEach(visit);return;}
  if(typeof value!=='string'||!value.startsWith('https://'))return;
  const url=new URL(value);assert.equal(url.protocol,'https:');urls++;
  assert.ok(!value.includes(String.fromCharCode(64)),'Source URLs must encode the package separator');
  if(value.includes('%40')){
    encoded++;
    assert.ok(decodeURIComponent(url.pathname).includes(String.fromCharCode(64)));
    assert.ok(url.hostname.endsWith('jsdelivr.net'));
  }
}
for(const file of files)visit(JSON.parse(fs.readFileSync(path.join(directory,file),'utf8')));
assert.equal(encoded,2950,'Keep every original package source URL');
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'FONT-SOURCES.json'),'utf8'));
for(const family of manifest)for(const entry of family.files||[]){
  const data=fs.readFileSync(path.join(directory,entry.file));
  assert.equal(data.length,entry.bytes,entry.file);
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'),entry.sha256,entry.file);assets++;
}
assert.equal(assets,215);
console.log(`PASS ${urls} source URLs (${encoded} encoded package paths); ${assets} font files retain bytes and hashes`);
