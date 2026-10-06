import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { colors } from './src/styles/theme';
import LoginScreen from './src/screens/Login/LoginScreen';
import AgendaMapa from './src/screens/Agenda/AgendaMapa';
import Checklist from './src/screens/OS/Checklist';
import CameraOS from './src/screens/OS/CameraOS';
import AssinaturaOS from './src/screens/OS/AssinaturaOS';
import Finalizadas from './src/screens/OS/Finalizadas';
import DetalhesOS from './src/screens/OS/DetalhesOS';
import ExecucaoOS from './src/screens/OS/ExecucaoOS';
import Clientes from './src/screens/Cadastros/Clientes';
import ClienteForm from './src/screens/Cadastros/ClienteForm';
import EquipamentoForm from './src/screens/Cadastros/EquipamentoForm';
import EquipamentoDetalhe from './src/screens/Cadastros/EquipamentoDetalhe';
import LeitorQR from './src/screens/Cadastros/LeitorQR';
import Gestao from './src/screens/Gestao/Gestao';
import Catalogo from './src/screens/Gestao/Catalogo';
import Orcamentos from './src/screens/Gestao/Orcamentos';
import OrcamentoForm from './src/screens/Gestao/OrcamentoForm';
import OrcamentoDetalhe from './src/screens/Gestao/OrcamentoDetalhe';
import Recebimentos from './src/screens/Gestao/Recebimentos';
import Contratos from './src/screens/Gestao/Contratos';
import Relatorios from './src/screens/Gestao/Relatorios';
import Notificacoes from './src/screens/Gestao/Notificacoes';
import AgendaEquipe from './src/screens/Gestao/AgendaEquipe';
import { initDB } from './src/database/sqlite';

const Stack = createNativeStackNavigator();

export default function App() {
  const [token, setToken] = useState(undefined);
  useEffect(() => {
    Promise.all([SecureStore.getItemAsync('climasaas_token'), initDB()])
      .then(([saved]) => setToken(saved || null))
      .catch(() => setToken(null));
  }, []);
  if (token === undefined) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator screenOptions={{
        headerTintColor: colors.surface,
        headerStyle: { backgroundColor: colors.navy },
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}>
        {!token ? (
          <Stack.Screen name="Login" options={{ headerShown: false }}>
            {(props) => <LoginScreen {...props} onLogin={setToken} />}
          </Stack.Screen>
        ) : (
          <>
            <Stack.Screen name="Agenda" options={{ title: 'Minha agenda' }}>
              {(props) => <AgendaMapa {...props} onLogout={() => setToken(null)} />}
            </Stack.Screen>
            <Stack.Screen name="NovaOS" component={Checklist} options={{ title: 'Nova ordem de serviço' }} />
            <Stack.Screen name="DetalhesOS" component={DetalhesOS} options={{ title: 'Detalhes da visita' }} />
            <Stack.Screen name="CameraOS" component={CameraOS} options={{ title: 'Registro fotográfico' }} />
            <Stack.Screen name="ExecucaoOS" component={ExecucaoOS} options={{ title: 'Relatório técnico' }} />
            <Stack.Screen name="AssinaturaOS" component={AssinaturaOS} options={{ title: 'Assinatura' }} />
            <Stack.Screen name="Finalizadas" component={Finalizadas} options={{ title: 'O.S. finalizadas' }} />
            <Stack.Screen name="Clientes" component={Clientes} options={{ title: 'Clientes e equipamentos' }} />
            <Stack.Screen name="ClienteForm" component={ClienteForm} options={{ title: 'Cadastro de cliente' }} />
            <Stack.Screen name="EquipamentoForm" component={EquipamentoForm} options={{ title: 'Cadastro de equipamento' }} />
            <Stack.Screen name="EquipamentoDetalhe" component={EquipamentoDetalhe} options={{ title: 'Ficha do equipamento' }} />
            <Stack.Screen name="LeitorQR" component={LeitorQR} options={{ title: 'Ler QR Code' }} />
            <Stack.Screen name="Gestao" component={Gestao} options={{ title: 'Gestão do negócio' }} />
            <Stack.Screen name="Catalogo" component={Catalogo} options={{ title: 'Catálogo e estoque' }} />
            <Stack.Screen name="Orcamentos" component={Orcamentos} options={{ title: 'Orçamentos' }} />
            <Stack.Screen name="OrcamentoForm" component={OrcamentoForm} options={{ title: 'Novo orçamento' }} />
            <Stack.Screen name="OrcamentoDetalhe" component={OrcamentoDetalhe} options={{ title: 'Detalhes do orçamento' }} />
            <Stack.Screen name="Recebimentos" component={Recebimentos} options={{ title: 'Recebimentos' }} />
            <Stack.Screen name="Contratos" component={Contratos} options={{ title: 'Contratos de manutenção' }} />
            <Stack.Screen name="Relatorios" component={Relatorios} options={{ title: 'Relatórios gerenciais' }} />
            <Stack.Screen name="Notificacoes" component={Notificacoes} options={{ title: 'Notificações' }} />
            <Stack.Screen name="AgendaEquipe" component={AgendaEquipe} options={{ title: 'Agenda da equipe' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
