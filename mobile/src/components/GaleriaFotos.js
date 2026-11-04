import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Modal,View,Text,Image,TouchableOpacity,StyleSheet,PanResponder,ActivityIndicator,SafeAreaView} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useScreenStyles} from '../styles/useScreenStyles';
const {distancia,limitar}=require('./galeriaTransform');

export default function GaleriaFotos({visible,fotos,initialIndex=0,onClose,onRefresh}) {
  const {styles:s,colors}=useScreenStyles(createStyles);
  const [index,setIndex]=useState(initialIndex),[transform,setTransform]=useState({scale:1,x:0,y:0}),[carregando,setCarregando]=useState(true),[erro,setErro]=useState(false),[atualizando,setAtualizando]=useState(false);
  const [tentativa,setTentativa]=useState(0);
  const atual=useRef({scale:1,x:0,y:0}),viewport=useRef({width:1,height:1}),imagem=useRef({width:0,height:0}),gesto=useRef({}),ultimoToque=useRef(0);
  const aplicar=valor=>{atual.current=limitar(valor,viewport.current,imagem.current);setTransform(atual.current);};
  const resetar=()=>{atual.current={scale:1,x:0,y:0};setTransform(atual.current);gesto.current={};ultimoToque.current=0;};
  useEffect(()=>{if(visible)setIndex(Math.max(0,Math.min(initialIndex,fotos.length-1)));},[visible,initialIndex]);
  useEffect(()=>{setIndex(i=>Math.max(0,Math.min(i,fotos.length-1)));},[fotos.length]);
  const foto=fotos[index];
  useEffect(()=>{resetar();imagem.current={width:0,height:0};setCarregando(true);setErro(false);},[visible,foto?.id,foto?.url]);
  const responder=useMemo(()=>PanResponder.create({
    onStartShouldSetPanResponder:()=>true,
    onMoveShouldSetPanResponder:()=>true,
    onPanResponderGrant:e=>{gesto.current={distance:distancia(e.nativeEvent.touches),x:e.nativeEvent.touches[0]?.pageX,y:e.nativeEvent.touches[0]?.pageY,moved:false};},
    onPanResponderMove:(e,state)=>{
      const touches=e.nativeEvent.touches;if(!touches.length)return;
      const anterior=gesto.current;
      if(touches.length>=2){
        const d=distancia(touches);
        if(anterior.distance>0)aplicar({...atual.current,scale:atual.current.scale*d/anterior.distance});
        gesto.current={distance:d,moved:true};
      }else{
        const t=touches[0];
        if(anterior.x!==undefined)aplicar({...atual.current,x:atual.current.x+t.pageX-anterior.x,y:atual.current.y+t.pageY-anterior.y});
        gesto.current={x:t.pageX,y:t.pageY,moved:anterior.moved||Math.abs(state.dx)+Math.abs(state.dy)>8};
      }
    },
    onPanResponderRelease:()=>{if(!gesto.current.moved){const agora=Date.now();if(agora-ultimoToque.current<300){aplicar({scale:atual.current.scale>1?1:2,x:0,y:0});ultimoToque.current=0;}else ultimoToque.current=agora;}gesto.current={};},
    onPanResponderTerminate:()=>{gesto.current={};},
  }),[]);
  const atualizar=async()=>{setAtualizando(true);try{await onRefresh?.();}catch{setErro(true);}finally{setTentativa(t=>t+1);setAtualizando(false);}};
  const botao=(icon,label,action,disabled=false)=><TouchableOpacity accessibilityRole="button" accessibilityLabel={label} style={s.button} onPress={action} disabled={disabled}><Ionicons name={icon} size={26} color={disabled?colors.muted:colors.text}/></TouchableOpacity>;
  return <Modal visible={visible} animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait','landscape']}>
    <SafeAreaView style={s.page}>
      <View style={s.toolbar}><Text style={s.title}>Foto {fotos.length?index+1:0} de {fotos.length}</Text>{botao('close','Fechar galeria',onClose)}</View>
      <View style={s.viewport} onLayout={e=>{viewport.current=e.nativeEvent.layout;resetar();}} {...responder.panHandlers}>
        {foto&&<Image key={`${foto.url}:${tentativa}`} accessible accessibilityLabel={foto.comentario||`Foto ${foto.tipo}`} source={{uri:foto.url}} resizeMode="contain" style={[s.image,{transform:[{translateX:transform.x},{translateY:transform.y},{scale:transform.scale}]}]}
          onLoadStart={()=>{setCarregando(true);setErro(false);}} onLoad={e=>{imagem.current=e.nativeEvent.source||{width:0,height:0};setCarregando(false);}} onError={()=>{setCarregando(false);setErro(true);}}/>}
        {carregando&&foto&&<ActivityIndicator style={s.loading} color={colors.primary}/>}
        {erro&&<View pointerEvents="none" style={s.error}><Text style={s.caption}>Não foi possível abrir a foto. Use “Recarregar” para renovar o link.</Text></View>}
      </View>
      <View style={s.controls}>
        {botao('chevron-back','Foto anterior',()=>setIndex(i=>i-1),index===0)}
        {botao('remove-circle-outline','Diminuir zoom',()=>aplicar({...atual.current,scale:atual.current.scale/1.5}),transform.scale===1)}
        <Text style={s.caption}>{Math.round(transform.scale*100)}%</Text>
        {botao('add-circle-outline','Aumentar zoom',()=>aplicar({...atual.current,scale:atual.current.scale*1.5}),transform.scale===5)}
        {botao('chevron-forward','Próxima foto',()=>setIndex(i=>i+1),index>=fotos.length-1)}
      </View>
      <Text numberOfLines={3} style={s.caption}>{foto?.comentario||foto?.tipo||'Sem foto disponível'}</Text>
      <Text style={s.help}>Use dois dedos para ampliar e arraste para explorar. Dois toques ajustam o zoom.</Text>
      <View style={s.controls}><TouchableOpacity style={s.textButton} onPress={resetar}><Text style={s.link}>Ajustar imagem</Text></TouchableOpacity><TouchableOpacity style={s.textButton} disabled={atualizando} onPress={atualizar}><Text style={s.link}>{atualizando?'Atualizando...':'Recarregar'}</Text></TouchableOpacity></View>
    </SafeAreaView>
  </Modal>;
}
const createStyles=(colors)=>StyleSheet.create({page:{flex:1,backgroundColor:colors.background},toolbar:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16},title:{color:colors.text,fontSize:18,fontWeight:'800'},viewport:{flex:1,overflow:'hidden',backgroundColor:colors.background},image:{width:'100%',height:'100%'},button:{padding:12},controls:{flexDirection:'row',justifyContent:'center',alignItems:'center'},caption:{color:colors.text,textAlign:'center',paddingHorizontal:16},help:{color:colors.muted,textAlign:'center',fontSize:12,paddingHorizontal:16,marginTop:8},textButton:{padding:14},link:{color:colors.primary,fontWeight:'700'},loading:{position:'absolute',left:0,right:0,top:'45%'},error:{position:'absolute',left:0,right:0,top:'45%',backgroundColor:colors.surface,paddingVertical:16}});
