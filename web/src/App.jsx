import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import Login from './pages/Login';
import RecuperarSenha from './pages/RecuperarSenha';
import { api, encerrarSessao, limparSessao, getAccessToken, setAccessToken, restaurarSessao } from './services/api';

const EmpresasMaster=lazy(()=>import('./pages/EmpresasMaster'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const PainelDespacho = lazy(() => import('./pages/PainelDespacho'));
const MapaEquipe = lazy(() => import('./pages/MapaEquipe'));
const Clientes = lazy(() => import('./pages/Clientes'));
const Catalogo = lazy(() => import('./pages/Catalogo'));
const Operacao = lazy(() => import('./pages/Operacao'));
const Orcamentos = lazy(() => import('./pages/Orcamentos'));
const Suprimentos = lazy(() => import('./pages/Suprimentos'));
const Configuracoes = lazy(() => import('./pages/Configuracoes'));
const Tecnicos = lazy(() => import('./pages/Tecnicos'));
const WhatsApp = lazy(() => import('./pages/WhatsApp'));
const MinhaConta = lazy(() => import('./pages/MinhaConta'));

const menus = [
  {id:'empresas',label:'Empresas',icon:'+',permission:'PLATAFORMA_GERENCIAR',component:EmpresasMaster},
  { id: 'dashboard', label: 'Visão geral', icon: '▦', permission: 'GESTAO_VISUALIZAR', component: Dashboard },
  { id: 'despacho', label: 'Agendamentos', icon: '▣', permission: 'AGENDA_VISUALIZAR', component: PainelDespacho },
  { id: 'mapa', label: 'Mapa da equipe', icon: '⌖', permission: 'GESTAO_VISUALIZAR', component: MapaEquipe },
  { id: 'clientes', label: 'Clientes', icon: '♙', permission: 'CLIENTES_VISUALIZAR', component: Clientes },
  { id: 'catalogo', label: 'Produtos e serviços', icon: '▤', permission: 'ESTOQUE_VISUALIZAR', component: Catalogo },
  { id: 'orcamentos', label: 'Orçamentos', icon: '▧', permission: 'FINANCEIRO_VISUALIZAR', component: Orcamentos },
  { id: 'suprimentos', label: 'Compras e estoque', icon: '▣', permission: 'ESTOQUE_VISUALIZAR', component: Suprimentos },
  { id: 'operacao', label: 'Operação', icon: '◇', permissions: ['ESTOQUE_VISUALIZAR', 'FINANCEIRO_VISUALIZAR', 'GESTAO_VISUALIZAR'], component: Operacao },
  { id: 'tecnicos', label: 'Equipe técnica', icon: '♟', permission: 'GESTAO_GERENCIAR', component: Tecnicos },
  { id: 'whatsapp', label: 'Atendimento', icon: '●', permission: 'ATENDIMENTO_VISUALIZAR', component: WhatsApp },
  { id: 'config', label: 'Configurações', icon: '⚙', permission: 'GESTAO_GERENCIAR', component: Configuracoes },
  { id: 'conta', label: 'Minha conta', icon: '○', component: MinhaConta },
];

function readUser() {
  try { return JSON.parse(localStorage.getItem('climasaas_usuario') || '{}'); }
  catch { return {}; }
}

function canAccess(user, item) {
  if(user?.perfil==='MASTER')return true;
  const permissions = user?.permissoes;
  if (!Array.isArray(permissions) || permissions.includes('*')) return true;
  if (item.permissions) return item.permissions.some((permission) => permissions.includes(permission));
  return !item.permission || permissions.includes(item.permission);
}

export default function App(){
  const ler=()=>location.hash.startsWith('#redefinir-senha')?new URLSearchParams(location.hash.split('?')[1]||'').get('token')||'':null;
  const [tokenReset,setTokenReset]=useState(ler);
  useEffect(()=>{
    const alterar=()=>{const token=ler();setTokenReset(atual=>token===''&&atual!==null?atual:token);if(token)history.replaceState(null,'',`${location.pathname}${location.search}#redefinir-senha`);};
    alterar();window.addEventListener('hashchange',alterar);return()=>window.removeEventListener('hashchange',alterar);
  },[]);
  if(tokenReset!==null)return <RecuperarSenha token={tokenReset} onVoltar={()=>{location.hash='login';setTokenReset(null);}}/>;
  return <Painel/>;
}

function Painel() {
  const [token, setToken] = useState(undefined);
  const [user, setUser] = useState(readUser);
  useEffect(()=>{let active=true;restaurarSessao().then(t=>{if(active){setUser(readUser());setToken(t);}}).catch(()=>{if(active){limparSessao();setToken(null);setUser({});}});return()=>{active=false;};},[]);
  const [empresasMaster,setEmpresasMaster]=useState([]);
  const [empresaContexto,setEmpresaContexto]=useState(()=>sessionStorage.getItem('climasaas_empresa_contexto')||'');
  useEffect(()=>{if(token&&user.perfil==='MASTER')api.get('/master/empresas').then(r=>setEmpresasMaster(r.data)).catch(()=>setEmpresasMaster([]));},[token,user.perfil]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [online, setOnline] = useState(true);
  const [theme, setTheme] = useState(() => localStorage.getItem('climasaas_tema') || 'sistema');
  const availableMenus = useMemo(() => menus.filter((item) => canAccess(user, item)), [user]);
  const initialPage = () => location.hash.slice(1) || availableMenus[0]?.id || 'dashboard';
  const [page, setPage] = useState(initialPage);

  useEffect(() => {
    const syncHash = () => setPage(location.hash.slice(1) || availableMenus[0]?.id || 'dashboard');
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, [availableMenus]);

  useEffect(() => {
    if (availableMenus.length && !availableMenus.some((item) => item.id === page)) {
      location.hash = availableMenus[0].id;
    }
  }, [availableMenus, page]);

  useEffect(() => {
    const expirada = () => {
      limparSessao();
      setToken(null);
      setUser({});
    };
    window.addEventListener('climasaas:session-expired', expirada);
    return () => window.removeEventListener('climasaas:session-expired', expirada);
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    const verificar = async () => { try { await api.get('/health', { timeout:5000 }); setOnline(true); } catch { setOnline(false); } };
    verificar(); const timer = setInterval(verificar, 30000);
    return () => clearInterval(timer);
  }, [token]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const aplicar = () => { document.documentElement.dataset.theme = theme === 'sistema' ? (media.matches ? 'dark' : 'light') : theme; };
    aplicar();
    localStorage.setItem('climasaas_tema', theme);
    media.addEventListener('change', aplicar);
    return () => media.removeEventListener('change', aplicar);
  }, [theme]);

  if (token===undefined) return <div role="status">Carregando sess?o...</div>;
  if (!token) {
    return <Login onLogin={(newToken, newUser) => {
      setAccessToken(newToken);
      localStorage.setItem('climasaas_usuario', JSON.stringify(newUser));
      setUser(newUser);
      setToken(newToken);
    }} />;
  }

  const current = availableMenus.find((item) => item.id === page) || availableMenus[0];
  const CurrentPage = current?.component;
  const logout = async () => {
    try { await encerrarSessao(); }
    finally { setToken(null); setUser({}); }
  };

  return <div className="shell">
    <aside className={menuOpen ? 'menu-open' : ''}>
      <div className="brand"><span className="brand-mark">❄</span><span>ClimaSaaS</span></div>
      <button className="menu-close" aria-label="Fechar menu" onClick={() => setMenuOpen(false)}>×</button>
      <div className="user">
        <div className="user-avatar">{String(user.nome || 'U').slice(0, 1).toUpperCase()}</div>
        <div><b>{user.nome || 'Usuário'}</b><small>{user.perfil || 'Equipe'}</small></div>
      </div>
      {user.perfil==='MASTER'&&<label style={{color:'white',padding:12}}>Empresa em administracao<select aria-label="Empresa em administracao" value={empresaContexto} onChange={e=>{sessionStorage.setItem('climasaas_empresa_contexto',e.target.value);window.location.hash='dashboard';window.location.reload();}}><option value="">Selecione uma empresa</option>{empresasMaster.filter(e=>e.ativo).map(e=><option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>}
      <nav aria-label="Navegação principal">
        {availableMenus.map((item) => <a key={item.id} href={`#${item.id}`} className={page === item.id ? 'active' : ''} onClick={() => setMenuOpen(false)}>
          <span aria-hidden="true">{item.icon}</span>{item.label}
        </a>)}
      </nav>
      <button className="logout" onClick={logout}><span>↪</span>Sair da conta</button>
    </aside>
    {menuOpen && <button className="menu-overlay" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
    <main>
      <header>
        <div className="header-copy">
          <button className="menu-toggle" aria-label="Abrir menu" onClick={() => setMenuOpen(true)}>☰</button>
          <div><span className="eyebrow">PAINEL DE GESTÃO</span><h1>{current?.label || 'ClimaSaaS'}</h1></div>
        </div>
        <div className="header-actions"><button className="theme-toggle" aria-label="Alternar tema" title="Alternar tema" onClick={() => setTheme((atual) => atual === 'light' ? 'dark' : atual === 'dark' ? 'sistema' : 'light')}>{theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐'}</button><div className={`header-status ${online ? '' : 'offline'}`} role="status"><span className="status-dot" />{online ? 'Sistema online' : 'Sem conexão'}</div></div>
      </header>
      <Suspense fallback={<div className="loading">Carregando módulo...</div>}>
        {user.perfil==='MASTER'&&!empresaContexto&&!['empresas','conta'].includes(current?.id)?<div className="panel">Selecione uma empresa no menu para acessar este modulo.</div>:CurrentPage ? <CurrentPage /> : <div className="empty">Você não possui módulos disponíveis.</div>}
      </Suspense>
    </main>
  </div>;
}
