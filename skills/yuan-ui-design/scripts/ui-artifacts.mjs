#!/usr/bin/env node
// Bind local UI artifacts to a reviewable manifest. Hashes do not prove truth.
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir, lstat, realpath, mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep, dirname, posix } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

function relativePath(value) {
  if (typeof value !== 'string' || !value || isAbsolute(value) || value.includes('\\') || value.split('/').includes('..')) {
    throw new Error('Expected a relative artifact path without traversal: '+value);
  }
  const normalized = posix.normalize(value);
  if (normalized === '.' || normalized.startsWith('../')) throw new Error('Expected a file or directory path: '+value);
  return normalized;
}

async function contained(root, name) {
  const path = resolve(root, relativePath(name));
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw new Error('Symlinks are not accepted as artifacts: '+name);
  const canonical = await realpath(path);
  if (canonical !== root && !canonical.startsWith(root+sep)) throw new Error('Artifact escapes root: '+name);
  return {path:canonical,info};
}

async function collect(root, names) {
  const entries = new Map();
  async function walk(name) {
    name = relativePath(name);
    const {path,info} = await contained(root,name);
    if (info.isDirectory()) {
      for (const child of (await readdir(path)).sort()) await walk(name+'/'+child);
    } else if (info.isFile()) {
      const bytes = await readFile(path);
      entries.set(name,{path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    } else throw new Error('Expected a regular file: '+name);
  }
  for (const name of names) await walk(name);
  return [...entries.values()].sort((a,b)=>a.path.localeCompare(b.path));
}

async function createManifest(root, names) {
  if (!names.length) throw new Error('Provide at least one artifact path');
  const files = await collect(await realpath(root),names);
  if (!files.length) throw new Error('No artifact files found');
  return {schemaVersion:'1.0',algorithm:'sha256',createdAt:new Date().toISOString(),files};
}

async function checkManifest(root, manifest) {
  if (manifest.schemaVersion!=='1.0' || manifest.algorithm!=='sha256' || !Array.isArray(manifest.files) || !manifest.files.length) {
    throw new Error('Invalid or empty artifact manifest');
  }
  root = await realpath(root);
  const seen = new Set();
  const errors = [];
  for (const expected of manifest.files) {
    const name=relativePath(expected.path);
    if (seen.has(name)) throw new Error('Duplicate artifact: '+name);
    seen.add(name);
    if (!Number.isSafeInteger(expected.bytes) || expected.bytes<0 || !/^[a-f0-9]{64}$/.test(expected.sha256)) throw new Error('Invalid artifact record: '+name);
    try {
      const [actual] = await collect(root,[name]);
      if (!actual || actual.path!==name || actual.bytes!==expected.bytes || actual.sha256!==expected.sha256) errors.push('Changed artifact: '+name);
    } catch (error) { errors.push('Unreadable artifact: '+name+' ('+error.message+')'); }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return seen.size;
}

async function selfTest() {
  const scratch = await mkdtemp(resolve(tmpdir(),'ui-artifacts-'));
  try {
    const root=resolve(scratch,'root');await mkdir(root);
    await writeFile(resolve(root,'a.txt'),'abc');
    const manifest=await createManifest(root,['a.txt']);
    assert.equal(manifest.files[0].sha256,'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    assert.equal(await checkManifest(root,manifest),1);
    await writeFile(resolve(root,'a.txt'),'abd');
    await assert.rejects(checkManifest(root,manifest),/Changed artifact/);
    await rm(resolve(root,'a.txt'));
    await assert.rejects(checkManifest(root,manifest),/Unreadable artifact/);
    await assert.rejects(createManifest(root,['../outside.txt']),/traversal/);
    await writeFile(resolve(scratch,'outside.txt'),'outside');
    await symlink(resolve(scratch,'outside.txt'),resolve(root,'link.txt'));
    await assert.rejects(createManifest(root,['link.txt']),/Symlinks/);
    await writeFile(resolve(root,'b.txt'),'valid');
    const valid=await createManifest(root,['b.txt']);
    await assert.rejects(checkManifest(root,{...valid,files:[...valid.files,...valid.files]}),/Duplicate/);
    console.log('PASS artifact manifest round-trip; changed, missing, traversal, symlink and duplicate artifacts rejected');
  } finally { await rm(scratch,{recursive:true,force:true}); }
}

try {
  const [command,root,manifestPath,...names]=process.argv.slice(2);
  if (command==='--self-test') await selfTest();
  else if (command==='create' && root && manifestPath) {
    const manifest=await createManifest(root,names);
    const output=resolve(manifestPath);
    const relativeOutput=relative(await realpath(root),output).split(sep).join('/');
    if (manifest.files.some(file=>file.path===relativeOutput)) throw new Error('Manifest cannot include itself');
    await mkdir(dirname(output),{recursive:true});
    await writeFile(output,JSON.stringify(manifest,null,2)+'\n');
    console.log('PASS recorded '+manifest.files.length+' artifacts');
  } else if (command==='check' && root && manifestPath && !names.length) {
    const count=await checkManifest(root,JSON.parse(await readFile(manifestPath,'utf8')));
    console.log('PASS '+count+' recorded artifacts match SHA-256 and byte lengths');
  } else {
    console.log('Usage: ui-artifacts.mjs create <root> <manifest.json> <relative-path>...\n       ui-artifacts.mjs check <root> <manifest.json>\n       ui-artifacts.mjs --self-test\nChecks recorded content integrity, not truth, completeness or authenticity.');
    process.exitCode=command==='--help'?0:2;
  }
} catch (error) { console.error('ERROR '+error.message);process.exitCode=1; }
