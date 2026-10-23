import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const now = new Date();
const runId = process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`
  : `local-${now.toISOString().replaceAll(':', '-')}`;
const output = path.join(ROOT, 'artifacts', runId);
const pages = Number(process.env.BENCH_PAGES ?? 50);
const samples = Number(process.env.BENCH_SAMPLES ?? 3);
const edits = Number(process.env.BENCH_EDITS ?? 10);
const seed = Number(process.env.BENCH_SEED ?? 20261023);
const benchmarkEnv = { ...process.env, CI: 'true', ASTRO_TELEMETRY_DISABLED: '1', TELEMETRY_DISABLED: '1', ASTRO_DISABLE_UPDATE_CHECK: 'true' };

function parseArgs() {
  return process.argv.slice(2);
}

function run(command, args, cwd, env = process.env, logFile) {
  return new Promise((resolve, reject) => {
    const started = process.hrtime.bigint();
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const log = logFile ? createWriteStream(logFile, { flags: 'a' }) : null;
    child.stdout.on('data', chunk => (log ?? process.stdout).write(chunk));
    child.stderr.on('data', chunk => (log ?? process.stderr).write(chunk));
    child.on('error', error => {
      log?.end();
      reject(error);
    });
    child.on('close', (code, signal) => {
      log?.end();
      resolve({
        exit_code: code,
        signal,
        elapsed_ms: Number(process.hrtime.bigint() - started) / 1e6,
      });
    });
  });
}

async function capture(command, args, cwd = ROOT) {
  return new Promise(resolve => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    child.stdout.on('data', chunk => { text += chunk; });
    child.stderr.on('data', chunk => { text += chunk; });
    child.on('error', error => resolve(`unavailable: ${error.message}`));
    child.on('close', code => resolve(code === 0 ? text.trim() : `exit ${code}: ${text.trim()}`));
  });
}

async function sha256(file) {
  try {
    return createHash('sha256').update(await readFile(file)).digest('hex');
  } catch {
    return null;
  }
}

async function listFiles(directory) {
  const files = [];
  async function visit(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  await visit(directory);
  return files;
}

async function validate(participant, project, manifest) {
  const outDir = path.join(project, participant.output_dir);
  const htmlFiles = (await listFiles(outDir)).filter(file => file.endsWith('.html'));
  const seen = new Set();
  const errors = [];
  let targetOutput = null;
  for (const file of htmlFiles) {
    const body = await readFile(file, 'utf8');
    for (const match of body.matchAll(/BENCHMARK_PAGE=(\d{5})/g)) seen.add(match[1]);
    if (body.includes('BENCHMARK_EDIT_MARKER=EDIT000')) {
      const required = ['<strong', '<em', '<blockquote', '<ul', '<ol', '<table', '<pre', '<img', '<a'];
      const missing = required.filter(tag => !body.toLowerCase().includes(tag));
      if (missing.length) errors.push(`target page is missing expected HTML elements: ${missing.join(', ')}`);
      targetOutput = path.relative(outDir, file).split(path.sep).join('/');
    }
  }
  if (htmlFiles.length < manifest.page_count) errors.push(`expected at least ${manifest.page_count} HTML pages; found ${htmlFiles.length}`);
  if (seen.size !== manifest.page_count) errors.push(`expected ${manifest.page_count} page markers; found ${seen.size}`);
  if (!targetOutput) errors.push('could not find the edit target page in generated HTML');
  const fileStats = await Promise.all((await listFiles(outDir)).map(file => stat(file)));
  const outputBytes = fileStats.reduce((sum, item) => sum + item.size, 0);
  return { ok: errors.length === 0, errors, html_pages: htmlFiles.length, output_bytes: outputBytes, target_output: targetOutput };
}

function targetUrl(outputPath, participantId) {
  if (outputPath.endsWith('/index.html')) return `/${outputPath.slice(0, -'index.html'.length)}`;
  if (outputPath === 'index.html') return '/';
  if (participantId === 'docusaurus' && outputPath.endsWith('.html')) return `/${outputPath.slice(0, -'.html'.length)}`;
  return `/${outputPath}`;
}

async function removeOutputs(project, participant) {
  for (const relative of participant.clean_dirs) {
    await rm(path.join(project, relative), { recursive: true, force: true });
  }
}

function shuffle(items, seedValue) {
  let state = seedValue >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarize(records) {
  const ids = [...new Set(records.map(record => record.participant))];
  const scenarios = ['clean-build', 'warm-build', 'edit-to-dom'];
  const rows = ids.map(id => {
    const cells = scenarios.map(scenario => {
      const values = records.filter(record => record.participant === id && record.scenario === scenario && record.status === 'ok').map(record => record.elapsed_ms);
      return values.length ? `${median(values).toFixed(1)} (${values.length})` : '—';
    });
    return `| ${id} | ${cells.join(' | ')} |`;
  });
  return [
    '# Preliminary smoke benchmark',
    '',
    `Run: ${runId} · ${now.toISOString()} · ${pages} pages · ${samples} build samples · ${edits} edits`,
    '',
    'These are calibration results, not a ranking. Values are medians in milliseconds; the count is successful observations.',
    '',
    '| Generator | Clean build (ms) | No-op build (ms) | Edit to visible DOM (ms) |',
    '| --- | ---: | ---: | ---: |',
    ...rows,
    '',
  ].join('\n');
}

async function waitForServer(baseUrl, child, logFile) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`preview server exited with code ${child.exitCode}; see ${logFile}`);
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1000) });
      if (response.status < 500) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`preview server did not become ready at ${baseUrl}; see ${logFile}`);
}

async function waitForText(page, marker, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await page.waitForFunction(value => document.body?.innerText.includes(value), marker, { timeout: 250 });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error(`timed out waiting for ${marker}`);
}

function replaceEditMarker(content, replacement) {
  const updated = content.replace(/BENCHMARK_EDIT_MARKER=EDIT\d{3}/, `BENCHMARK_EDIT_MARKER=${replacement}`);
  if (updated === content) throw new Error('edit marker was not found in the source page');
  return updated;
}

async function main() {
  const args = parseArgs();
  if (args.length) throw new Error(`unexpected arguments: ${args.join(' ')}`);
  await rm(output, { recursive: true, force: true });
  await mkdir(path.join(output, 'logs'), { recursive: true });

  const prepared = await run(process.env.PYTHON ?? 'python3', ['scripts/prepare.py', '--pages', String(pages), '--seed', String(seed)], ROOT);
  if (prepared.exit_code !== 0) throw new Error('fixture preparation failed');
  const manifest = JSON.parse(await readFile(path.join(ROOT, '.bench/manifest.json'), 'utf8'));
  const participants = manifest.participants;
  const records = [];
  const versions = {};
  const npmPackages = ['astro', '@astrojs/starlight', 'vitepress', '@docusaurus/core', '@docusaurus/preset-classic', '@docusaurus/faster', '@mdx-js/react', 'react', 'react-dom', 'playwright'];
  for (const packageName of npmPackages) {
    const packageJson = JSON.parse(await readFile(path.join(ROOT, 'node_modules', packageName, 'package.json'), 'utf8'));
    versions[packageName] = packageJson.version;
  }
  versions['astro-starlight'] = { astro: versions.astro, starlight: versions['@astrojs/starlight'] };
  versions.docusaurus = { core: versions['@docusaurus/core'], preset_classic: versions['@docusaurus/preset-classic'] };
  versions.mdu = await capture(path.join(ROOT, '.tools/mdu/mdu'), ['--version']);
  versions.hugo = await capture(path.join(ROOT, '.tools/hugo/hugo'), ['version']);
  for (const [id, venv, packageNames] of [
    ['material-for-mkdocs', '.tools/material', ['mkdocs', 'mkdocs-material']],
    ['zensical', '.tools/zensical', ['zensical']],
    ['mkdocs-2', '.tools/mkdocs-2', ['mkdocs']],
  ]) {
    const python = path.join(ROOT, venv, 'bin/python');
    versions[id] = {};
    for (const packageName of packageNames) {
      versions[id][packageName] = await capture(python, ['-c', `import importlib.metadata as m; print(m.version(${JSON.stringify(packageName)}))`]);
    }
    versions[id].python = await capture(python, ['--version']);
  }
  const pythonLocks = {};
  for (const [id, venv] of [['material-for-mkdocs', '.tools/material'], ['zensical', '.tools/zensical'], ['mkdocs-2', '.tools/mkdocs-2']]) {
    pythonLocks[id] = await capture(path.join(ROOT, venv, 'bin/python'), ['-m', 'pip', 'freeze']);
  }

  const sourceCommit = await capture('git', ['rev-parse', 'HEAD']);
  const orderSeed = seed + now.getTime();
  for (let sample = 1; sample <= samples; sample += 1) {
    const order = shuffle(Object.keys(participants), orderSeed + sample);
    for (const id of order) {
      const participant = participants[id];
      const project = path.join(ROOT, participant.project);
      await removeOutputs(project, participant);
      const coldLog = path.join(output, 'logs', `${id}-build.log`);
      const cold = await run(participant.build[0], participant.build.slice(1), project, benchmarkEnv, coldLog);
      const coldCheck = cold.exit_code === 0 ? await validate(participant, project, manifest) : { ok: false, errors: [`build exited ${cold.exit_code}`] };
      records.push({
        run_id: runId, source_commit: sourceCommit, participant: id, tool_version: versions[id] ?? null,
        scenario: 'clean-build', sample, sample_order: order, elapsed_ms: cold.elapsed_ms, status: cold.exit_code === 0 && coldCheck.ok ? 'ok' : 'failed',
        validation: coldCheck, corpus_size: pages, corpus_sha256: manifest.corpus_sha256, seed,
      });
      if (cold.exit_code !== 0 || !coldCheck.ok) continue;

      const warmLog = path.join(output, 'logs', `${id}-build.log`);
      const warm = await run(participant.build[0], participant.build.slice(1), project, benchmarkEnv, warmLog);
      const warmCheck = warm.exit_code === 0 ? await validate(participant, project, manifest) : { ok: false, errors: [`build exited ${warm.exit_code}`] };
      records.push({
        run_id: runId, source_commit: sourceCommit, participant: id, tool_version: versions[id] ?? null,
        scenario: 'warm-build', sample, sample_order: order, elapsed_ms: warm.elapsed_ms, status: warm.exit_code === 0 && warmCheck.ok ? 'ok' : 'failed',
        validation: warmCheck, corpus_size: pages, corpus_sha256: manifest.corpus_sha256, seed,
      });
    }
  }

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const chromiumVersion = browser.version();
  for (const id of shuffle(Object.keys(participants), orderSeed + samples + 1)) {
    const participant = participants[id];
    const project = path.join(ROOT, participant.project);
    const checked = await validate(participant, project, manifest);
    if (!checked.ok) {
      records.push({ run_id: runId, source_commit: sourceCommit, participant: id, tool_version: versions[id] ?? null, scenario: 'edit-to-dom', sample: 0, status: 'failed', validation: checked, corpus_size: pages, corpus_sha256: manifest.corpus_sha256, seed });
      continue;
    }
    const logFile = path.join(output, 'logs', `${id}-serve.log`);
    const server = spawn(participant.serve[0], participant.serve.slice(1), { cwd: project, env: benchmarkEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    const log = createWriteStream(logFile, { flags: 'a' });
    server.stdout.on('data', chunk => log.write(chunk));
    server.stderr.on('data', chunk => log.write(chunk));
    const baseUrl = `http://127.0.0.1:${participant.port}`;
    const pageUrl = new URL(targetUrl(checked.target_output, id), baseUrl).toString();
    try {
      await waitForServer(baseUrl, server, logFile);
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
      const page = await context.newPage();
      await page.route('**/*', route => {
        const hostname = new URL(route.request().url()).hostname;
        return hostname === '127.0.0.1' || hostname === 'localhost' ? route.continue() : route.abort();
      });
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await waitForText(page, 'BENCHMARK_EDIT_MARKER=EDIT000');
      const sourcePage = path.join(project, participant.docs_dir, manifest.target_source);
      let source = await readFile(sourcePage, 'utf8');
      for (let edit = 1; edit <= edits; edit += 1) {
        const marker = `EDIT${String(edit).padStart(3, '0')}`;
        source = replaceEditMarker(source, marker);
        await writeFile(sourcePage, source, 'utf8');
        const started = process.hrtime.bigint();
        try {
          await waitForText(page, `BENCHMARK_EDIT_MARKER=${marker}`);
          records.push({
            run_id: runId, source_commit: sourceCommit, participant: id, tool_version: versions[id] ?? null,
            scenario: 'edit-to-dom', sample: edit, elapsed_ms: Number(process.hrtime.bigint() - started) / 1e6,
            status: 'ok', validation: { target_url: pageUrl }, corpus_size: pages, corpus_sha256: manifest.corpus_sha256, seed,
          });
        } catch (error) {
          records.push({
            run_id: runId, source_commit: sourceCommit, participant: id, tool_version: versions[id] ?? null,
            scenario: 'edit-to-dom', sample: edit, elapsed_ms: null, status: 'failed',
            validation: { target_url: pageUrl, error: error.message }, corpus_size: pages, corpus_sha256: manifest.corpus_sha256, seed,
          });
          break;
        }
      }
      await context.close();
    } catch (error) {
      records.push({
        run_id: runId, source_commit: sourceCommit, participant: id, tool_version: versions[id] ?? null,
        scenario: 'edit-to-dom', sample: 0, elapsed_ms: null, status: 'failed',
        validation: { target_url: pageUrl, error: error.message }, corpus_size: pages, corpus_sha256: manifest.corpus_sha256, seed,
      });
    } finally {
      if (server.exitCode === null) {
        server.kill('SIGINT');
        await new Promise(resolve => server.once('close', resolve));
      }
      log.end();
    }
  }
  await browser.close();

  const environment = {
    run_id: runId,
    started_at: now.toISOString(),
    source_commit: sourceCommit,
    runner_os: process.env.RUNNER_OS ?? os.platform(),
    runner_arch: process.env.RUNNER_ARCH ?? os.arch(),
    runner_image_os: process.env.ImageOS ?? null,
    runner_image_version: process.env.ImageVersion ?? null,
    platform: `${os.type()} ${os.release()}`,
    cpu_model: os.cpus()[0]?.model ?? null,
    logical_cpus: os.cpus().length,
    memory_bytes: os.totalmem(),
    node: process.version,
    python: await capture(process.env.PYTHON ?? 'python3', ['--version']),
    dotnet: await capture('dotnet', ['--version']),
    playwright: versions.playwright,
    chromium: chromiumVersion,
    versions,
    python_locks: pythonLocks,
    lock_hashes: {
      npm: await sha256(path.join(ROOT, 'package-lock.json')),
      material: await sha256(path.join(ROOT, 'requirements/material.txt')),
      zensical: await sha256(path.join(ROOT, 'requirements/zensical.txt')),
      mkdocs2: await sha256(path.join(ROOT, 'requirements/mkdocs-2.txt')),
    },
  };

  environment.python_lock_hashes = Object.fromEntries(Object.entries(pythonLocks).map(([id, lock]) => [id, createHash('sha256').update(lock).digest('hex')]));
  const profileData = { runner_os: environment.runner_os, runner_arch: environment.runner_arch, runner_image_os: environment.runner_image_os, runner_image_version: environment.runner_image_version, platform: environment.platform, cpu_model: environment.cpu_model, logical_cpus: environment.logical_cpus, memory_bytes: environment.memory_bytes, node: environment.node, python: environment.python, dotnet: environment.dotnet, chromium: chromiumVersion, lock_hashes: environment.lock_hashes, python_lock_hashes: environment.python_lock_hashes };
  environment.environment_profile_id = createHash('sha256').update(JSON.stringify(profileData)).digest('hex').slice(0, 16);
  await writeFile(path.join(output, 'environment.json'), JSON.stringify(environment, null, 2) + '\n');
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ ...manifest, sample_count: samples, edit_count: edits, participant_order_seed: orderSeed, tooling_versions: versions }, null, 2) + '\n');
  await writeFile(path.join(output, 'results.jsonl'), records.map(record => JSON.stringify({ ...record, environment_id: runId, environment_profile_id: environment.environment_profile_id })).join('\n') + '\n');
  await writeFile(path.join(output, 'summary.md'), summarize(records));
  console.log(`Wrote ${records.length} observations to ${path.relative(ROOT, output)}`);
  const failed = records.filter(record => record.status !== 'ok');
  if (failed.length) {
    console.error(`${failed.length} observations failed validation; see the result files and logs.`);
    process.exitCode = 1;
  }
}

await main();
