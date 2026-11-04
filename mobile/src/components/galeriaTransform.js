function distancia(touches) {
  if (touches.length < 2) return 0;
  return Math.hypot(touches[0].pageX-touches[1].pageX,touches[0].pageY-touches[1].pageY);
}
function limitar(transform, viewport, imagem) {
  const scale=Math.max(1,Math.min(5,Number.isFinite(transform.scale)?transform.scale:1));
  const ajuste=imagem.width&&imagem.height?Math.min(viewport.width/imagem.width,viewport.height/imagem.height):1;
  const largura=imagem.width?imagem.width*ajuste:viewport.width;
  const altura=imagem.height?imagem.height*ajuste:viewport.height;
  const maxX=Math.max(0,(largura*scale-viewport.width)/2),maxY=Math.max(0,(altura*scale-viewport.height)/2);
  const x=Number.isFinite(transform.x)?transform.x:0,y=Number.isFinite(transform.y)?transform.y:0;
  return {scale,x:Math.max(-maxX,Math.min(maxX,x)),y:Math.max(-maxY,Math.min(maxY,y))};
}
module.exports={distancia,limitar};
