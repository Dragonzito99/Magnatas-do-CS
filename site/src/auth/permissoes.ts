import type { Papel, Usuario } from '@/bd/esquema';

export type Acao = 'gerar_convite_ilimitado' | 'ver_equipe' | 'mudar_papel' | 'dar_convites' | 'moderar';

const REGRAS: Record<Acao, Papel[]> = {
  gerar_convite_ilimitado: ['gm', 'adm'],
  ver_equipe: ['gm', 'adm'],
  mudar_papel: ['adm'],
  dar_convites: ['adm'],
  moderar: ['gm', 'adm'],
};

export function pode(usuario: Pick<Usuario, 'papel' | 'estado'>, acao: Acao): boolean {
  return usuario.estado === 'ativo' && REGRAS[acao].includes(usuario.papel);
}
