import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../styles/theme';

export default class ErrorBoundary extends React.Component {
  state = { erro:false };
  static getDerivedStateFromError() { return { erro:true }; }
  componentDidCatch(error) { console.error('Falha inesperada no aplicativo:', error); }
  render() {
    if (!this.state.erro) return this.props.children;
    return <View style={styles.container}><Text style={styles.title}>O aplicativo encontrou um problema</Text><Text style={styles.text}>Seus dados salvos não foram apagados. Tente recarregar esta área.</Text><TouchableOpacity style={styles.button} onPress={()=>this.setState({erro:false})}><Text style={styles.buttonText}>Tentar novamente</Text></TouchableOpacity></View>;
  }
}
const styles=StyleSheet.create({container:{flex:1,alignItems:'center',justifyContent:'center',padding:30,backgroundColor:colors.background},title:{fontSize:20,fontWeight:'900',color:colors.text,textAlign:'center'},text:{color:colors.muted,textAlign:'center',marginTop:8,lineHeight:20},button:{marginTop:20,backgroundColor:colors.primary,paddingHorizontal:20,paddingVertical:14,borderRadius:13},buttonText:{color:'#fff',fontWeight:'800'}});
