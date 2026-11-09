const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const logger = require('../config/logger');
async function auditar(c,u,e,t,ip) {
  await c.query('INSERT INTO lgpd_auditoria(usuario_id,empresa_id,tipo,ip_origem) VALUES($1,$2,$3,$4)',[u,e,t,ip||null]);
}
class LgpdController {
  async exportarDados(req,res) {
    const {usuario_id:u,empresa_id:e}=req.usuarioLogado;
    try {
      const dados=await db.transaction(async c=>{
        const usuario=await c.query('SELECT id,nome,email,perfil,created_at FROM usuarios WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL',[u,e]);
        // Do not export client records, free text, addresses, signatures or financial data of third parties.
        const atividades=await c.query('SELECT id,tipo_servico,status,agendado_para,iniciado_em,finalizado_em,created_at FROM ordens_servico WHERE tecnico_id=$1 AND empresa_id=$2 AND deleted_at IS NULL ORDER BY id',[u,e]);
        await auditar(c,u,e,'EXPORTACAO_DADOS',req.ip);
        return {usuario:usuario.rows[0]||null,atividades:atividades.rows};
      });
      res.setHeader('Cache-Control','no-store');
      return res.json({exportado_em:new Date().toISOString(),aviso:'Dados cadastrais e metadados de atividade da sua conta. Solicite ao controlador avaliação de outros dados pessoais e registros sujeitos a retenção.',...dados});
    }catch(error){logger.erro('lgpd.exportar',{usuario_id:u,erro_codigo:error.code});return res.status(500).json({erro:'Falha ao exportar dados.'});}
  }
  async excluirDados(req,res) {
    if(req.body?.confirmacao!=='CONFIRMAR_EXCLUSAO'||typeof req.body?.senha_atual!=='string'||req.body.senha_atual.length>200)
      return res.status(400).json({erro:'Confirme a exclusão e informe sua senha atual.'});
    const {usuario_id:u,empresa_id:e}=req.usuarioLogado;
    try {
      await db.transaction(async c=>{
        // Serialize administrative removal within a company to preserve its last administrator.
        await c.query('SELECT id FROM empresas WHERE id=$1 FOR UPDATE',[e]);
        const atual=(await c.query('SELECT id,perfil,senha_hash FROM usuarios WHERE id=$1 AND empresa_id=$2 AND ativo=TRUE AND deleted_at IS NULL FOR UPDATE',[u,e])).rows[0];
        if(!atual||!await bcrypt.compare(req.body.senha_atual,atual.senha_hash))throw Object.assign(new Error('Senha atual incorreta.'),{status:401});
        if(atual.perfil==='ADMIN'){
          const outros=await c.query("SELECT id FROM usuarios WHERE empresa_id=$1 AND id<>$2 AND perfil='ADMIN' AND ativo=TRUE AND deleted_at IS NULL",[e,u]);
          if(!outros.rows.length)throw Object.assign(new Error('Transfira a administração ou solicite o encerramento da empresa ao controlador antes de remover o último administrador.'),{status:409});
        }
        await c.query("UPDATE usuarios SET nome='Usuário removido',email=$1,senha_hash='REMOVIDO',ativo=FALSE,deleted_at=NOW(),senha_alterada_em=NOW() WHERE id=$2 AND empresa_id=$3",[`${crypto.randomUUID()}@removido.invalid`,u,e]);
        await c.query('UPDATE sessoes SET revogada_em=NOW() WHERE usuario_id=$1 AND empresa_id=$2 AND revogada_em IS NULL',[u,e]);
        await c.query('DELETE FROM dispositivos_push WHERE usuario_id=$1 AND empresa_id=$2',[u,e]);
        await c.query('DELETE FROM notificacoes WHERE usuario_id=$1 AND empresa_id=$2',[u,e]);
        await c.query('DELETE FROM emails_recuperacao WHERE id IN (SELECT id FROM recuperacoes_senha WHERE usuario_id=$1 AND empresa_id=$2)',[u,e]);
        await c.query('DELETE FROM recuperacoes_senha WHERE usuario_id=$1 AND empresa_id=$2',[u,e]);
        await c.query('DELETE FROM usuario_permissoes WHERE usuario_id=$1',[u]);
        await auditar(c,u,e,'EXCLUSAO_DADOS',req.ip);
      });
      return res.json({mensagem:'Conta desativada e identificadores cadastrais removidos. Sessões e dispositivos revogados. Registros operacionais e de auditoria permanecem vinculados por identificador interno; sua retenção e eventual eliminação devem ser avaliadas pelo controlador. Isso não constitui anonimização completa.'});
    }catch(error){logger.erro('lgpd.excluir',{usuario_id:u,erro_codigo:error.code});return res.status(error.status||500).json({erro:error.status?error.message:'Falha ao processar exclusão.'});}
  }
}
module.exports=new LgpdController();
