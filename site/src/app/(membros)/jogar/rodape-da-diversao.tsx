import type { ServidorDiversao } from '@/bd/esquema';
import { alvoDoServidor, comandoDeConectar, entradaLiberada, estadoDoCartao, linkDeEntrar, MODOS_DE_DIVERSAO, type SituacaoDoServidor } from '@/dominio/diversao';
import type { EstadoNaTela } from '@/dominio/sob-demanda';
import { BotaoCopiar } from '../botao-copiar';
import { ligar } from '../diversao/acoes';
import { AvisarAoEntrar, BotaoLigar, EntrarQuandoLigar, EsperarEEntrar, TempoLigando } from '../diversao/esperar-e-entrar';

export const SEM_RESPOSTA: SituacaoDoServidor = { ligado: false, jogando: 0 };
/** Depois disso o aviso de falha some e o cartão volta só com o botão. */
const AVISO_DE_FALHA_MS = 2 * 60_000;

export const ERROS_DA_DIVERSAO: Record<string, string> = {
  limite: 'Todos os servidores estão cheios de gente agora. Tente de novo em alguns minutos.',
  indisponivel: 'Este modo não pode ser ligado agora.',
  celular: 'Pelo celular dá para ver tudo, mas o servidor só liga pelo PC, onde o CS2 roda.',
};

export function nomeDoModo(modo: ServidorDiversao['modo']) {
  return MODOS_DE_DIVERSAO.find((item) => item.valor === modo)?.nome;
}

export function RodapeDoCartao({
  servidor,
  situacao,
  guardado,
  modo,
  agora,
  celular = false,
}: {
  servidor: ServidorDiversao;
  situacao: SituacaoDoServidor;
  guardado: EstadoNaTela | undefined;
  modo: string | null;
  agora: number;
  /** Pelo celular o cartão mostra o estado, mas não o botão de ligar. */
  celular?: boolean;
}) {
  const estado = estadoDoCartao(servidor, situacao, guardado?.estado, guardado?.teste);
  if (estado === 'em_breve') return <span className="etiqueta">Em breve</span>;
  const etiquetaDoTeste = <span className="etiqueta">Teste do Adm: com bots, sem XP</span>;
  if (estado === 'em_teste' && !entradaLiberada(servidor, estado, situacao)) return etiquetaDoTeste;
  if (estado === 'fora_do_ar') return <span className="etiqueta">Fora do ar</span>;
  if (estado === 'ligando') {
    return (
      <>
        <span className="etiqueta">Ligando... cerca de 1 minuto</span>
        {guardado && <TempoLigando desde={guardado.desde.toISOString()} />}
        <EntrarQuandoLigar servidorId={servidor.id} />
      </>
    );
  }
  if (estado === 'trocando_mapa') return <span className="etiqueta">Trocando de mapa...</span>;
  if (estado === 'desligado_sob_demanda') {
    if (celular) return <span className="etiqueta">Ligue pelo PC</span>;
    const falhou = guardado?.erro && agora - guardado.desde.getTime() < AVISO_DE_FALHA_MS;
    return (
      <form action={ligar} className="ligar-servidor">
        {falhou && <span className="etiqueta falha">Não consegui ligar agora. Tente de novo em instantes.</span>}
        <input type="hidden" name="servidor" value={servidor.id} />
        {modo && <input type="hidden" name="modo" value={modo} />}
        <BotaoLigar servidorId={servidor.id} />
      </form>
    );
  }

  const vagas = (
    <span className="vagas-servidor">
      {situacao.jogando}/{servidor.vagas}
    </span>
  );
  if (estado === 'cheio') {
    return (
      <>
        {vagas}
        <span className="etiqueta">Servidor cheio</span>
      </>
    );
  }

  const alvo = alvoDoServidor(servidor, process.env.DIVERSAO_HOST);
  if (!alvo) return null;
  const senha = process.env.SERVIDOR_SENHA ?? '';
  const comando = comandoDeConectar(alvo, senha);
  const link = linkDeEntrar(alvo, senha);
  return (
    <>
      {vagas}
      {estado === 'em_teste' && etiquetaDoTeste}
      <AvisarAoEntrar servidorId={servidor.id}>
        {comando && <BotaoCopiar texto={comando} />}
        <a className="botao ouro pequeno" href={link}>
          Entrar
        </a>
      </AvisarAoEntrar>
      <EsperarEEntrar servidorId={servidor.id} link={link} />
    </>
  );
}

