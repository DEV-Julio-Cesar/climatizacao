import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AppContext = createContext(null);
const STORAGE_KEY = '@climasaas/preferencias';

/**
 * Valores padrão das preferências.
 * `tema` aceita: 'sistema' | 'claro' | 'escuro'
 *   - 'sistema' segue useColorScheme() do aparelho
 *   - 'claro' / 'escuro' força o tema independente do sistema
 */
const PADROES = {
  notificacoes: true,
  vibracao: true,
  tema: 'sistema',
};

export function AppProvider({ children }) {
  const [preferencias, setPreferencias] = useState(PADROES);
  const [carregandoPreferencias, setCarregandoPreferencias] = useState(true);
  const sistemaEscuro = useColorScheme() === 'dark';

  // Carrega preferências persistidas
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

  // Resolve o tema efetivo: se 'sistema', segue o aparelho; senão usa a escolha
  const temaEfetivo = preferencias.tema === 'sistema'
    ? (sistemaEscuro ? 'escuro' : 'claro')
    : preferencias.tema;

  const value = useMemo(
    () => ({
      preferencias,
      atualizarPreferencia,
      carregandoPreferencias,
      temaEfetivo,        // 'claro' | 'escuro' — já resolvido
      isDark: temaEfetivo === 'escuro',
    }),
    [preferencias, carregandoPreferencias, temaEfetivo],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp deve ser usado dentro de AppProvider');
  return context;
}
