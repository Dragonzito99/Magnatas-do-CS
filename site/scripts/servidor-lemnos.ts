// Cria a linha do servidor da Ilha Lemnos (desligado). Uso: npx tsx scripts/servidor-lemnos.ts
import { obterBd } from '@/bd/conexao';
import { garantirServidorDaLemnos } from '@/dominio/lemnos/servidor';
import { carregarAmbiente } from './ambiente';

async function principal() {
  carregarAmbiente();
  console.log(`Servidor da Ilha Lemnos: ${await garantirServidorDaLemnos(obterBd())}.`);
  process.exit(0);
}

principal().catch((erro) => {
  console.error(`Erro: ${erro.message}`);
  process.exit(1);
});
