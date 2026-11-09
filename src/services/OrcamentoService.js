const {z}=require('zod');
const db=require('../config/database');
const texto=max=>z.string().trim().max(max).default('');
const preco=z.coerce.number().finite().min(0).max(99999999.99).refine(n=>Math.abs(n*100-Math.round(n*100))<1e-5,'Use no maximo duas casas decimais.');
const itemSchema=z.object({tipo:z.enum(['SERVICO','PECA']),referencia_id:z.coerce.number().int().positive().nullable().optional(),descricao:z.string().trim().min(2).max(200),quantidade:z.coerce.number().finite().positive().max(99999999.99).refine(n=>Math.abs(n*100-Math.round(n*100))<1e-5,'Quantidade com no maximo duas casas decimais.'),valor_unitario:preco,custo_unitario:preco.default(0)}).strict();
const prospectSchema=z.object({nome:z.string().trim().min(2).max(150),telefone:texto(20),email:z.union([z.string().trim().email().max(150),z.literal('')]).default(''),endereco:texto(255)}).strict();
const schema=z.object({cliente_id:z.coerce.number().int().positive().nullable().optional(),destinatario:prospectSchema.optional(),aparelho_id:z.coerce.number().int().positive().nullable().optional(),validade:z.union([z.string().date(),z.literal('')]).optional(),observacoes:texto(2000),desconto:preco.default(0),itens:z.array(itemSchema).min(1).max(100)}).strict().superRefine((d,ctx)=>{if(Boolean(d.cliente_id)===Boolean(d.destinatario))ctx.addIssue({code:'custom',message:'Escolha cliente cadastrado ou futuro cliente, nunca ambos.'});if(!d.cliente_id&&d.aparelho_id)ctx.addIssue({code:'custom',message:'Equipamento exige cliente cadastrado.'});});
const falha=(message,status=400)=>Object.assign(new Error(message),{status});
function totais(d){const centavos=(q,v)=>Math.round(Math.round(q*100)*Math.round(v*100)/100);const sub=d.itens.reduce((s,i)=>s+centavos(i.quantidade,i.valor_unitario),0),custo=d.itens.reduce((s,i)=>s+centavos(i.quantidade,i.custo_unitario),0),desc=Math.round(d.desconto*100);if(sub>9999999999||custo>9999999999)throw falha('Valor total excede o limite.');if(desc>sub)throw falha('O desconto nao pode superar o subtotal.');return {subtotal:sub/100,custo_total:custo/100,total:(sub-desc)/100};}
async function criar(d,u){return db.transaction(async c=>{
 let destinatario=d.destinatario||null;
 if(d.cliente_id){const r=await c.query('SELECT id,nome,telefone,email,endereco,numero,cidade,estado FROM clientes WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL',[d.cliente_id,u.empresa_id]);if(!r.rows[0])throw falha('Cliente invalido.');destinatario={...r.rows[0]};delete destinatario.id;}
 if(d.aparelho_id){const a=await c.query('SELECT id FROM aparelhos WHERE id=$1 AND cliente_id=$2 AND empresa_id=$3 AND deleted_at IS NULL',[d.aparelho_id,d.cliente_id,u.empresa_id]);if(!a.rows.length)throw falha('Equipamento nao pertence ao cliente.');}
 const empresa=(await c.query('SELECT nome,nome_fantasia,cnpj,telefone,email,endereco,cidade,estado,cep FROM empresas WHERE id=$1 AND ativo=TRUE AND deleted_at IS NULL',[u.empresa_id])).rows[0];if(!empresa)throw falha('Empresa nao encontrada.',404);
 for(const i of d.itens)if(i.referencia_id){const tabela=i.tipo==='PECA'?'produtos':'catalogo_servicos';const r=await c.query(`SELECT id FROM ${tabela} WHERE id=$1 AND empresa_id=$2 AND ativo=TRUE`,[i.referencia_id,u.empresa_id]);if(!r.rows.length)throw falha('Item do catalogo invalido para esta empresa.');}
 const t=totais(d);
 const r=await c.query(`INSERT INTO orcamentos(empresa_id,cliente_id,aparelho_id,criado_por,validade,observacoes,desconto,subtotal,custo_total,total,destinatario_snapshot,empresa_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb) RETURNING *`,[u.empresa_id,d.cliente_id||null,d.aparelho_id||null,u.usuario_id,d.validade||null,d.observacoes||null,d.desconto,t.subtotal,t.custo_total,t.total,JSON.stringify(destinatario),JSON.stringify(empresa)]);
 for(const i of d.itens)await c.query('INSERT INTO orcamento_itens(orcamento_id,tipo,referencia_id,descricao,quantidade,valor_unitario,custo_unitario) VALUES($1,$2,$3,$4,$5,$6,$7)',[r.rows[0].id,i.tipo,i.referencia_id||null,i.descricao,i.quantidade,i.valor_unitario,i.custo_unitario]);
 return r.rows[0];
});}
async function carregar(id,empresaId){
 const r=await db.query(`SELECT o.*,c.nome cadastro_nome,c.telefone cadastro_telefone,c.email cadastro_email,c.endereco cadastro_endereco,c.numero cadastro_numero,c.cidade cadastro_cidade,c.estado cadastro_estado,e.nome empresa_nome,e.nome_fantasia empresa_nome_fantasia,e.cnpj empresa_cnpj,e.telefone empresa_telefone,e.email empresa_email,e.endereco empresa_endereco,e.cidade empresa_cidade,e.estado empresa_estado,e.cep empresa_cep FROM orcamentos o LEFT JOIN clientes c ON c.id=o.cliente_id AND c.empresa_id=o.empresa_id JOIN empresas e ON e.id=o.empresa_id WHERE o.id=$1 AND o.empresa_id=$2`,[id,empresaId]);
 if(!r.rows[0])return null;
 const o=r.rows[0],d=o.destinatario_snapshot||{};
 for(const k of ['nome','telefone','email','endereco','numero','cidade','estado'])o['cliente_'+k]=d[k]??o['cadastro_'+k]??'';
 if(o.empresa_snapshot)for(const [k,v]of Object.entries(o.empresa_snapshot))o['empresa_'+k]=v;
 o.itens=(await db.query('SELECT * FROM orcamento_itens WHERE orcamento_id=$1 ORDER BY id',[id])).rows;
 delete o.destinatario_snapshot;delete o.empresa_snapshot;return o;
}
module.exports={schema,totais,criar,carregar};
