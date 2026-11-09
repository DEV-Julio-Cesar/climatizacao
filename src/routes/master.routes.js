const express=require('express');
const {z}=require('zod');
const bcrypt=require('bcryptjs');
const db=require('../config/database');
const auth=require('../middlewares/authMiddleware');
const perfil=require('../middlewares/perfilMiddleware');
const {validarDocumento,normalizar}=require('../validators/documento');
const router=express.Router();
router.use('/master',auth,perfil('MASTER'));
const pessoa=z.object({nome:z.string().trim().min(3).max(150),email:z.string().trim().email().max(150).transform(v=>v.toLowerCase()),senha:z.string().min(12).max(100).regex(/[A-Za-z]/).regex(/[0-9]/)}).strict();
const schema=z.object({nome:z.string().trim().min(2).max(150),cnpj:z.string().max(18).transform(normalizar).refine(v=>validarDocumento(v,'CNPJ'),'CNPJ invalido.'),administrador:pessoa,tecnico:pessoa.optional()}).strict();
router.get('/master/empresas',async(req,res)=>{try{const r=await db.query('SELECT id,nome,cnpj,ativo,created_at FROM empresas WHERE id<>$1 AND deleted_at IS NULL ORDER BY id DESC LIMIT 200',[req.usuarioLogado.empresa_id]);return res.json(r.rows);}catch{return res.status(500).json({erro:'Falha ao listar empresas.'});}});
router.post('/master/empresas',async(req,res)=>{
 const v=schema.safeParse(req.body);if(!v.success)return res.status(400).json({erro:'Revise os dados da empresa e dos acessos.',detalhes:v.error.issues});
 if(v.data.tecnico?.email===v.data.administrador.email)return res.status(400).json({erro:'Administrador e tecnico precisam de emails diferentes.'});
 try{const d=v.data;const adminHash=await bcrypt.hash(d.administrador.senha,12);const techHash=d.tecnico?await bcrypt.hash(d.tecnico.senha,12):null;
 const empresa=await db.transaction(async c=>{
 const e=(await c.query('INSERT INTO empresas(nome,cnpj,email) VALUES($1,$2,$3) RETURNING id,nome,cnpj',[d.nome,d.cnpj,d.administrador.email])).rows[0];
 for(const [p,hash,role] of [[d.administrador,adminHash,'ADMIN'],[d.tecnico,techHash,'TECNICO']])if(p)await c.query('INSERT INTO usuarios(empresa_id,nome,email,senha_hash,perfil) VALUES($1,$2,$3,$4,$5)',[e.id,p.nome,p.email,hash,role]);
 await c.query("INSERT INTO seguranca_auditoria(empresa_id,usuario_id,acao) VALUES($1,$2,'MASTER_EMPRESA_CRIADA')",[e.id,req.usuarioLogado.usuario_id]);return e;});
 return res.status(201).json({mensagem:'Empresa e acessos criados.',empresa});
 }catch(e){require('../config/logger').erro('master.criar_empresa',{erro_codigo:e.code,request_id:req.id});return res.status(e.code==='23505'?409:500).json({erro:e.code==='23505'?'CNPJ ou email ja cadastrado.':'Falha ao criar empresa.'});}
});
module.exports=router;
