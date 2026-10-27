/**
 * theme.js — Paletas de cores do ClimaSaaS
 *
 * Duas paletas: `light` (padrão atual) e `dark`.
 * O hook `useTheme()` retorna a paleta ativa conforme a preferência
 * do usuário (claro / escuro / seguir sistema) em AppContext.
 *
 * Para telas que ainda usam `import { colors } from '../../styles/theme'`
 * diretamente, `colors` continua apontando para a pa clara — compatibilidade
 * total. Telas migradas usam `useTheme()` e recebem a paleta dinâmica.
 */

// ─── Paleta clara (atual) ─────────────────────────────────────────────────
export const light = {
  navy:       '#0B1F33',
  primary:    '#087EA4',
  primaryDark:'#075D78',
  cyan:       '#23B5D3',
  mint:       '#16A394',
  success:    '#159A72',
  danger:     '#D9534F',
  warning:    '#F2A93B',
  background: '#F3F7F9',
  surface:    '#FFFFFF',
  surfaceAlt: '#EDF2F4',
  text:       '#132A3A',
  muted:      '#6B7F8C',
  border:     '#DCE7EC',
  // Cores auxiliares usadas inline em algumas telas
  cardBg:     '#FFFFFF',
  inputBg:    '#F3F7F9',
  divider:    '#EDF2F4',
  overlay:    'rgba(255,255,255,.14)',
  heroText:   '#CBEAF2',
  heroSub:    '#D6F0F5',
};

// ─── Paleta escura ────────────────────────────────────────────────────────
export const dark = {
  navy:       '#0B1F33',          // mantém — já é escuro
  primary:    '#1AA3CC',          // cyan mais brilhante para contraste
  primaryDark:'#087EA4',
  cyan:       '#3FCFE8',
  mint:       '#2BC4B0',
  success:    '#1FB886',
  danger:     '#E66B68',
  warning:    '#F5B85C',
  background: '#0D1B2A',          // fundo escuro azulado
  surface:    '#152840',          // cards
  surfaceAlt: '#1A304A',          // inputs, chips
  text:       '#E8F0F4',          // texto principal claro
  muted:      '#8FA3B0',          // texto secundário
  border:     '#2A4055',
  cardBg:     '#152840',
  inputBg:    '#1A304A',
  divider:    '#2A4055',
  overlay:    'rgba(255,255,255,.08)',
  heroText:   '#A0D8E8',
  heroSub:    '#8FC8D8',
};

// ─── Compatibilidade: `colors` aponta para `light` ────────────────────────
// Telas que ainda não migraram para useTheme() continuam funcionando.
export const colors = light;

// ─── Shadow ───────────────────────────────────────────────────────────────
export const shadow = {
  shadowColor:  '#15384A',
  shadowOffset: { width: 0, height: 5 },
  shadowOpacity: 0.1,
  shadowRadius: 12,
  elevation:    4,
};

// Shadow adaptado para modo escuro (sombra mais sutil)
export const shadowDark = {
  shadowColor:  '#000000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.3,
  shadowRadius: 8,
  elevation:    3,
};
