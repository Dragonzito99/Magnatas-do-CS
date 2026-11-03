// Cria ou promove a conta do dono a Adm. Uso: npm run adm:criar -- <steamid64>
import { obterBd } from '@/bd/conexao';
import { criarOuPromoverAdm } from '@/dominio/equipe';
import { carregarAmbiente } from './ambiente';

async function principal() {
  carregarAmbiente();
  const steamid64 = process.argv[2];
  if (!steamid64) throw new Error('Informe o SteamID64: npm run adm:criar -- <steamid64>');
  const conta = await criarOuPromoverAdm(obterBd(), steamid64);
  console.log(`Conta pronta como Adm, no estado ${conta.estado}.`);
  process.exit(0);
}

principal().catch((erro) => {
  console.error(`Erro: ${erro.message}`);
  process.exit(1);
});
