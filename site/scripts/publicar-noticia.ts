// Publica uma notícia do clube a partir de um arquivo de texto: a primeira linha é o título, o resto é o texto.
// É o "patch de aviso" de cada atualização. Roda na VPS, dentro de /opt/magnatas/site.
// Uso: npm run noticia:publicar -- caminho/do/arquivo.md
import { readFileSync } from 'node:fs';
import { obterBd } from '@/bd/conexao';
import { criarNoticia } from '@/dominio/noticias';
import { carregarAmbiente } from './ambiente';

async function principal() {
  carregarAmbiente();
  const arquivo = process.argv[2];
  if (!arquivo) throw new Error('Informe o arquivo: npm run noticia:publicar -- <arquivo>');
  const [primeira, ...resto] = readFileSync(arquivo, 'utf8').split(/\r?\n/);
  const titulo = primeira.replace(/^#+\s*/, '');
  const noticia = await criarNoticia(obterBd(), null, { titulo, texto: resto.join('\n') });
  console.log(`Notícia publicada: ${noticia.titulo}`);
  process.exit(0);
}

principal().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
