// Cadastra um servidor de jogo. Uso: npm run servidor:criar -- <nome> <host> [porta]
import { obterBd } from '@/bd/conexao';
import { criarServidor } from '@/dominio/partidas';
import { carregarAmbiente } from './ambiente';

async function principal() {
  carregarAmbiente();
  const [nome, host, porta = '27015'] = process.argv.slice(2);
  if (!nome || !host) throw new Error('Informe o nome e o host: npm run servidor:criar -- <nome> <host> [porta]');
  const servidor = await criarServidor(obterBd(), { nome, host, porta: Number(porta) });
  console.log(`Servidor ${servidor.nome} pronto em ${servidor.host}:${servidor.porta}.`);
  process.exit(0);
}

principal().catch((erro) => {
  console.error(`Erro: ${erro.message}`);
  process.exit(1);
});
