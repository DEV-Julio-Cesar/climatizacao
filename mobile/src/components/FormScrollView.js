import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
export default function FormScrollView({ children, style, ...props }) {
  return <KeyboardAvoidingView style={[{flex:1},style]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView {...props} style={{flex:1}} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>{children}</ScrollView>
  </KeyboardAvoidingView>;
}
