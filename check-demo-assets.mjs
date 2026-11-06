import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),directory=path.join(root,'assets/demo-covers');
const covers=JSON.parse(fs.readFileSync(path.join(directory,'COVERS.json')));assert.equal(covers.length,36);
const hashes=new Set();
for(const cover of covers){const data=fs.readFileSync(path.join(directory,cover.file));assert.ok(data.length<60000,cover.file);assert.equal(data.toString('ascii',8,12),'WEBP');const hash=crypto.createHash('sha256').update(data).digest('hex');assert.equal(hash,cover.sha256);hashes.add(hash);assert.ok(fs.readFileSync(path.join(directory,cover.prompt),'utf8').includes('no text'));}
assert.equal(hashes.size,36);assert.ok(fs.existsSync(path.join(directory,'LICENSE.md')));
const {default:samples}=await import('./js/samples.js');
for(const language of ['en','zh'])for(const note of samples.notes(language)){assert.ok(fs.existsSync(path.join(root,note.demoCover)));assert.ok(!/fictional|虚构/i.test(note.body));assert.ok(!/fictional|虚构/i.test(note.transcript));}
console.log('36 unique WebP covers: hashes, bytes, prompts, licence and bilingual references pass');
