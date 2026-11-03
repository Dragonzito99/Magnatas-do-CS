import type { EstadoUsuario, Papel } from '@/bd/esquema';

export const NOME_DO_PAPEL: Record<Papel, string> = { jogador: 'Jogador', gm: 'GM', adm: 'Adm' };

export const NOME_DO_ESTADO: Record<EstadoUsuario, string> = {
  aguardando_verificacao: 'Aguardando verificação',
  ativo: 'Ativo',
  suspenso: 'Suspenso',
  banido: 'Banido',
};
