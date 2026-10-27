/**
 * useTheme() — Retorna a paleta de cores ativa (light ou dark) e o shadow.
 *
 * Combina a preferência do usuário (AppContext) com as paletas de theme.js.
 * Use em telas migradas para modo escuro:
 *
 *   import { useTheme } from '../../styles/useTheme';
 *
 *   function MinhaTela() {
 *     const { colors, shadow, isDark } = useTheme();
 *     const styles = useMemo(() => StyleSheet.create({
 *       card: { backgroundColor: colors.surface, ... },
 *     }), [colors]);
 *     ...
 *   }
 *
 * IMPORTANTE: styles devem ser criados com useMemo([colors]) para que
 * sejam recalculados quando o tema mudar. StyleSheet.create fora do
 * componente é estático e não responde a mudanças de tema.
 */
import { useMemo } from 'react';
import { light, dark, shadow, shadowDark } from './theme';
import { useApp } from '../context/AppContext';

export function useTheme() {
  const { isDark } = useApp();

  return useMemo(() => ({
    colors: isDark ? dark : light,
    shadow: isDark ? shadowDark : shadow,
    isDark,
  }), [isDark]);
}
