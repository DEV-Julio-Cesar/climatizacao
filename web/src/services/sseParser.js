export function criarParser(receber){
  let buffer='';
  return chunk=>{
    buffer+=chunk;
    if(buffer.length>131072)throw new Error('Evento excede o limite.');
    let separador;
    while((separador=/\r?\n\r?\n/.exec(buffer))){
      const bloco=buffer.slice(0,separador.index);buffer=buffer.slice(separador.index+separador[0].length);
      const linhas=bloco.split(/\r?\n/),evento=linhas.find(l=>l.startsWith('event:'))?.slice(6).trim()||'message';
      const dados=linhas.filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
      if(dados)receber({evento,dados});
    }
  };
}
