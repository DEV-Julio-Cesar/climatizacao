const estados={acre:'AC',alagoas:'AL',amapa:'AP',amazonas:'AM',bahia:'BA',ceara:'CE','distrito federal':'DF','espirito santo':'ES',goias:'GO',maranhao:'MA','mato grosso':'MT','mato grosso do sul':'MS','minas gerais':'MG',para:'PA',paraiba:'PB',parana:'PR',pernambuco:'PE',piaui:'PI','rio de janeiro':'RJ','rio grande do norte':'RN','rio grande do sul':'RS',rondonia:'RO',roraima:'RR','santa catarina':'SC','sao paulo':'SP',sergipe:'SE',tocantins:'TO'};
function uf(region){const n=String(region||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return estados[n]||(Object.values(estados).includes(n.toUpperCase())?n.toUpperCase():'');}
function enderecoGps(address={},coords){
 if(!coords||!Number.isFinite(coords.latitude)||!Number.isFinite(coords.longitude)||Math.abs(coords.latitude)>90||Math.abs(coords.longitude)>180)throw new Error('Coordenadas GPS invalidas.');
 const brasil=!address.isoCountryCode||String(address.isoCountryCode).toUpperCase()==='BR';
 const dados={latitude:coords.latitude,longitude:coords.longitude};
 const campos={endereco:address.street,numero:address.streetNumber,bairro:address.district,cidade:address.city||address.subregion,estado:brasil?uf(address.region):'',cep:brasil?String(address.postalCode||'').replace(/\D/g,''):''};
 for(const [k,v]of Object.entries(campos))if(v&&String(v).trim()&&(k!=='cep'||v.length===8))dados[k]=String(v).trim();
 return dados;
}
module.exports={enderecoGps,uf};
