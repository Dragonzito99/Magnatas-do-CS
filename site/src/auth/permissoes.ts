import type { Papel, Usuario } from '@/bd/esquema';

export type Acao = 'gerar_convite_ilimitado' | 'ver_equipe' | 'mudar_papel' | 'dar_convites' | 'moderar' | 'decidir_banimento' | 'publicar_noticia' | 'testar_competitivo' | 'testar_mutacao' | 'ver_quedas';

const REGRAS: Record<Acao, Papel[]> = {
  gerar_convite_ilimitado: ['gm', 'adm'],
  ver_equipe: ['gm', 'adm'],
  mudar_papel: ['adm'],
  dar_convites: ['adm'],
  moderar: ['gm', 'adm'],
  decidir_banimento: ['adm'],
  publicar_noticia: ['adm'],
  testar_competitivo: ['adm'],
  testar_mutacao: ['adm'],
  ver_quedas: ['adm'],
};

export function pode(usuario: Pick<Usuario, 'papel' | 'estado'>, acao: Acao): boolean {
  return usuario.estado === 'ativo' && REGRAS[acao].includes(usuario.papel);
}
