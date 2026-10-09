import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AppContext = createContext(null);
const STORAGE_KEY = '@climasaas/preferencias';

export function AppProvider({ children }) {
  const [preferencias, setPreferencias] = useState({ notificacoes: true, vibracao: true });
  const [carregandoPreferencias, setCarregandoPreferencias] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => value && setPreferencias((current) => ({ ...current, ...JSON.parse(value) })))
      .finally(() => setCarregandoPreferencias(false));
  }, []);

  const atualizarPreferencia = async (chave, valor) => {
    const novas = { ...preferencias, [chave]: valor };
    setPreferencias(novas);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(novas));
  };

  const value = useMemo(() => ({ preferencias, atualizarPreferencia, carregandoPreferencias }), [preferencias, carregandoPreferencias]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp deve ser usado dentro de AppProvider');
  return context;
}
