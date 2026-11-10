const path = require('node:path');
const { spawnSync } = require('node:child_process');
if (!process.env.TEST_DATABASE_URL) throw new Error('Defina TEST_DATABASE_URL para um PostgreSQL exclusivo de testes antes de executar test:e2e.');
const web = path.resolve(__dirname, '..', 'web');
for (const args of [
  [path.join(web, 'node_modules/vite/bin/vite.js'), 'build'],
  [path.join(web, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.e2e-mobile.config.js'],
  [path.join(web, 'node_modules/@playwright/test/cli.js'), 'test'],
]) {
  const result = spawnSync(process.execPath, args, { cwd: web, stdio: 'inherit', windowsHide: true, env: process.env });
  if (result.status !== 0 || result.error) process.exit(result.status || 1);
}
