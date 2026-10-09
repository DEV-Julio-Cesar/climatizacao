import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, Text } from 'react-native';
import * as Network from 'expo-network';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { colors } from './src/styles/theme';
import LoginScreen from './src/screens/Login/LoginScreen';
import AgendaMapa from './src/screens/Agenda/AgendaMapa';
import MapaAtendimento from './src/screens/Agenda/MapaAtendimento';
import MapaRota from './src/screens/Agenda/MapaRota';
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
import { AppProvider } from './src/context/AppContext';
import PerfilScreen from './src/screens/Perfil/PerfilScreen';
import Sincronizacao from './src/screens/Perfil/Sincronizacao';
import ErrorBoundary from './src/components/ErrorBoundary';
import { configurarSessaoExpirada } from './src/services/api';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const tabIcons = { AgendaTab: 'calendar-outline', ClientesTab: 'people-outline', GestaoTab: 'stats-chart-outline', PerfilTab: 'person-circle-outline' };

function AbasPrincipais({ onLogout, usuario }) {
  const pode = (permissao) => usuario?.permissoes?.includes('*') || usuario?.permissoes?.includes(permissao) || !Array.isArray(usuario?.permissoes);
  return <Tab.Navigator screenOptions={({ route }) => ({
    headerStyle: { backgroundColor: colors.navy }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '800' },
    tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.muted,
    tabBarStyle: { height: 64, paddingTop: 6, paddingBottom: 8 },
    tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
    tabBarIcon: ({ color, size }) => <Ionicons name={tabIcons[route.name]} size={size} color={color} />,
  })}>
    <Tab.Screen name="AgendaTab" options={{ title: 'Agenda', headerTitle: 'Minha agenda' }}>{(props) => <AgendaMapa {...props} onLogout={onLogout} />}</Tab.Screen>
    {pode('CLIENTES_VISUALIZAR') && <Tab.Screen name="ClientesTab" component={Clientes} options={{ title: 'Clientes', headerTitle: 'Clientes e equipamentos' }} />}
    {pode('GESTAO_VISUALIZAR') && <Tab.Screen name="GestaoTab" component={Gestao} options={{ title: 'Gestão', headerTitle: 'Gestão do negócio' }} />}
    <Tab.Screen name="PerfilTab" options={{ title: 'Perfil', headerTitle: 'Perfil e dispositivo' }}>{(props) => <PerfilScreen {...props} onLogout={onLogout} />}</Tab.Screen>
  </Tab.Navigator>;
}

export default function App() {
  const [token, setToken] = useState(undefined);
  const [usuario, setUsuario] = useState(null);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    Promise.all([SecureStore.getItemAsync('climasaas_token'), SecureStore.getItemAsync('climasaas_usuario'), initDB()])
      .then(([saved, usuarioSalvo]) => { setUsuario(usuarioSalvo ? JSON.parse(usuarioSalvo) : null); setToken(saved || null); })
      .catch(() => setToken(null));
    configurarSessaoExpirada(() => { setUsuario(null); setToken(null); });
    const subscription = Network.addNetworkStateListener((state) => setOnline(Boolean(state.isConnected) && state.isInternetReachable !== false));
    return () => { subscription.remove(); configurarSessaoExpirada(null); };
  }, []);
  if (token === undefined) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  return (
    <ErrorBoundary><AppProvider><View style={{ flex:1 }}><NavigationContainer>
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
            {(props) => <LoginScreen {...props} onLogin={(novoToken, novoUsuario) => { setUsuario(novoUsuario); setToken(novoToken); }} />}
          </Stack.Screen>
        ) : (
          <>
            <Stack.Screen name="Inicio" options={{ headerShown: false }}>
              {(props) => <AbasPrincipais {...props} usuario={usuario} onLogout={() => { setUsuario(null); setToken(null); }} />}
            </Stack.Screen>
            <Stack.Screen name="NovaOS" component={Checklist} options={{ title: 'Nova ordem de serviço' }} />
            <Stack.Screen name="DetalhesOS" component={DetalhesOS} options={{ title: 'Detalhes da visita' }} />
            <Stack.Screen name="MapaAtendimento" component={MapaAtendimento} options={{ title: 'Mapa do atendimento' }} />
            <Stack.Screen name="MapaRota" component={MapaRota} options={{ title: 'Rota do dia' }} />
            <Stack.Screen name="Sincronizacao" component={Sincronizacao} options={{ title: 'Sincronização offline' }} />
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
    </NavigationContainer>{!online && <View style={{ position:'absolute',left:0,right:0,bottom:0,backgroundColor:'#A86600',padding:7 }}><Text style={{ color:'#fff',fontWeight:'800',textAlign:'center',fontSize:12 }}>Sem internet · alterações serão sincronizadas quando possível</Text></View>}</View></AppProvider></ErrorBoundary>
  );
}
