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

async function saveTargetDiagnostic(id, participant, project, validation) {
  if (!validation.target_output) return;
  const target = path.join(project, participant.output_dir, validation.target_output);
  await writeFile(path.join(output, 'logs', `${id}-target.html`), await readFile(target, 'utf8'));
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

const displayNames = {
  mdu: 'MDU',
  hugo: 'Hugo',
  'astro-starlight': 'Astro + Starlight',
  vitepress: 'VitePress',
  docusaurus: 'Docusaurus',
  'material-for-mkdocs': 'Material for MkDocs',
  zensical: 'Zensical',
  'mkdocs-2': 'MkDocs 2.0',
};

const featureNames = {
  nested_markdown_pages: 'Nested pages',
  headings_and_paragraphs: 'Headings and paragraphs',
  emphasis_and_inline_code: 'Emphasis and inline code',
  lists_and_block_quotes: 'Lists and block quotes',
  tables_and_fenced_code: 'Tables and fenced code',
  relative_markdown_links: 'Relative Markdown links',
  local_images: 'Local images',
};

function displayName(id) {
  return displayNames[id] ?? id;
}

function summarize(records, featureMatrix, environment) {
  const ids = [...new Set(records.map(record => record.participant))];
  const scenarios = ['clean-build', 'warm-build', 'edit-to-dom'];
  const rows = ids.map(id => {
    const cells = scenarios.map(scenario => {
      if (scenario === 'edit-to-dom' && records.some(record => record.participant === id && record.scenario === scenario && record.status === 'unsupported')) return 'unsupported';
      const values = records.filter(record => record.participant === id && record.scenario === scenario && record.status === 'ok').map(record => record.elapsed_ms);
      return values.length ? `${median(values).toFixed(1)} (${values.length})` : '—';
    });
    return `| ${displayName(id)} | ${cells.join(' | ')} |`;
  });
  const featureRows = ids.map(id => {
    const cells = Object.keys(featureNames).map(key => {
      const status = featureMatrix[id]?.features?.[key]?.status ?? 'not checked';
      return status === 'pass' ? 'Pass' : status === 'fail' ? 'Fail' : status;
    });
    return `| ${displayName(id)} | ${cells.join(' | ')} |`;
  });
  const workflowUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null;
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
    '## Markdown feature parity',
    '',
    'Pass means the generated output contains the expected semantic HTML and all fixture links/images resolve locally. The detailed evidence is in `feature-matrix.json`.',
    '',
    `| Generator | ${Object.values(featureNames).join(' | ')} |`,
    `| --- | ${Object.keys(featureNames).map(() => '---').join(' | ')} |`,
    ...featureRows,
    '',
    ...(workflowUrl ? [`Workflow: [GitHub Actions run ${runId}](${workflowUrl})`, ''] : []),
    `Environment profile: \`${environment.environment_profile_id}\` · \`${environment.runner_image_os ?? environment.runner_os}\` image \`${environment.runner_image_version ?? 'unknown'}\` · ${environment.cpu_model ?? 'unknown CPU'} · ${environment.logical_cpus} logical CPUs.`,
    '',
    '![Build and edit medians](chart.svg)',
    '',
  ].join('\n');
}

function svgEscape(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function renderChart(records, environment, manifest) {
  const ids = [...new Set(records.map(record => record.participant))];
  const buildMedian = id => median(records.filter(record => record.participant === id && record.scenario === 'clean-build' && record.status === 'ok').map(record => record.elapsed_ms));
  ids.sort((a, b) => (buildMedian(a) ?? Infinity) - (buildMedian(b) ?? Infinity));
  const buildMax = Math.max(500, Math.ceil(Math.max(0, ...ids.flatMap(id => [
    buildMedian(id) ?? 0,
    median(records.filter(record => record.participant === id && record.scenario === 'warm-build' && record.status === 'ok').map(record => record.elapsed_ms)) ?? 0,
  ])) / 500) * 500);
  const editValues = ids.map(id => median(records.filter(record => record.participant === id && record.scenario === 'edit-to-dom' && record.status === 'ok').map(record => record.elapsed_ms)) ?? 0);
  const editMax = Math.max(500, Math.ceil(Math.max(0, ...editValues) / 250) * 250);
  const width = 1460;
  const buildX = 220;
  const buildWidth = 540;
  const editX = 940;
  const editWidth = 400;
  const top = 164;
  const rowHeight = 44;
  const bottom = top + rowHeight * ids.length;
  const height = bottom + 100;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">`,
    '<title id="title">Static documentation generator benchmark: calibration run</title>',
    '<desc id="desc">Median clean and no-op build times, plus time from source edit to visible browser DOM. Unsupported scenarios are labeled separately.</desc>',
    '<rect width="100%" height="100%" fill="#ffffff"/>',
    '<style>text{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#172033}.muted{fill:#65718a}.grid{stroke:#e5e9f0;stroke-width:1}.row{stroke:#f0f2f6;stroke-width:1}.clean{fill:#4263eb}.warm{fill:#20a37a}.edit{fill:#e38b27}.label{font-size:13px}.tick{font-size:11px}.value{font-size:11px;font-weight:600}.title{font-size:24px;font-weight:700}.subtitle{font-size:13px}.panel{font-size:16px;font-weight:700}.legend{font-size:12px}</style>',
    '<text x="30" y="42" class="title">Static documentation generators</text>',
    `<text x="30" y="68" class="subtitle muted">${manifest.page_count} pages · median latency · calibration only</text>`,
    '<text x="30" y="127" class="panel">Builds (ms)</text>',
    '<rect x="340" y="112" width="12" height="12" rx="2" class="clean"/><text x="359" y="123" class="legend">Clean</text>',
    '<rect x="424" y="112" width="12" height="12" rx="2" class="warm"/><text x="443" y="123" class="legend">No-op</text>',
    '<text x="850" y="127" class="panel">Edit to visible DOM (ms)</text>',
  ];
  for (let tick = 0; tick <= buildMax; tick += buildMax / 5) {
    const x = buildX + buildWidth * tick / buildMax;
    parts.push(`<line x1="${x.toFixed(1)}" y1="${top - 10}" x2="${x.toFixed(1)}" y2="${bottom}" class="grid"/>`);
    parts.push(`<text x="${x.toFixed(1)}" y="${bottom + 19}" text-anchor="middle" class="tick muted">${Math.round(tick).toLocaleString('en-US')}</text>`);
  }
  for (let tick = 0; tick <= editMax; tick += editMax / 4) {
    const x = editX + editWidth * tick / editMax;
    parts.push(`<line x1="${x.toFixed(1)}" y1="${top - 10}" x2="${x.toFixed(1)}" y2="${bottom}" class="grid"/>`);
    parts.push(`<text x="${x.toFixed(1)}" y="${bottom + 19}" text-anchor="middle" class="tick muted">${Math.round(tick).toLocaleString('en-US')}</text>`);
  }
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const y = top + index * rowHeight;
    parts.push(`<line x1="20" y1="${y + rowHeight - 2}" x2="1390" y2="${y + rowHeight - 2}" class="row"/>`);
    parts.push(`<text x="24" y="${y + 22}" class="label">${svgEscape(displayName(id))}</text>`);
    for (const [scenario, className, barY] of [['clean-build', 'clean', y + 4], ['warm-build', 'warm', y + 18]]) {
      const value = median(records.filter(record => record.participant === id && record.scenario === scenario && record.status === 'ok').map(record => record.elapsed_ms));
      if (value === null) continue;
      const barWidth = buildWidth * value / buildMax;
      parts.push(`<rect x="${buildX}" y="${barY}" width="${barWidth.toFixed(1)}" height="10" rx="3" class="${className}"/>`);
      parts.push(`<text x="${(buildX + barWidth + 6).toFixed(1)}" y="${barY + 9}" class="value">${value.toLocaleString('en-US', { maximumFractionDigits: 1 })}</text>`);
    }
    const edit = median(records.filter(record => record.participant === id && record.scenario === 'edit-to-dom' && record.status === 'ok').map(record => record.elapsed_ms));
    const unsupported = records.some(record => record.participant === id && record.scenario === 'edit-to-dom' && record.status === 'unsupported');
    if (unsupported) {
      parts.push(`<text x="${editX + 6}" y="${y + 22}" class="label muted">Unsupported</text>`);
    } else if (edit !== null) {
      const barWidth = editWidth * edit / editMax;
      parts.push(`<rect x="${editX}" y="${y + 11}" width="${barWidth.toFixed(1)}" height="13" rx="4" class="edit"/>`);
      parts.push(`<text x="${(editX + barWidth + 6).toFixed(1)}" y="${y + 22}" class="value">${edit.toLocaleString('en-US', { maximumFractionDigits: 1 })}</text>`);
    }
  }
  parts.push(`<text x="${buildX}" y="${bottom + 47}" class="tick muted">Clean/no-op n=${samples}; edit n=${edits} for supported previews; seed ${manifest.seed}.</text>`);
  parts.push(`<text x="${buildX}" y="${bottom + 67}" class="tick muted">GitHub-hosted ${svgEscape(environment.runner_image_os ?? environment.runner_os)} · image ${svgEscape(environment.runner_image_version ?? 'unknown')} · profile ${environment.environment_profile_id}.</text>`);
  parts.push(`<text x="850" y="${bottom + 74}" class="tick muted">Unsupported scenarios are labeled in the chart.</text>`);
  parts.push(`<text x="850" y="${bottom + 94}" class="tick muted">One hosted run; do not treat as a ranking.</text>`);
  parts.push('</svg>');
  return parts.join('\n') + '\n';
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
      if (!coldCheck.ok) await saveTargetDiagnostic(id, participant, project, coldCheck);
      records.push({
        run_id: runId, source_commit: sourceCommit, participant: id, tool_version: versions[id] ?? null,
        scenario: 'clean-build', sample, sample_order: order, elapsed_ms: cold.elapsed_ms, status: cold.exit_code === 0 && coldCheck.ok ? 'ok' : 'failed',
        validation: coldCheck, corpus_size: pages, corpus_sha256: manifest.corpus_sha256, seed,
      });
      if (cold.exit_code !== 0 || !coldCheck.ok) continue;

      const warmLog = path.join(output, 'logs', `${id}-build.log`);
      const warm = await run(participant.build[0], participant.build.slice(1), project, benchmarkEnv, warmLog);
      const warmCheck = warm.exit_code === 0 ? await validate(participant, project, manifest) : { ok: false, errors: [`build exited ${warm.exit_code}`] };
      if (!warmCheck.ok) await saveTargetDiagnostic(id, participant, project, warmCheck);
      records.push({
        run_id: runId, source_commit: sourceCommit, participant: id, tool_version: versions[id] ?? null,
        scenario: 'warm-build', sample, sample_order: order, elapsed_ms: warm.elapsed_ms, status: warm.exit_code === 0 && warmCheck.ok ? 'ok' : 'failed',
        validation: warmCheck, corpus_size: pages, corpus_sha256: manifest.corpus_sha256, seed,
      });
    }
  }

  const featureMatrix = {};
  for (const id of Object.keys(participants)) {
    const participant = participants[id];
    const outputDir = path.join(ROOT, participant.project, participant.output_dir);
    const raw = await capture(process.env.PYTHON ?? 'python3', ['scripts/audit_features.py', outputDir, String(pages)]);
    let audit;
    try {
      audit = JSON.parse(raw);
    } catch {
      audit = { status: 'fail', error: raw, features: {} };
    }
    featureMatrix[id] = { ...audit, tool_version: versions[id] ?? null };
  }

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const chromiumVersion = browser.version();
  for (const id of shuffle(Object.keys(participants), orderSeed + samples + 1)) {
    const participant = participants[id];
    if (participant.edit_to_dom === 'unsupported') {
      records.push({
        run_id: runId, source_commit: sourceCommit, participant: id, tool_version: versions[id] ?? null,
        scenario: 'edit-to-dom', sample: 0, elapsed_ms: null, status: 'unsupported',
        validation: { reason: 'preview server does not update an already open browser page after a source edit' },
        corpus_size: pages, corpus_sha256: manifest.corpus_sha256, seed,
      });
      continue;
    }
    const project = path.join(ROOT, participant.project);
    const checked = await validate(participant, project, manifest);
    if (!checked.ok) {
      await saveTargetDiagnostic(id, participant, project, checked);
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
        const started = process.hrtime.bigint();
        await writeFile(sourcePage, source, 'utf8');
        try {
          await waitForText(page, `BENCHMARK_EDIT_MARKER=${marker}`);
          records.push({
            run_id: runId, source_commit: sourceCommit, participant: id, tool_version: versions[id] ?? null,
            scenario: 'edit-to-dom', sample: edit, elapsed_ms: Number(process.hrtime.bigint() - started) / 1e6,
            status: 'ok', validation: { target_url: pageUrl }, corpus_size: pages, corpus_sha256: manifest.corpus_sha256, seed,
          });
          if (edit < edits) await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          const bodyText = await page.locator('body').innerText().catch(() => '');
          records.push({
            run_id: runId, source_commit: sourceCommit, participant: id, tool_version: versions[id] ?? null,
            scenario: 'edit-to-dom', sample: edit, elapsed_ms: null, status: 'failed',
            validation: { target_url: pageUrl, error: error.message, observed_edit_marker: bodyText.match(/BENCHMARK_EDIT_MARKER=EDIT\d{3}/)?.[0] ?? null }, corpus_size: pages, corpus_sha256: manifest.corpus_sha256, seed,
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

  for (const [id, audit] of Object.entries(featureMatrix)) {
    if (audit.status === 'pass') continue;
    for (const record of records.filter(record => record.participant === id && record.status === 'ok')) {
      record.status = 'failed';
      record.validation.feature_parity = audit;
    }
  }

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
  const featureReport = {
    run_id: runId,
    source_commit: sourceCommit,
    corpus_size: pages,
    corpus_sha256: manifest.corpus_sha256,
    seed,
    environment_profile_id: environment.environment_profile_id,
    participants: featureMatrix,
  };
  await writeFile(path.join(output, 'environment.json'), JSON.stringify(environment, null, 2) + '\n');
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ ...manifest, sample_count: samples, edit_count: edits, participant_order_seed: orderSeed, tooling_versions: versions }, null, 2) + '\n');
  await writeFile(path.join(output, 'feature-matrix.json'), JSON.stringify(featureReport, null, 2) + '\n');
  await writeFile(path.join(output, 'results.jsonl'), records.map(record => JSON.stringify({ ...record, environment_id: runId, environment_profile_id: environment.environment_profile_id })).join('\n') + '\n');
  await writeFile(path.join(output, 'summary.md'), summarize(records, featureMatrix, environment));
  await writeFile(path.join(output, 'chart.svg'), renderChart(records, environment, manifest));
  console.log(`Wrote ${records.length} observations to ${path.relative(ROOT, output)}`);
  const failed = records.filter(record => record.status === 'failed');
  if (failed.length) {
    console.error(`${failed.length} observations failed validation; see the result files and logs.`);
    process.exitCode = 1;
  }
}

await main();
