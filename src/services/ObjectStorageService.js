const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

let client;
function configurado() { return Boolean(process.env.OBJECT_STORAGE_BUCKET); }
function obterCliente() {
  if (!client) client = new S3Client({
    region:process.env.OBJECT_STORAGE_REGION || 'auto',
    endpoint:process.env.OBJECT_STORAGE_ENDPOINT || undefined,
    forcePathStyle:process.env.OBJECT_STORAGE_FORCE_PATH_STYLE === 'true',
    credentials:process.env.OBJECT_STORAGE_ACCESS_KEY_ID ? {
      accessKeyId:process.env.OBJECT_STORAGE_ACCESS_KEY_ID,
      secretAccessKey:process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
    } : undefined,
  });
  return client;
}
async function salvar(chave, conteudo, mimeType) {
  if (!configurado()) return false;
  await obterCliente().send(new PutObjectCommand({ Bucket:process.env.OBJECT_STORAGE_BUCKET, Key:chave, Body:conteudo, ContentType:mimeType }));
  return true;
}
async function ler(chave) {
  if (!configurado()) return null;
  const resposta = await obterCliente().send(new GetObjectCommand({ Bucket:process.env.OBJECT_STORAGE_BUCKET, Key:chave }));
  return Buffer.from(await resposta.Body.transformToByteArray());
}
async function remover(chave) {
  if (configurado()) await obterCliente().send(new DeleteObjectCommand({ Bucket:process.env.OBJECT_STORAGE_BUCKET, Key:chave }));
}
module.exports = { configurado, salvar, ler, remover };
