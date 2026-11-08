import type { ServidorDiversao } from '@/bd/esquema';
import { alvoDoServidor, comandoDeConectar, estadoDoCartao, linkDeEntrar, MODOS_DE_DIVERSAO, type SituacaoDoServidor } from '@/dominio/diversao';
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
}: {
  servidor: ServidorDiversao;
  situacao: SituacaoDoServidor;
  guardado: EstadoNaTela | undefined;
  modo: string | null;
  agora: number;
}) {
  const estado = estadoDoCartao(servidor, situacao, guardado?.estado, guardado?.teste);
  if (estado === 'em_breve') return <span className="etiqueta">Em breve</span>;
  if (estado === 'em_teste') return <span className="etiqueta">Em teste pelo Adm</span>;
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

