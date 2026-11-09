const bcrypt = require('bcryptjs');
﻿const { z } = require('zod');
const axios = require('axios');
const db = require('../config/database');
const { normalizar, validarDocumento } = require('../validators/documento');
const texto = max => z.string().trim().max(max).default('');
const empresaSchema = z.object({
  senha_atual:z.string().min(6).max(200),
  nome: z.string().trim().min(2).max(150),
  cnpj: z.string().max(18).transform(normalizar).refine(v => validarDocumento(v, 'CNPJ'), 'CNPJ inválido.'),
  nome_fantasia: texto(150), telefone: texto(20),
  email: z.union([z.string().trim().email().max(150), z.literal('')]).default(''),
  endereco: texto(255), cidade: texto(100), estado: z.union([z.string().regex(/^[A-Z]{2}$/), z.literal('')]).default(''), cep: texto(9),
}).strict();
const campos = 'e.id,e.nome,e.cnpj,e.nome_fantasia,e.telefone,e.email,e.endereco,e.cidade,e.estado,e.cep';
module.exports = {
  async perfil(req, res) {
    try {
      const u = await db.query('SELECT id,nome,email,perfil FROM usuarios WHERE id=$1 AND empresa_id=$2 AND ativo=TRUE AND deleted_at IS NULL', [req.usuarioLogado.usuario_id, req.usuarioLogado.empresa_id]);
      const e = await db.query(`SELECT ${campos} FROM empresas e WHERE e.id=$1 AND e.ativo=TRUE AND e.deleted_at IS NULL`, [req.usuarioLogado.empresa_id]);
      if (!u.rows[0] || !e.rows[0]) return res.status(404).json({erro:'Perfil não encontrado.'});
      return res.json({usuario:u.rows[0], empresa:e.rows[0]});
    } catch { return res.status(500).json({erro:'Falha ao carregar perfil.'}); }
  },
  async salvarEmpresa(req, res) {
    const v = empresaSchema.safeParse(req.body);
    if (!v.success) return res.status(400).json({erro:v.error.issues[0].message});
    try {
      const {senha_atual,...d} = v.data;
      await db.transaction(async c=>{
        const u=(await c.query('SELECT senha_hash FROM usuarios WHERE id=$1 AND empresa_id=$2 AND ativo=TRUE AND deleted_at IS NULL FOR UPDATE',[req.usuarioLogado.usuario_id,req.usuarioLogado.empresa_id])).rows[0];
        if(!u||!await bcrypt.compare(senha_atual,u.senha_hash))throw Object.assign(new Error('Senha atual incorreta.'),{status:401});
        const r=await c.query(`UPDATE empresas SET nome=$1,cnpj=$2,nome_fantasia=$3,telefone=$4,email=$5,endereco=$6,cidade=$7,estado=$8,cep=$9 WHERE id=$10 AND ativo=TRUE AND deleted_at IS NULL RETURNING id`,[d.nome,d.cnpj,d.nome_fantasia,d.telefone,d.email,d.endereco,d.cidade,d.estado,d.cep,req.usuarioLogado.empresa_id]);
        if(!r.rows.length)throw Object.assign(new Error('Empresa nao encontrada.'),{status:404});
        await c.query("INSERT INTO seguranca_auditoria(empresa_id,usuario_id,acao) VALUES($1,$2,'EMPRESA_ATUALIZADA')",[req.usuarioLogado.empresa_id,req.usuarioLogado.usuario_id]);
      });
      return res.json({mensagem:'Dados da empresa atualizados.'});
    } catch(e) { return res.status(e.status||(e.code==='23505'?409:500)).json({erro:e.status?e.message:e.code==='23505'?'CNPJ já cadastrado.':'Falha ao salvar empresa.'}); }
  },
  async consultarDocumento(req, res) {
    const n = normalizar(req.body?.documento);
    if (!validarDocumento(n)) return res.status(400).json({valido:false,erro:'CPF ou CNPJ inválido.'});
    if (n.length === 11) return res.json({valido:true,tipo:'CPF', verificado:false,mensagem:'Dígitos válidos. Não comprova existência, titularidade ou situação cadastral.'});
    try {
      const {data:d} = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${n}`, {timeout:8000,maxContentLength:1024*1024});
      if (normalizar(d.cnpj) !== n || !d.razao_social) throw new Error('Resposta inválida');
      return res.json({valido:true,tipo:'CNPJ',verificado:true,fonte:'BrasilAPI',consultado_em:new Date().toISOString(),situacao:d.descricao_situacao_cadastral,empresa:{cnpj:n,nome:d.razao_social,nome_fantasia:d.nome_fantasia||'',telefone:d.ddd_telefone_1||'',email:d.email||'',endereco:[d.descricao_tipo_de_logradouro,d.logradouro,d.numero,d.complemento,d.bairro].filter(Boolean).join(' '),cidade:d.municipio||'',estado:d.uf||'',cep:d.cep||''},mensagem:'Encontrado na base pública. A consulta não comprova titularidade e pode ter defasagem.'});
    } catch(e) {
      if(e.response?.status===404) return res.status(404).json({valido:true,verificado:false,erro:'CNPJ não encontrado na base consultada. Isso não comprova que seja falso.'});
      return res.status(503).json({valido:true,verificado:false,erro:'Consulta indisponível. Tente novamente; o documento não foi confirmado.'});
    }
  },
};
