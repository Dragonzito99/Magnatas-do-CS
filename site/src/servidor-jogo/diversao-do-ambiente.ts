import type { ServidorDiversao } from '@/bd/esquema';
import { alvoDoServidor, perguntarAoServidor, situacaoDoServidor, type SituacaoDoServidor } from '@/dominio/diversao';
import type { ControleDaDiversao } from '@/dominio/sob-demanda';
import { controleReal } from './controle-da-diversao';
import type { ControladorServidor } from './controlador';

const TEMPO_PARA_SUBIR_NO_FALSO_MS = 5_000;

export type DiversaoDoAmbiente = {
  controle: ControleDaDiversao;
  /** Resposta de agora, para a varredura. */
  perguntar(servidor: ServidorDiversao): Promise<SituacaoDoServidor>;
  /** Resposta guardada por alguns segundos, para a página. */
  situacaoDaTela(servidor: ServidorDiversao): Promise<SituacaoDoServidor>;
};

type Ambiente = { NODE_ENV?: string; DIVERSAO_CONTROLE?: string; DIVERSAO_HOST?: string };

/** Fica no globalThis: a varredura e as páginas veem os mesmos servidores falsos em desenvolvimento. */
const ligadosNoFalso: Map<string, number> = ((globalThis as { __diversaoFalsa?: Map<string, number> }).__diversaoFalsa ??= new Map());

function diversaoFalsa(relogio: () => number): DiversaoDoAmbiente {
  const perguntar = async (servidor: ServidorDiversao): Promise<SituacaoDoServidor> => {
    const sobeEm = servidor.nomeNoServidor ? ligadosNoFalso.get(servidor.nomeNoServidor) : undefined;
    return sobeEm !== undefined && relogio() >= sobeEm ? { ligado: true, jogando: 0 } : { ligado: false, jogando: 0 };
  };
  return {
    controle: {
      async ligar(nome) {
        if (!ligadosNoFalso.has(nome)) ligadosNoFalso.set(nome, relogio() + TEMPO_PARA_SUBIR_NO_FALSO_MS);
      },
      async desligar(nome) {
        ligadosNoFalso.delete(nome);
      },
    },
    perguntar,
    situacaoDaTela: perguntar,
  };
}

/** Em produção, sempre o controle de verdade. DIVERSAO_CONTROLE=falso só vale em desenvolvimento, sem servidores de jogo. */
export function diversaoDoAmbiente(controlador: ControladorServidor, ambiente: Ambiente = process.env, relogio: () => number = Date.now): DiversaoDoAmbiente {
  if (ambiente.NODE_ENV !== 'production' && ambiente.DIVERSAO_CONTROLE === 'falso') return diversaoFalsa(relogio);
  const alvo = (servidor: ServidorDiversao) => alvoDoServidor(servidor, ambiente.DIVERSAO_HOST);
  return {
    controle: controleReal(),
    perguntar: (servidor) => perguntarAoServidor(controlador, alvo(servidor)),
    situacaoDaTela: (servidor) => situacaoDoServidor(controlador, alvo(servidor)),
  };
}
