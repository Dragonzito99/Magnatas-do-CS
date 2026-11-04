import { pode } from '@/auth/permissoes';
import type { Bd } from '@/bd/conexao';
import type { Usuario } from '@/bd/esquema';
import { contagemDeCasos } from './denuncias';
import { desafiosDaSala } from './desafios';
import { partidaAtualDe } from './partidas';
import { minhaSala } from './salas';
import { patenteDe } from './xp';

export type Notificacao = {
  tipo: 'desafio' | 'partida' | 'patente' | 'chamados' | 'denuncias' | 'propostas';
  texto: string;
  href: string;
  quantidade: number;
};

const OLHO_DE_AGUIA = '/olho-de-aguia';

/** O contador da aba é a parte das notificações que leva até ela, sem repetir as consultas. */
export function casosDe(notificacoes: Notificacao[]): number {
  return notificacoes.filter((item) => item.href === OLHO_DE_AGUIA).reduce((soma, item) => soma + item.quantidade, 0);
}

/** O que está esperando a pessoa agora. Nasce de dados que já existem, então some quando o assunto é resolvido. */
export async function notificacoesDe(bd: Bd, usuario: Usuario, agora: Date = new Date()): Promise<Notificacao[]> {
  const lista: Notificacao[] = [];

  const sala = await minhaSala(bd, usuario.id);
  if (sala?.liderId === usuario.id) {
    const recebidos = (await desafiosDaSala(bd, sala.id, agora)).filter((desafio) => desafio.recebido);
    if (recebidos.length > 0) {
      const texto = recebidos.length === 1 ? `A sala ${recebidos[0].outraSalaNome} desafiou a sua.` : `${recebidos.length} salas desafiaram a sua.`;
      lista.push({ tipo: 'desafio', texto, href: '/salas', quantidade: recebidos.length });
    }
  }

  const partida = await partidaAtualDe(bd, usuario.id);
  if (partida?.estado === 'aguardando_jogadores') {
    lista.push({ tipo: 'partida', texto: 'Sua partida está pronta. Entre no servidor.', href: `/partidas/${partida.id}`, quantidade: 1 });
  }

  const patente = patenteDe(usuario.xpTotal);
  if (patente.nivel > usuario.patenteVista) {
    lista.push({ tipo: 'patente', texto: `Você subiu para ${patente.nome}`, href: `/jogadores/${usuario.id}`, quantidade: 1 });
  }

  // Só a equipe recebe isto: nunca avisar alguém de que foi denunciado.
  if (pode(usuario, 'moderar')) {
    const { chamados, denuncias, propostas } = await contagemDeCasos(bd, usuario);
    if (chamados > 0) {
      lista.push({ tipo: 'chamados', texto: chamados === 1 ? '1 chamado aberto' : `${chamados} chamados abertos`, href: OLHO_DE_AGUIA, quantidade: chamados });
    }
    if (denuncias > 0) {
      lista.push({ tipo: 'denuncias', texto: denuncias === 1 ? '1 denúncia aberta' : `${denuncias} denúncias abertas`, href: OLHO_DE_AGUIA, quantidade: denuncias });
    }
    if (propostas > 0) {
      lista.push({ tipo: 'propostas', texto: propostas === 1 ? '1 proposta de banimento' : `${propostas} propostas de banimento`, href: OLHO_DE_AGUIA, quantidade: propostas });
    }
  }

  return lista;
}
