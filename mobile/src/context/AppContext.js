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
      .then((value) => {
        if(!value)return;
        const salvas=JSON.parse(value);
        setPreferencias({
          notificacoes:typeof salvas?.notificacoes==='boolean'?salvas.notificacoes:PADROES.notificacoes,
          vibracao:typeof salvas?.vibracao==='boolean'?salvas.vibracao:PADROES.vibracao,
          tema:['sistema','claro','escuro'].includes(salvas?.tema)?salvas.tema:PADROES.tema,
        });
      })
      .catch(() => {})
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
