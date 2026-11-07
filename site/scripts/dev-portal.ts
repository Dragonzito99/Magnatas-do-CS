// Só para desenvolvimento: enche a tela principal com as amostras gravadas (Steam e Liquipedia) e uma notícia,
// sem chamar a Liquipedia nem a Anthropic. Uso: npx tsx scripts/dev-portal.ts
import { readFileSync } from 'node:fs';
import { obterBd } from '@/bd/conexao';
import { cacheExterno } from '@/bd/esquema';
import { criarNoticia } from '@/dominio/noticias';
import { atualizarNoticiasSteam } from '@/dominio/noticias-steam';
import { atualizarTierS } from '@/dominio/tier-s';
import { carregarAmbiente, exigirBancoLocal } from './ambiente';

const amostra = (nome: string) => JSON.parse(readFileSync(`src/dominio/exemplos/${nome}`, 'utf8'));

async function principal() {
  carregarAmbiente();
  exigirBancoLocal();
  const bd = obterBd();
  // A data das amostras: o IEM Beijing está em andamento em 07/11/2026.
  const agora = new Date('2026-11-07T15:00:00Z');
  await bd.delete(cacheExterno);
  await atualizarNoticiasSteam(bd, async () => amostra('steam-noticias.json'), async ({ titulo }) => ({
    titulo: `${titulo} (tradução de exemplo)`,
    resumo: 'Resumo de exemplo: aqui entra o resumo em português feito pela IA.',
  }), agora);
  const paginas: Record<string, unknown> = {
    'S-Tier_Tournaments': amostra('liquipedia-s-tier.json'),
    'Liquipedia:Matches': amostra('liquipedia-matches.json'),
  };
  await atualizarTierS(bd, async (parametros) => paginas[parametros.page], agora);
  await criarNoticia(bd, null, {
    titulo: 'Novidades: aceite de partida, vetos e tela principal',
    texto: 'Agora toda partida pede o aceite dos 10 em 30 segundos.\n\nOs líderes vetam os mapas depois de um cara ou coroa.',
  });
  console.log('Tela principal preenchida com as amostras.');
  process.exit(0);
}

principal().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
