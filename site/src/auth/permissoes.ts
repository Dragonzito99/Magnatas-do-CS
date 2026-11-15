import type { Papel, Usuario } from '@/bd/esquema';

export type Acao = 'gerar_convite_ilimitado' | 'ver_equipe' | 'mudar_papel' | 'dar_convites' | 'moderar' | 'decidir_banimento' | 'publicar_noticia' | 'testar_competitivo' | 'testar_mutacao' | 'usar_laboratorio' | 'ligar_diversao' | 'ver_quedas' | 'ajustar_grana' | 'ver_envios' | 'cuidar_dos_servidores' | 'convite_com_presente' | 'cuidar_de_lemnos';

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
  usar_laboratorio: ['adm'],
  // Por enquanto só o Adm liga um modo da Diversão (dono, 13/11/2026); para liberar, é só pôr os cargos aqui.
  ligar_diversao: ['adm'],
  ver_quedas: ['adm'],
  ajustar_grana: ['adm'],
  ver_envios: ['adm'],
  cuidar_dos_servidores: ['adm'],
  convite_com_presente: ['adm'],
  // Painel da Ilha Lemnos: desfazer kicks e banimentos da ilha (15/11/2026).
  cuidar_de_lemnos: ['adm'],
};

export function pode(usuario: Pick<Usuario, 'papel' | 'estado'>, acao: Acao): boolean {
  return usuario.estado === 'ativo' && REGRAS[acao].includes(usuario.papel);
}
