const pad = n => String(n).padStart(2, '0');
function dataLocal(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function lerData(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(String(value || ''));
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(y, m-1, d, 12);
  return date.getFullYear() === y && date.getMonth() === m-1 && date.getDate() === d ? date : null;
}
function dataBrasil(value) { const d = lerData(value); return d ? `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}` : ''; }
function horaLocal(d = new Date()) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function agendamento(data, hora) {
  const d = lerData(data); const match = /^(\d{2}):(\d{2})$/.exec(hora || '');
  if (!d || !match || +match[1] > 23 || +match[2] > 59) return null;
  d.setHours(+match[1], +match[2], 0, 0);
  if (horaLocal(d) !== hora) return null;
  return d.toISOString();
}
module.exports = { dataLocal, lerData, dataBrasil, horaLocal, agendamento };
