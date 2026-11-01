require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/config/database');

const dados = {
  empresa: String(process.env.ADMIN_COMPANY || '').trim(),
  cnpj: String(process.env.ADMIN_CNPJ || '').replace(/\D/g, ''),
  nome: String(process.env.ADMIN_NAME || '').trim(),
  email: String(process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
  senha: String(process.env.ADMIN_PASSWORD || ''),
};

function validar() {
  if (dados.empresa.length < 2) throw new Error('Nome da empresa inválido.');
  if (dados.cnpj.length !== 14) throw new Error('CNPJ deve possuir 14 dígitos.');
  if (dados.nome.length < 2) throw new Error('Nome do administrador inválido.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) throw new Error('E-mail inválido.');
  if (dados.senha.length < 12 || !/[A-Za-z]/.test(dados.senha) || !/\d/.test(dados.senha) || !/[^A-Za-z0-9]/.test(dados.senha))
    throw new Error('A senha deve ter 12 caracteres, letra, número e caractere especial.');
}

async function executar() {
  try {
    validar();
    const resultado = await db.transaction(async client => {
      let empresa = (await client.query('SELECT id,nome FROM empresas WHERE regexp_replace(cnpj, \'\\D\', \'\', \'g\')=$1 FOR UPDATE', [dados.cnpj])).rows[0];
      if (!empresa) {
        empresa = (await client.query(
          'INSERT INTO empresas(nome,cnpj,email) VALUES($1,$2,$3) RETURNING id,nome',
          [dados.empresa, dados.cnpj, dados.email],
        )).rows[0];
      }
      const existente = (await client.query('SELECT id,empresa_id FROM usuarios WHERE lower(email)=$1 FOR UPDATE', [dados.email])).rows[0];
      if (existente && existente.empresa_id !== empresa.id) throw new Error('E-mail já pertence a outra empresa.');
      const senhaHash = await bcrypt.hash(dados.senha, 12);
      const usuario = existente
        ? (await client.query("UPDATE usuarios SET nome=$1,senha_hash=$2,perfil='ADMIN',ativo=TRUE,deleted_at=NULL,senha_alterada_em=NOW() WHERE id=$3 RETURNING id,nome,email,perfil", [dados.nome, senhaHash, existente.id])).rows[0]
        : (await client.query("INSERT INTO usuarios(empresa_id,nome,email,senha_hash,perfil) VALUES($1,$2,$3,$4,'ADMIN') RETURNING id,nome,email,perfil", [empresa.id, dados.nome, dados.email, senhaHash])).rows[0];
      return { empresa, usuario };
    });
    console.log(`Administrador criado: ${resultado.usuario.email} (${resultado.empresa.nome})`);
  } catch (error) {
    console.error(`Falha ao criar administrador: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await db.pool.end();
  }
}

executar();
