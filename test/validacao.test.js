const test = require('node:test');
const assert = require('node:assert/strict');
const { selectTasks, fingerprint } = require('../scripts/validate');
const ids = files => selectTasks(files).map(task => task.id);

test('validação seleciona componentes afetados sem repetir offline', () => {
  assert.deepEqual(ids(['docs/README.md']), []);
  assert.deepEqual(ids(['web/src/App.jsx']), ['web']);
  assert.deepEqual(ids(['web/src/services/sseParser.js']), ['api','web']);
  assert.deepEqual(ids(['mobile/src/screens/OS/Finalizadas.js']), ['mobile']);
  assert.deepEqual(ids(['mobile/src/database/sqlite.js']), ['offline', 'mobile']);
  assert.deepEqual(ids(['mobile/src/components/galeriaTransform.js']), ['offline', 'mobile']);
  assert.deepEqual(ids(['src/controllers/AuthController.js']), ['api']);
  assert.deepEqual(ids(['package-lock.json']), ['api', 'web', 'mobile']);
  assert.deepEqual(selectTasks([], true).map(task => task.id), ['api', 'web', 'mobile']);
});

test('cache depende do conteúdo e detecta exclusões e arquivos novos', () => {
  const task = selectTasks(['web/src/App.jsx'])[0];
  const files = ['web/src/App.jsx', 'docs/README.md'];
  const initial = fingerprint(task, files, () => 'original');
  assert.equal(initial, fingerprint(task, [...files].reverse(), () => 'original'));
  assert.notEqual(initial, fingerprint(task, files, () => 'alterado'));
  assert.notEqual(initial, fingerprint(task, ['docs/README.md'], () => 'original'));
  assert.notEqual(initial, fingerprint(task, [...files, 'web/src/nova.jsx'], () => 'original'));
  assert.equal(initial, fingerprint(task, files, file => file.startsWith('docs/') ? 'documentação alterada' : 'original'));
});
