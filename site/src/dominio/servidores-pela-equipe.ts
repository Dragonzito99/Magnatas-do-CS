import { eq } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { estadosDaDiversao, servidoresDiversao, type Usuario } from '@/bd/esquema';
import { exigirPermissao, registrarAuditoria } from './equipe';
import { MAXIMO_LIGADOS_PADRAO, NOME_NO_SERVIDOR_VALIDO, pedirParaLigar, ServidorIndisponivel, type ControleDaDiversao } from './sob-demanda';

/**
 * Gestão dos servidores da Diversão pelo Painel ADM (dono, 13/11/2026). Ligar passa pelo mesmo caminho da tela Jogar
 * (limite de ligados, manutenção); desligar e reiniciar são só do Adm. Tudo fica no registro da equipe.
 */

async function servidorDaEquipe(bd: Bd, ator: Pick<Usuario, 'id'>, servidorId: string) {
  await exigirPermissao(bd, ator, 'cuidar_dos_servidores');
  const [servidor] = await bd.select().from(servidoresDiversao).where(eq(servidoresDiversao.id, servidorId));
  if (!servidor?.nomeNoServidor || !NOME_NO_SERVIDOR_VALIDO.test(servidor.nomeNoServidor)) throw new ServidorIndisponivel();
  return { ...servidor, nomeNoServidor: servidor.nomeNoServidor };
}

export async function ligarPelaEquipe(
  bd: Bd,
  controle: ControleDaDiversao,
  ator: Pick<Usuario, 'id'>,
  servidorId: string,
  agora: Date = new Date(),
  maximo: number = MAXIMO_LIGADOS_PADRAO,
): Promise<void> {
  const servidor = await servidorDaEquipe(bd, ator, servidorId);
  const resultado = await pedirParaLigar(bd, controle, servidorId, ator, maximo, agora);
  await registrarAuditoria(bd, { atorId: ator.id, acao: 'ligar_servidor', detalhes: { servidor: servidor.nomeNoServidor, resultado } });
  if (resultado === 'desligado') throw new ServidorIndisponivel();
}

export async function desligarPelaEquipe(bd: Bd, controle: ControleDaDiversao, ator: Pick<Usuario, 'id'>, servidorId: string, agora: Date = new Date()): Promise<void> {
  const servidor = await servidorDaEquipe(bd, ator, servidorId);
  await controle.desligar(servidor.nomeNoServidor);
  await bd
    .insert(estadosDaDiversao)
    .values({ servidorId, estado: 'desligado', desde: agora })
    .onConflictDoUpdate({
      target: estadosDaDiversao.servidorId,
      set: { estado: 'desligado', desde: agora, vazioDesde: null, semRespostaDesde: null, pedidoPor: null, erro: null, teste: null },
    });
  await registrarAuditoria(bd, { atorId: ator.id, acao: 'desligar_servidor', detalhes: { servidor: servidor.nomeNoServidor } });
}

/** Para servidor travado ou depois de trocar plugin: desliga e liga de novo. */
export async function reiniciarPelaEquipe(
  bd: Bd,
  controle: ControleDaDiversao,
  ator: Pick<Usuario, 'id'>,
  servidorId: string,
  agora: Date = new Date(),
  maximo: number = MAXIMO_LIGADOS_PADRAO,
): Promise<void> {
  await desligarPelaEquipe(bd, controle, ator, servidorId, agora);
  await ligarPelaEquipe(bd, controle, ator, servidorId, agora, maximo);
}
