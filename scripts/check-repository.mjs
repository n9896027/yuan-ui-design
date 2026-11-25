#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const textExtensions = new Set(['.cjs', '.css', '.html', '.js', '.json', '.md', '.mjs', '.py', '.txt', '.yaml', '.yml']);
const ignoredDirectories = new Set(['.git', '.playwright-cli', '.serena', '__pycache__', 'node_modules']);

function fail(message) {
  errors.push(message);
}

function withinRoot(path) {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..');
}

async function filesUnder(directory) {
  const files = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const child = resolve(current, entry.name);
        if (!ignoredDirectories.has(entry.name) && child !== resolve(root, 'output/playwright') && child !== resolve(root, 'examples/native-inspection/.build')) await walk(child);
      } else if (entry.isFile()) {
        files.push(resolve(current, entry.name));
      } else if (entry.isSymbolicLink()) {
        const linkPath = resolve(current, entry.name);
        try {
          if (!withinRoot(await realpath(linkPath))) {
            fail(`symbolic link resolves outside the repository: ${relative(root, linkPath)}`);
          }
        } catch {
          fail(`symbolic link is broken: ${relative(root, linkPath)}`);
        }
      }
    }
  }
  await walk(directory);
  return files;
}

function checkSkillFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return fail('skills/yuan-ui-design/SKILL.md needs YAML frontmatter enclosed by ---');

  const frontmatter = match[1];
  if (!/^name:\s*yuan-ui-design\s*$/m.test(frontmatter)) {
    fail('SKILL.md frontmatter name must be yuan-ui-design');
  }
  if (!/^metadata:\s*$/m.test(frontmatter) || !/^\s{2}version:\s*['\"][^'\"]+['\"]\s*$/m.test(frontmatter)) {
    fail('SKILL.md frontmatter must include metadata.version');
  }
  if (!/^\s{2}last-reviewed:\s*['\"]\d{4}-\d{2}-\d{2}['\"]\s*$/m.test(frontmatter)) {
    fail('SKILL.md frontmatter must include metadata.last-reviewed as YYYY-MM-DD');
  }
  if (!/^description:\s*\S/m.test(frontmatter)) {
    fail('SKILL.md frontmatter must include a description');
  }
}

function isExternalLink(target) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target);
}

function checkMarkdownLinks(markdownPath, source) {
  const linkPattern = /!?\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+(?:['\"][^'\"]*['\"]|\([^)]*\)))?\)/g;
  for (const match of source.matchAll(linkPattern)) {
    const target = (match[1] ?? match[2] ?? '').trim();
    if (!target || isExternalLink(target)) continue;

    const filePart = target.split('#', 1)[0].split('?', 1)[0];
    if (!filePart) continue; // An in-document anchor is not a filesystem target.

    let decoded;
    try {
      decoded = decodeURIComponent(filePart);
    } catch {
      fail(`${relative(root, markdownPath)} has an invalid encoded link: ${target}`);
      continue;
    }

    const destination = resolve(dirname(markdownPath), decoded);
    if (!withinRoot(destination)) {
      fail(`${relative(root, markdownPath)} links outside the repository: ${target}`);
    } else if (!existsSync(destination)) {
      fail(`${relative(root, markdownPath)} has a missing local link: ${target}`);
    }
  }
}

async function checkProvenance(filePath, collectionName) {
  const value = JSON.parse(await readFile(filePath, 'utf8'));
  const records = value[collectionName];
  if (!Array.isArray(records) || records.length === 0) {
    fail(`${relative(root, filePath)} must have a non-empty ${collectionName} array`);
    return;
  }

  for (const [index, item] of records.entries()) {
    if (!item || typeof item.path !== 'string' || !/^[a-f0-9]{64}$/i.test(item.sha256)) {
      fail(`${relative(root, filePath)} asset record ${index} needs path and sha256`);
      continue;
    }
    const assetPath = resolve(dirname(filePath), item.path);
    if (!withinRoot(assetPath) || !existsSync(assetPath)) {
      fail(`${relative(root, filePath)} references a missing asset: ${item.path}`);
      continue;
    }
    const actual = createHash('sha256').update(await readFile(assetPath)).digest('hex');
    if (actual !== item.sha256) fail(`${relative(root, filePath)} hash mismatch: ${item.path}`);
  }
}

async function main() {
  const skillPath = resolve(root, 'skills/yuan-ui-design/SKILL.md');
  if (!existsSync(skillPath)) {
    fail('missing skills/yuan-ui-design/SKILL.md');
  } else {
    checkSkillFrontmatter(await readFile(skillPath, 'utf8'));
  }

  const allFiles = await filesUnder(root);
  const assetDirectory = resolve(root, 'skills/yuan-ui-design/assets/visual-cases');
  if (!existsSync(assetDirectory) || !(await stat(assetDirectory)).isDirectory()) {
    fail('missing skills/yuan-ui-design/assets/visual-cases');
  } else if (!allFiles.some((file) => file.startsWith(`${assetDirectory}${sep}`) && extname(file).toLowerCase() === '.png')) {
    fail('skills/yuan-ui-design/assets/visual-cases needs at least one PNG sample asset');
  }

  for (const file of allFiles) {
    const extension = extname(file).toLowerCase();
    if (extension === '.json') {
      try {
        const parsed = JSON.parse(await readFile(file, 'utf8'));
        if (file.endsWith('.provenance.json') && parsed.asset) {
          const asset = parsed.asset;
          if (typeof asset.path !== 'string' || isAbsolute(asset.path)) {
            fail(`${relative(root, file)} requires a portable asset path`);
          } else {
            const image = resolve(dirname(file), asset.path);
            if (!withinRoot(image) || !existsSync(image)) {
              fail(`${relative(root, file)} has a missing image`);
            } else {
              const bytes = await readFile(image);
              if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
                fail(`${relative(root, file)} image size or hash changed`);
              }
            }
          }
        }
      } catch (error) {
        fail(`${relative(root, file)} is not valid JSON: ${error.message}`);
      }
    }
    if (extension === '.md') checkMarkdownLinks(file, await readFile(file, 'utf8'));
    if (textExtensions.has(extension) && file !== fileURLToPath(import.meta.url)) {
      const source = await readFile(file, 'utf8');
      if (/(?:\/Users\/|\/private\/|\/var\/folders\/)/.test(source)) {
        fail(`${relative(root, file)} contains a private machine-local path`);
      }
    }
  }

  const provenanceManifests = [
    [resolve(assetDirectory, 'provenance.json'), 'files'],
    [resolve(assetDirectory, 'followup-provenance.json'), 'screenshots'],
  ];
  for (const [file, collectionName] of provenanceManifests) {
    try {
      await checkProvenance(file, collectionName);
    } catch (error) {
      fail(`${relative(root, file)} provenance check failed: ${error.message}`);
    }
  }

  if (errors.length) {
    console.error(`Repository check failed (${errors.length}):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS repository integrity: ${allFiles.length} files checked`);
}

await main();
