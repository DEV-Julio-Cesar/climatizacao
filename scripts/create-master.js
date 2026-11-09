require('dotenv').config();
const {z}=require('zod');
const bcrypt=require('bcryptjs');
const db=require('../src/config/database');
async function main(){
 const d=z.object({nome:z.string().trim().min(3).max(150),email:z.string().trim().email().max(150),senha:z.string().min(12).max(100).regex(/[A-Za-z]/).regex(/[0-9]/)}).parse({nome:process.env.MASTER_NAME,email:process.env.MASTER_EMAIL,senha:process.env.MASTER_PASSWORD});
 const hash=await bcrypt.hash(d.senha,12);
 await db.transaction(async c=>{
 await c.query('SELECT pg_advisory_xact_lock(782105)');
 const old=await c.query("SELECT id FROM usuarios WHERE perfil='MASTER' AND deleted_at IS NULL");if(old.rows.length)throw new Error('Master ja existe; nenhuma conta foi alterada.');
 const e=(await c.query('INSERT INTO empresas(nome) VALUES($1) RETURNING id',['Administracao da plataforma'])).rows[0];
 await c.query("INSERT INTO usuarios(empresa_id,nome,email,senha_hash,perfil) VALUES($1,$2,$3,$4,'MASTER')",[e.id,d.nome,d.email.toLowerCase(),hash]);
 });console.log('Master criado. Nenhuma senha foi exibida.');
}
main().catch(()=>{console.error('Master nao criado. Confira dados, migracoes e se ja existe um master.');process.exitCode=1;}).finally(()=>db.pool.end());
