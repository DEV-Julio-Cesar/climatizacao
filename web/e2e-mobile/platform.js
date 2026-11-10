import { useEffect, useMemo } from 'react';
import { light, dark } from '../../mobile/src/styles/theme.js';
// Somente o ciclo de montagem/desmontagem é simulado; não representa foco de
// navegação, teclado, Keystore ou arquivos de um aparelho Android/iOS.
export const useFocusEffect = callback => useEffect(callback,[callback]);
export const randomUUID = () => crypto.randomUUID();
export function useScreenStyles(factory) {
  const colors = new URLSearchParams(location.search).get('tema')==='escuro'?dark:light;
  return { colors,styles:useMemo(()=>factory(colors,{}),[factory,colors]) };
}
