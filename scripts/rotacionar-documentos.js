// Run only after configuring DATA_ENCRYPTION_SECRET and explicit DATA_ENCRYPTION_LEGACY_SECRET.
// Transaction rolls back on any unreadable record. Never logs document values.
require('dotenv').config();
const db=require('../src/config/database');
const Documento=require('../src/services/DocumentoService');
async function main(){
 if(!process.env.DATA_ENCRYPTION_SECRET||!process.env.DATA_ENCRYPTION_LEGACY_SECRET)throw new Error('Configure a chave nova e a chave legada explicitamente.');
 await db.transaction(async c=>{
  const r=await c.query('SELECT id,empresa_id,documento_cifrado,cpf_cnpj FROM clientes WHERE documento_cifrado IS NOT NULL OR cpf_cnpj IS NOT NULL FOR UPDATE');
  for(const row of r.rows){const doc=row.documento_cifrado?Documento.decifrar(row.documento_cifrado):Documento.normalizar(row.cpf_cnpj);if(!doc)throw new Error('Documento ilegível; rotação cancelada.');const d=Documento.proteger(doc,row.empresa_id);await c.query('UPDATE clientes SET documento_cifrado=$1,documento_hash=$2,cpf_cnpj=NULL WHERE id=$3 AND empresa_id=$4',[d.documento_cifrado,d.documento_hash,row.id,row.empresa_id]);}
  console.log(`Documentos recifrados: ${r.rows.length}`);
 });
}
main().catch(()=>{console.error('Rotação não concluída. Verifique configuração e registros sem expor documentos.');process.exitCode=1;}).finally(()=>db.pool.end());
