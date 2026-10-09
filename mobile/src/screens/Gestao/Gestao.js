import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../../services/api';
import { colors, shadow } from '../../styles/theme';

const dinheiro = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export default function Gestao({ navigation }) {
  const [dados, setDados] = useState(null); const [refreshing, setRefreshing] = useState(false);
  const carregar = useCallback(async () => { try { setDados(await api.chamadaAutenticada('/financeiro/dashboard')); } catch (e) { Alert.alert('Gestão', e.message); } finally { setRefreshing(false); } }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  if (!dados) return <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  return <ScrollView style={s.page} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); carregar(); }} />}>
    <LinearGradient colors={[colors.primaryDark, colors.primary]} style={s.hero}><Text style={s.eyebrow}>VISÃO DO MÊS</Text><Text style={s.heroValue}>{dinheiro(dados.recebido)}</Text><Text style={s.heroLabel}>recebido até agora</Text><View style={s.heroRow}><View><Text style={s.heroSmall}>{dinheiro(dados.faturado)}</Text><Text style={s.heroCaption}>faturado</Text></View><View><Text style={s.heroSmall}>{dinheiro(Number(dados.faturado)-Number(dados.recebido))}</Text><Text style={s.heroCaption}>a receber</Text></View></View></LinearGradient>
    <View style={s.metrics}><Metric icon="checkmark-done" value={dados.finalizadas} label="Finalizadas" color={colors.success}/><Metric icon="receipt-outline" value={dados.total_os} label="Total de O.S." color={colors.primary}/><Metric icon="warning-outline" value={dados.estoque_baixo} label="Estoque baixo" color={colors.warning}/></View>
    <Text style={s.title}>Ferramentas de gestão</Text>
    <Menu icon="pricetags-outline" title="Catálogo e estoque" text="Serviços, peças, preços e entradas" onPress={() => navigation.navigate('Catalogo')} />
    <Menu icon="document-text-outline" title="Orçamentos" text="Criar, aprovar e converter em O.S." onPress={() => navigation.navigate('Orcamentos')} />
    <Menu icon="wallet-outline" title="Recebimentos" text="Registre PIX, dinheiro e cartão" onPress={() => navigation.navigate('Recebimentos')} />
    <Menu icon="repeat-outline" title="Contratos de manutenção" text="Planos recorrentes e visitas preventivas" onPress={() => navigation.navigate('Contratos')} />
    <Menu icon="calendar-outline" title="Agenda da equipe" text="Acompanhe todas as visitas do dia" onPress={() => navigation.navigate('AgendaEquipe')} />
    <Menu icon="people-outline" title="Equipe técnica" text="Cadastre técnicos e acessos ao aplicativo" onPress={() => navigation.navigate('Tecnicos')} />
    <Menu icon="bar-chart-outline" title="Relatórios gerenciais" text="Receita, produtividade e indicadores" onPress={() => navigation.navigate('Relatorios')} />
  </ScrollView>;
}
function Metric({icon,value,label,color}) { return <View style={s.metric}><Ionicons name={icon} size={20} color={color}/><Text style={s.metricValue}>{value}</Text><Text style={s.metricLabel}>{label}</Text></View>; }
function Menu({icon,title,text,onPress}) { return <TouchableOpacity style={s.menu} onPress={onPress}><View style={s.menuIcon}><Ionicons name={icon} size={23} color={colors.primary}/></View><View style={{flex:1}}><Text style={s.menuTitle}>{title}</Text><Text style={s.menuText}>{text}</Text></View><Ionicons name="chevron-forward" size={20} color={colors.muted}/></TouchableOpacity>; }
const s=StyleSheet.create({page:{flex:1,backgroundColor:colors.background},content:{padding:16,paddingBottom:36},center:{flex:1,alignItems:'center',justifyContent:'center'},hero:{padding:21,borderRadius:20,...shadow},eyebrow:{color:'#CDECF3',fontSize:11,fontWeight:'900',letterSpacing:1.2},heroValue:{color:'#fff',fontWeight:'900',fontSize:31,marginTop:5},heroLabel:{color:'#CDECF3'},heroRow:{flexDirection:'row',gap:42,marginTop:20,borderTopWidth:1,borderTopColor:'rgba(255,255,255,.18)',paddingTop:15},heroSmall:{color:'#fff',fontWeight:'800',fontSize:16},heroCaption:{color:'#CDECF3',fontSize:11},metrics:{flexDirection:'row',gap:8,marginVertical:15},metric:{flex:1,backgroundColor:'#fff',borderRadius:15,padding:12,borderWidth:1,borderColor:colors.border},metricValue:{fontSize:20,fontWeight:'900',color:colors.text,marginTop:7},metricLabel:{fontSize:10,color:colors.muted},title:{fontSize:18,fontWeight:'900',color:colors.text,marginVertical:10},menu:{backgroundColor:'#fff',padding:15,borderRadius:16,flexDirection:'row',alignItems:'center',gap:12,marginBottom:10,borderWidth:1,borderColor:colors.border},menuIcon:{width:44,height:44,borderRadius:14,backgroundColor:'#E7F5F8',alignItems:'center',justifyContent:'center'},menuTitle:{color:colors.text,fontWeight:'900'},menuText:{color:colors.muted,fontSize:12,marginTop:3}});
