const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');

const root = path.resolve(__dirname, '..');
const cachePath = path.join(root, 'tmp', 'validation-cache.json');
const shared = file => /^(package(-lock)?\.json|scripts\/|\.github\/workflows\/ci\.yml|test\/validacao\.test\.js)/.test(file);
const backend = file => shared(file) || /^(src\/|server\.js$|test\/|web\/src\/services\/sseParser\.js$)/.test(file);
const web = file => shared(file) || file.startsWith('web/');
const mobile = file => shared(file) || file.startsWith('mobile/');
const offline = file => shared(file) || /^(mobile\/src\/(database\/|services\/(SyncService|api)\.js|components\/galeriaTransform\.js)|test\/(offline|assinatura-galeria)\.test\.js)/.test(file);
const definitions = [
  { id: 'api', accepts: backend, scope: backend, args: ['--test', '--test-isolation=none', 'test/*.test.js'] },
  { id: 'offline', accepts: offline, scope: offline, args: ['--test', '--test-isolation=none', 'test/offline.test.js', 'test/assinatura-galeria.test.js'] },
  { id: 'web', accepts: web, scope: web, args: ['web/node_modules/vite/bin/vite.js', 'build'], cwd: 'web' },
  { id: 'mobile', accepts: mobile, scope: mobile, args: ['mobile/node_modules/expo/bin/cli', 'export', '--platform', 'web', '--output-dir', 'dist-test'], cwd: 'mobile' },
];

function selectTasks(files, full = false) {
  const tasks = definitions.filter(task => full || files.some(task.accepts));
  // A suíte da API já inclui os testes offline.
  return tasks.filter(task => task.id !== 'offline' || !tasks.some(other => other.id === 'api'));
}

function fingerprint(task, files, read = file => fs.readFileSync(path.join(root, file))) {
  const ambiente = Object.entries(process.env).filter(([key]) => /^(NODE_ENV|TEST_DATABASE_URL|CI|VITE_.*|EXPO_.*)$/.test(key)).sort(([a], [b]) => a.localeCompare(b));
  const hash = crypto.createHash('sha256').update(JSON.stringify([process.version, task.id, task.args, ambiente]));
  for (const file of [...files].filter(task.scope).sort()) {
    hash.update(file).update('\0').update(read(file)).update('\0');
  }
  return hash.digest('hex');
}

function gitFiles(args) {
  return execFileSync('git', ['-c', 'core.safecrlf=false', ...args], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
}

function run(task) {
  return new Promise(resolve => {
    const started = performance.now();
    const args = [...task.args];
    if (task.cwd) args[0] = path.join(root, args[0]);
    const child = spawn(process.execPath, args, { cwd: path.join(root, task.cwd || ''), stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    let output = '';
    const collect = chunk => { output = (output + chunk.toString()).slice(-30000); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    let settled = false;
    const finish = code => {
      if (settled) return; settled = true;
      const seconds = ((performance.now() - started) / 1000).toFixed(2);
      console.log(`${task.id}: ${code === 0 ? 'OK' : 'FALHOU'} (${seconds}s)`);
      if (code !== 0) console.error(output);
      resolve({ id: task.id, ok: code === 0, seconds: Number(seconds) });
    };
    child.on('error', error => { collect(error.message); finish(1); });
    child.on('close', finish);
  });
}

async function main() {
  const full = process.argv.includes('--full');
  const tracked = gitFiles(['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
  const files = [...new Set(tracked)].filter(file => fs.existsSync(path.join(root, file)));
  // Inclui staged, unstaged, arquivos novos e exclusões em relação ao HEAD.
  const changed = [...new Set([...gitFiles(['diff', 'HEAD', '--name-only', '-z']), ...gitFiles(['ls-files', '--others', '--exclude-standard', '-z'])])];
  const tasks = selectTasks(changed, full);
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch { /* primeira execução */ }
  const planned = tasks.map(task => ({ ...task, hash: fingerprint(task, files) }));
  const pending = planned.filter(task => full || cache[task.id]?.hash !== task.hash);
  if (process.argv.includes('--plan')) {
    console.log(JSON.stringify(planned.map(task => ({ tarefa: task.id, executar: pending.includes(task), motivo: pending.includes(task) ? 'alterado ou sem validação' : 'já validado' })), null, 2));
    return;
  }
  if (!planned.length) { console.log('Nenhuma alteração executável: testes e builds dispensados.'); return; }
  for (const task of planned.filter(task => !pending.includes(task))) console.log(`${task.id}: já validado, sem alterações.`);
  // Componentes independentes; falhas não impedem os demais resultados.
  const results = await Promise.all(pending.map(run));
  for (const result of results) if (result.ok) cache[result.id] = { hash: planned.find(task => task.id === result.id).hash, seconds: result.seconds, validatedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  if (results.some(result => !result.ok)) process.exitCode = 1;
}

module.exports = { selectTasks, fingerprint };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
