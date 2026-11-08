import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import { LIMITES_DA_NOTICIA, noticiaPorId, ultimasNoticias, type NoticiaComAutor } from '@/dominio/noticias';
import { BotaoConfirmar } from '../../botao-confirmar';
import { apagar, publicar, salvar } from './acoes';
import { TelaDoPainel } from '../../painel/lateral-do-painel';

const ERROS: Record<string, string> = {
  invalida: `A notícia precisa de título (até ${LIMITES_DA_NOTICIA.titulo} caracteres) e texto (até ${LIMITES_DA_NOTICIA.texto}). A imagem, se tiver, é um caminho do próprio site, como /mapas/luxville.webp.`,
};
const AVISOS: Record<string, string> = {
  publicada: 'Notícia publicada na tela principal.',
  salva: 'Notícia salva.',
  apagada: 'Notícia apagada.',
};
const dataCurta = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

function Formulario({ noticia }: { noticia?: NoticiaComAutor | null }) {
  return (
    <form action={noticia ? salvar : publicar} className="formulario formulario-noticia">
      {noticia && <input type="hidden" name="id" value={noticia.id} />}
      <label htmlFor="titulo">Título</label>
      <input id="titulo" name="titulo" required maxLength={LIMITES_DA_NOTICIA.titulo} defaultValue={noticia?.titulo} />
      <label htmlFor="texto">Texto</label>
      <textarea
        id="texto"
        name="texto"
        required
        maxLength={LIMITES_DA_NOTICIA.texto}
        rows={8}
        defaultValue={noticia?.texto}
        placeholder="Separe os parágrafos com uma linha em branco."
      />
      <label htmlFor="imagem">Imagem (opcional)</label>
      <input id="imagem" name="imagem" placeholder="/mapas/luxville.webp" defaultValue={noticia?.imagem ?? ''} />
      <label className="caixa">
        <input type="checkbox" name="fixada" defaultChecked={noticia?.fixada} /> Fixar no topo
      </label>
      <div className="acoes">
        <button type="submit" className="botao ouro pequeno">
          {noticia ? 'Salvar' : 'Publicar'}
        </button>
        {noticia && (
          <Link href="/equipe/noticias" className="botao cinza pequeno">
            Cancelar
          </Link>
        )}
      </div>
    </form>
  );
}

export default async function NoticiasDaEquipe({ searchParams }: { searchParams: Promise<{ erro?: string; aviso?: string; editar?: string }> }) {
  const usuario = await exigirAcesso('/equipe/noticias');
  if (!pode(usuario, 'publicar_noticia')) redirect('/inicio');
  const { erro, aviso, editar } = await searchParams;
  const bd = obterBd();
  // Um link de edição quebrado só abre o formulário de notícia nova.
  const idParaEditar = editar && z.uuid().safeParse(editar).success ? editar : null;
  const [lista, emEdicao] = await Promise.all([ultimasNoticias(bd, 50), idParaEditar ? noticiaPorId(bd, idParaEditar) : null]);

  return (
    <TelaDoPainel
      usuario={usuario}
      atual="noticias"
      titulo="Notícias do clube"
      extra={
        <Link href="/inicio" className="botao cinza pequeno">
          Ver a tela principal
        </Link>
      }
    >
      {erro && ERROS[erro] && (
        <p role="alert" className="aviso">
          {ERROS[erro]}
        </p>
      )}
      {aviso && AVISOS[aviso] && <p className="aviso">{AVISOS[aviso]}</p>}
      <div className="grade">
        <section className="painel">
          <div className="cabeca-painel">
            <h2>Publicadas</h2>
            <span>{lista.length}</span>
          </div>
          {lista.length === 0 && <p className="vazio">Nenhuma notícia ainda.</p>}
          {lista.map((noticia) => (
            <div className="linha" key={noticia.id}>
              <div>
                <b>
                  {noticia.fixada && '📌 '}
                  <Link href={`/noticias/${noticia.id}`}>{noticia.titulo}</Link>
                </b>
                <small>
                  {noticia.autorApelido}, {dataCurta.format(noticia.criadoEm)}
                </small>
              </div>
              <div className="acoes">
                <Link href={`/equipe/noticias?editar=${noticia.id}`} className="botao cinza pequeno">
                  Editar
                </Link>
                <form action={apagar}>
                  <input type="hidden" name="id" value={noticia.id} />
                  <BotaoConfirmar mensagem={`Apagar "${noticia.titulo}"? Não dá para desfazer.`} className="botao contorno pequeno">
                    Apagar
                  </BotaoConfirmar>
                </form>
              </div>
            </div>
          ))}
        </section>
        <section className="painel">
          <div className="cabeca-painel">
            <h2>{emEdicao ? 'Editar notícia' : 'Nova notícia'}</h2>
          </div>
          <Formulario key={emEdicao?.id ?? 'nova'} noticia={emEdicao} />
        </section>
      </div>
    </TelaDoPainel>
  );
}
