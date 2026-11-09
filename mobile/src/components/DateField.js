import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Keyboard, Platform, Modal } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/useTheme';
const { lerData, dataLocal, dataBrasil, horaLocal } = require('../services/Datas.cjs');
export default function DateField({ label = 'Data', value, onChange, mode = 'date', allowClear = true, style }) {
  const { colors } = useTheme(); const [open, setOpen] = useState(false); const [draft, setDraft] = useState(new Date());
  const time = mode === 'time';
  const select = () => {
    Keyboard.dismiss();
    const initial = time ? new Date() : lerData(value) || new Date();
    if (time && /^\d{2}:\d{2}$/.test(value || '')) initial.setHours(Number(value.slice(0,2)), Number(value.slice(3,5)), 0, 0);
    if (Platform.OS === 'android') DateTimePickerAndroid.open({value: initial, mode, display: time ? 'clock' : 'calendar', is24Hour: true, onChange: (event, date) => { if (event.type === 'set' && date) onChange(time ? horaLocal(date) : dataLocal(date)); }});
    else { setDraft(initial); setOpen(true); }
  };
  const text = time ? value : dataBrasil(value);
  return <View style={[{flexShrink:1, minWidth:0, marginVertical:4},style]}>
    <Text style={{color:colors.text,fontSize:12,fontWeight:'700',marginBottom:6}}>{label}</Text>
    <View style={{flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:colors.border,borderRadius:12,backgroundColor:colors.surface}}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label}: ${text || 'não selecionada'}. Abrir ${time ? 'relógio' : 'calendário'}`} onPress={select} style={{flex:1,minHeight:50,padding:12,flexDirection:'row',gap:8,alignItems:'center'}}>
        <Ionicons name={time?'time-outline':'calendar-outline'} size={21} color={colors.primary}/><Text style={{color:text?colors.text:colors.muted,flexShrink:1}}>{text || (time?'Selecionar hora':'Selecionar data')}</Text>
      </TouchableOpacity>
      {!!value && allowClear && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Limpar ${label}`} onPress={()=>onChange('')} style={{padding:12}}><Ionicons name="close-circle-outline" size={21} color={colors.muted}/></TouchableOpacity>}
    </View>
    <Modal visible={open} transparent animationType="slide" onRequestClose={()=>setOpen(false)}><View style={{flex:1,justifyContent:'center',backgroundColor:'rgba(0,0,0,.5)',padding:20}}><View style={{padding:16,borderRadius:16,backgroundColor:colors.surface}}><Text style={{color:colors.text,fontWeight:'800'}}>{label}</Text><DateTimePicker value={draft} mode={mode} display="spinner" locale="pt-BR" is24Hour onChange={(_,date)=>date&&setDraft(date)}/><View style={{flexDirection:'row',justifyContent:'space-between'}}><TouchableOpacity onPress={()=>setOpen(false)} style={{padding:14}}><Text style={{color:colors.muted}}>Cancelar</Text></TouchableOpacity><TouchableOpacity onPress={()=>{onChange(time?horaLocal(draft):dataLocal(draft));setOpen(false);}} style={{padding:14}}><Text style={{color:colors.primary,fontWeight:'800'}}>Confirmar</Text></TouchableOpacity></View></View></View></Modal>
  </View>;
}
