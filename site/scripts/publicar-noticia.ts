// Publica uma notícia do clube a partir de um arquivo de texto: a primeira linha é o título, o resto é o texto.
// É o "patch de aviso" de cada atualização, e também a fila de notícias (publicar-proxima-noticia.sh). Roda na VPS,
// dentro de /opt/magnatas/site. Com --discord, avisa no canal de notícias, como a publicação pela tela da equipe.
// Uso: npm run noticia:publicar -- [--discord] caminho/do/arquivo.md
import { readFileSync } from 'node:fs';
import { obterBd } from '@/bd/conexao';
import { avisarNoDiscord, mensagemDaNoticia } from '@/dominio/discord';
import { criarNoticia, noticiaDoArquivo } from '@/dominio/noticias';
import { carregarAmbiente } from './ambiente';

async function principal() {
  carregarAmbiente();
  const argumentos = process.argv.slice(2);
  const comDiscord = argumentos.includes('--discord');
  const arquivo = argumentos.find((argumento) => !argumento.startsWith('--'));
  if (!arquivo) throw new Error('Informe o arquivo: npm run noticia:publicar -- [--discord] <arquivo>');
  const noticia = await criarNoticia(obterBd(), null, noticiaDoArquivo(readFileSync(arquivo, 'utf8')));
  console.log(`Notícia publicada: ${noticia.titulo}`);
  if (comDiscord) await avisarNoDiscord(process.env.DISCORD_WEBHOOK_NOTICIAS, mensagemDaNoticia(noticia, process.env.SITE_URL ?? 'http://localhost:3000'));
  process.exit(0);
}

principal().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
