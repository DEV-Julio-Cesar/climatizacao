export * from 'react-native-web';
export const Alert = { alert(title,message,buttons) {
  if(buttons?.length){if(confirm(`${title}\n${message}`))buttons[buttons.length-1].onPress?.();}
  else alert(`${title}\n${message}`);
} };
