import type { Bd } from '@/bd/conexao';
import type { Usuario } from '@/bd/esquema';
import type { ServidorAlvo } from '@/servidor-jogo/controlador';
import type { SituacaoDoServidor } from './diversao';
import { exigirPermissao } from './equipe';
import { PRAZO_PARA_LIGAR_MS, type ControleDaDiversao } from './sob-demanda';

export type ChaveDoLaboratorio = 'personagens' | 'mutantes';

export type Laboratorio = { chave: ChaveDoLaboratorio; nome: string; porta: number; titulo: string; descricao: string };

/**
 * Laboratório do Adm (dono, 13/11/2026): dois servidores da Diversão só para testar sozinho, pelo chat. Ficam fora da
 * tabela dos servidores da Diversão, então não aparecem em Jogar nem valem XP. O próprio servidor tira quem não é Adm
 * e desliga depois de 10 minutos vazio. O nome é o do .conf em /home/cs2/bin/diversao, e a porta, a do .conf.
 */
export const LABORATORIOS: readonly Laboratorio[] = [
  {
    chave: 'personagens',
    nome: 'laboratorio-personagens',
    porta: 27022,
    titulo: 'Laboratório de personagens',
    descricao: 'Vista qualquer personagem, chame bots vestidos e veja os gestos. No chat: !ajuda.',
  },
  {
    chave: 'mutantes',
    nome: 'laboratorio-mutantes',
    porta: 27023,
    titulo: 'Laboratório de mutantes',
    descricao: 'Vire qualquer mutante em qualquer nível, chame bots e teste os poderes. No chat: !ajuda.',
  },
];

export class LaboratorioDesconhecido extends Error {
  constructor() {
    super('Laboratório desconhecido.');
    this.name = 'LaboratorioDesconhecido';
  }
}

export function lerLaboratorio(valor: unknown): Laboratorio | null {
  return LABORATORIOS.find((laboratorio) => laboratorio.chave === valor) ?? null;
}

export function alvoDoLaboratorio(laboratorio: Pick<Laboratorio, 'porta'>, hostPadrao: string | undefined): ServidorAlvo | null {
  const host = hostPadrao?.trim();
  return host ? { host, porta: laboratorio.porta } : null;
}

/** Só o Adm. Já ligado não é erro: o script da VPS não liga duas vezes. */
export async function ligarLaboratorio(bd: Bd, controle: ControleDaDiversao, usuario: Pick<Usuario, 'id'>, chave: unknown): Promise<Laboratorio> {
  await exigirPermissao(bd, usuario, 'usar_laboratorio');
  const laboratorio = lerLaboratorio(chave);
  if (!laboratorio) throw new LaboratorioDesconhecido();
  await controle.ligar(laboratorio.nome);
  return laboratorio;
}

/** O pedido da tela (hora em ms no endereço) vale só pelo prazo de ligar; depois, a tela volta ao botão Ligar. */
export function pedidoRecente(desde: string | undefined, agora: number = Date.now()): boolean {
  const quando = Number(desde);
  if (!desde || !Number.isFinite(quando)) return false;
  return quando <= agora && agora - quando <= PRAZO_PARA_LIGAR_MS;
}

export type EtapaDoLaboratorio = 'desligado' | 'ligando' | 'pronto';

/** Sem estado guardado: o que o servidor responde agora, e se a tela acabou de pedir para ligar. */
export function etapaDoLaboratorio(situacao: SituacaoDoServidor, pedidoAgora: boolean): EtapaDoLaboratorio {
  if (situacao.ligado) return 'pronto';
  return pedidoAgora ? 'ligando' : 'desligado';
}
