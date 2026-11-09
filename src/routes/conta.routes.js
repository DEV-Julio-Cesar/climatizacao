const express = require('express');
const { rateLimit } = require('express-rate-limit');
const auth = require('../middlewares/authMiddleware');
const perfil = require('../middlewares/perfilMiddleware');
const conta = require('../controllers/ContaController');
const router = express.Router();
router.use(auth);
router.post('/conta/logout', async(req,res)=>{try{await require('../config/database').transaction(async c=>{const u=req.usuarioLogado;await c.query('UPDATE sessoes SET revogada_em=NOW() WHERE id=$1 AND usuario_id=$2 AND empresa_id=$3',[u.sid,u.usuario_id,u.empresa_id]);await c.query('UPDATE dispositivos_push SET ativo=FALSE,updated_at=NOW() WHERE usuario_id=$1 AND empresa_id=$2',[u.usuario_id,u.empresa_id]);});return res.sendStatus(204);}catch{return res.status(503).json({erro:'Não foi poss?vel revogar a sessão.'});}});
router.get('/conta/perfil', conta.perfil);
router.put('/conta/empresa', perfil('ADMIN'), rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-8',legacyHeaders:false}), conta.salvarEmpresa);
router.post('/conta/documentos/consultar', rateLimit({windowMs:60000,limit:10,standardHeaders:'draft-8',legacyHeaders:false}), conta.consultarDocumento);
router.delete('/conta/arquivos/ordens/:id/compartilhamento', perfil('ADMIN'), async(req,res)=>{
  if(!/^[1-9][0-9]*$/.test(req.params.id))return res.sendStatus(400);
  try {const r=await require('../config/database').query('UPDATE ordens_servico SET pdf_compartilhamento_revogado=TRUE WHERE id=$1 AND empresa_id=$2 RETURNING id',[req.params.id,req.usuarioLogado.empresa_id]);return res.sendStatus(r.rows.length?204:404);}catch{return res.sendStatus(500);}
});
module.exports = router;
