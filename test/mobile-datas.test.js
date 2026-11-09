const test = require('node:test');
const assert = require('node:assert/strict');
const { dataLocal, lerData, dataBrasil, agendamento } = require('../mobile/src/services/Datas.cjs');
test('datas brasileiras preservam o dia civil sem converter para UTC', () => {
  assert.equal(dataBrasil('2026-11-09'), '09/11/2026');
  assert.equal(dataBrasil('2026-11-09T00:00:00.000Z'), '09/11/2026');
  assert.equal(dataLocal(new Date(2026, 10, 9, 23, 59)), '2026-11-09');
});
test('datas impossiveis e horarios fora do intervalo nao viram agendamentos', () => {
  for (const data of ['2026-02-29','2026-04-31','2026-13-01','09/11/2026','']) assert.equal(lerData(data), null);
  assert.equal(dataBrasil('2024-02-29'), '29/02/2024');
  for (const hora of ['24:00','12:60','9:00','','-1:00']) assert.equal(agendamento('2026-11-09',hora),null);
});
test('agendamento conserva data e hora escolhidas no fuso do aparelho', () => {
  for (const hora of ['00:00','09:30','23:59']) {
    const result = new Date(agendamento('2026-11-09',hora));
    assert.equal(dataLocal(result),'2026-11-09');
    assert.equal(result.getHours(),Number(hora.slice(0,2)));
    assert.equal(result.getMinutes(),Number(hora.slice(3,5)));
  }
});
