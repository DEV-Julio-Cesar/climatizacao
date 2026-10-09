import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const PainelDespacho = lazy(() => import('./pages/PainelDespacho'));
const MapaEquipe = lazy(() => import('./pages/MapaEquipe'));
const Clientes = lazy(() => import('./pages/Clientes'));
const Operacao = lazy(() => import('./pages/Operacao'));
const Configuracoes = lazy(() => import('./pages/Configuracoes'));

const menus = [
  { id: 'dashboard', label: 'Visão geral', icon: '▦', permission: 'GESTAO_VISUALIZAR', component: Dashboard },
  { id: 'despacho', label: 'Agendamentos', icon: '▣', permission: 'AGENDA_VISUALIZAR', component: PainelDespacho },
  { id: 'mapa', label: 'Mapa da equipe', icon: '⌖', permission: 'GESTAO_VISUALIZAR', component: MapaEquipe },
  { id: 'clientes', label: 'Clientes', icon: '♙', permission: 'CLIENTES_VISUALIZAR', component: Clientes },
  { id: 'operacao', label: 'Operação', icon: '◇', permissions: ['ESTOQUE_VISUALIZAR', 'FINANCEIRO_VISUALIZAR', 'GESTAO_VISUALIZAR'], component: Operacao },
  { id: 'config', label: 'Configurações', icon: '⚙', permission: 'GESTAO_GERENCIAR', component: Configuracoes },
];

function readUser() {
  try { return JSON.parse(localStorage.getItem('climasaas_usuario') || '{}'); }
  catch { return {}; }
}

function canAccess(user, item) {
  const permissions = user?.permissoes;
  if (!Array.isArray(permissions) || permissions.includes('*')) return true;
  if (item.permissions) return item.permissions.some((permission) => permissions.includes(permission));
  return !item.permission || permissions.includes(item.permission);
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('climasaas_token'));
  const [user, setUser] = useState(readUser);
  const [menuOpen, setMenuOpen] = useState(false);
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

  if (!token) {
    return <Login onLogin={(newToken, newUser) => {
      localStorage.setItem('climasaas_token', newToken);
      localStorage.setItem('climasaas_usuario', JSON.stringify(newUser));
      setUser(newUser);
      setToken(newToken);
    }} />;
  }

  const current = availableMenus.find((item) => item.id === page) || availableMenus[0];
  const CurrentPage = current?.component;
  const logout = () => {
    localStorage.removeItem('climasaas_token');
    localStorage.removeItem('climasaas_usuario');
    setToken(null);
  };

  return <div className="shell">
    <aside className={menuOpen ? 'menu-open' : ''}>
      <div className="brand"><span className="brand-mark">❄</span><span>ClimaSaaS</span></div>
      <button className="menu-close" aria-label="Fechar menu" onClick={() => setMenuOpen(false)}>×</button>
      <div className="user">
        <div className="user-avatar">{String(user.nome || 'U').slice(0, 1).toUpperCase()}</div>
        <div><b>{user.nome || 'Usuário'}</b><small>{user.perfil || 'Equipe'}</small></div>
      </div>
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
        <div className="header-status"><span className="status-dot" />Sistema online</div>
      </header>
      <Suspense fallback={<div className="loading">Carregando módulo...</div>}>
        {CurrentPage ? <CurrentPage /> : <div className="empty">Você não possui módulos disponíveis.</div>}
      </Suspense>
    </main>
  </div>;
}
