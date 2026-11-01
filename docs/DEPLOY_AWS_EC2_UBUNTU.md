# Deploy AWS EC2 Ubuntu

Configuração atual de produção para a instância `13.58.212.142`:

- painel e API na mesma origem HTTPS: `13-58-212-142.nip.io`;
- Nginx nas portas 80/443;
- Node.js 22 em serviço `systemd`;
- PostgreSQL local acessível apenas pela instância;
- segredos gerados no servidor e gravados em `/opt/climasaas/.env`;
- migrações idempotentes executadas antes da inicialização.

## Security Group

Liberar entrada TCP 22 apenas para o IP administrativo e TCP 80/443 para `0.0.0.0/0` e `::/0`.
Não liberar as portas 3000 ou 5432 publicamente.

## Primeira instalação

```bash
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/DEV-Julio-Cesar/climatizacao.git
cd climatizacao
sudo bash scripts/deploy-ec2-ubuntu.sh
```

## Atualizações

```bash
cd /opt/climasaas
sudo bash scripts/deploy-ec2-ubuntu.sh
```

## Diagnóstico

```bash
sudo systemctl status climasaas --no-pager
sudo journalctl -u climasaas -n 100 --no-pager
curl https://13-58-212-142.nip.io/health/ready
```

O segredo do usuário PostgreSQL fica em `/root/.climasaas-db-password`. O `.env` e esse arquivo devem entrar no backup seguro, mas nunca no Git.
