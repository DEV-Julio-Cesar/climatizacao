import { useMemo } from 'react';
import { useTheme } from './useTheme';
export function useScreenStyles(factory) {
  const tema = useTheme();
  const styles = useMemo(() => factory(tema.colors, tema.shadow), [factory, tema.colors, tema.shadow]);
  return { ...tema, styles };
}
