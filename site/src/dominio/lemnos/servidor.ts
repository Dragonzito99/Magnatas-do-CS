import { eq } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { servidoresDiversao } from '@/bd/esquema';

/** O servidor da Ilha Lemnos no Sirocco da Oficina (3649316235; o id fica no .conf da VPS). A foto é provisória até a do Sirocco. Nasce desligado: só abre para todos com o OK do dono. */
export const SERVIDOR_DA_LEMNOS = {
  modo: 'lemnos',
  armas: 'Extração',
  mapa: 'Sirocco',
  foto: '/mapas/lemnos.webp',
  porta: 27024,
  vagas: 20,
  ativo: false,
  ordem: 99,
  nomeNoServidor: 'ilha-lemnos',
  sobDemanda: false,
} as const;

/** Cria a linha do servidor se ainda não existe. Roda na publicação; rodar de novo não muda nada. */
export async function garantirServidorDaLemnos(bd: Bd): Promise<'criado' | 'ja_existia'> {
  const [existente] = await bd.select({ id: servidoresDiversao.id }).from(servidoresDiversao).where(eq(servidoresDiversao.modo, 'lemnos'));
  if (existente) return 'ja_existia';
  await bd.insert(servidoresDiversao).values(SERVIDOR_DA_LEMNOS);
  return 'criado';
}
