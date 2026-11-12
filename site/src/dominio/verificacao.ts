import { createHmac } from 'node:crypto';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { cpfsBanidos, usuarios, verificacoes, type Usuario } from '@/bd/esquema';

export interface ResultadoVerificacao {
  referencia: string;
  aprovado: boolean;
  cpf?: string;
  nascimento?: string;
  motivo?: string;
}

export type DesfechoVerificacao = 'aprovada' | 'reprovada' | 'banido';

const CONVITES_DO_NOVO_MEMBRO = 2;
const IDADE_MINIMA = 18;
const TAMANHO_MINIMO_DA_CHAVE = 32;

function soDigitos(cpf: string): string {
  return cpf.replace(/[.\-\s]/g, '');
}

function digitoVerificador(digitos: string): number {
  const soma = [...digitos].reduce((total, digito, indice) => total + Number(digito) * (digitos.length + 1 - indice), 0);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

export function cpfValido(cpf: string): boolean {
  const digitos = soDigitos(cpf);
  if (!/^[0-9]{11}$/.test(digitos) || /^(.)\1{10}$/.test(digitos)) return false;
  return (
    digitoVerificador(digitos.slice(0, 9)) === Number(digitos[9]) &&
    digitoVerificador(digitos.slice(0, 10)) === Number(digitos[10])
  );
}

export function maiorDeIdade(nascimento: string, hoje: Date): boolean {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(nascimento)) return false;
  const data = new Date(`${nascimento}T00:00:00Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== nascimento) return false;

  const hojeNoBrasil = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(hoje);
  const limite = `${Number(hojeNoBrasil.slice(0, 4)) - IDADE_MINIMA}${hojeNoBrasil.slice(4)}`;
  return nascimento <= limite;
}

export function codigoDoCpf(cpf: string, chave: string): string {
  if (chave.length < TAMANHO_MINIMO_DA_CHAVE) {
    throw new Error(`CPF_HMAC_CHAVE precisa ter pelo menos ${TAMANHO_MINIMO_DA_CHAVE} caracteres.`);
  }
  return createHmac('sha256', chave).update(soDigitos(cpf)).digest('hex');
}

export async function iniciarVerificacao(
  bd: Bd,
  usuario: Pick<Usuario, 'id'>,
  provedor: string,
  referencia: string,
): Promise<void> {
  await bd.insert(verificacoes).values({ usuarioId: usuario.id, provedor, referencia });
}

/** A última verificação ainda sem resultado da conta, para a volta da Didit conferir na hora. */
export async function verificacaoPendenteDe(bd: Bd, usuarioId: string): Promise<{ referencia: string; provedor: string } | null> {
  const [linha] = await bd
    .select({ referencia: verificacoes.referencia, provedor: verificacoes.provedor })
    .from(verificacoes)
    .where(and(eq(verificacoes.usuarioId, usuarioId), eq(verificacoes.estado, 'pendente')))
    .orderBy(desc(verificacoes.criadoEm))
    .limit(1);
  return linha ?? null;
}

/** Por que a última verificação da conta foi recusada, para a tela explicar o que fazer. */
export async function motivoDaUltimaRecusa(bd: Bd, usuarioId: string): Promise<string | null> {
  const [linha] = await bd
    .select({ estado: verificacoes.estado, motivo: verificacoes.motivo })
    .from(verificacoes)
    .where(and(eq(verificacoes.usuarioId, usuarioId), ne(verificacoes.estado, 'pendente')))
    .orderBy(desc(verificacoes.concluidoEm))
    .limit(1);
  return linha?.estado === 'reprovada' ? (linha.motivo ?? null) : null;
}

export async function verificacaoPertenceA(bd: Bd, referencia: string, usuarioId: string): Promise<boolean> {
  const [linha] = await bd
    .select({ id: verificacoes.id })
    .from(verificacoes)
    .where(and(eq(verificacoes.referencia, referencia), eq(verificacoes.usuarioId, usuarioId)));
  return Boolean(linha);
}

export async function aplicarResultadoVerificacao(
  bd: Bd,
  resultado: ResultadoVerificacao,
  chave: string,
  hoje: Date = new Date(),
): Promise<DesfechoVerificacao> {
  return bd.transaction(async (tx) => {
    const [verificacao] = await tx.select().from(verificacoes).where(eq(verificacoes.referencia, resultado.referencia));
    if (!verificacao) throw new Error('Verificação desconhecida.');
    if (verificacao.estado !== 'pendente') return verificacao.estado;

    const concluir = async (estado: DesfechoVerificacao, motivo?: string) => {
      await tx
        .update(verificacoes)
        .set({ estado, motivo: motivo ?? null, concluidoEm: new Date() })
        .where(eq(verificacoes.id, verificacao.id));
      return estado;
    };

    if (!resultado.aprovado) return concluir('reprovada', resultado.motivo ?? 'recusada pelo provedor');
    if (!resultado.cpf || !cpfValido(resultado.cpf)) return concluir('reprovada', 'dados do documento inválidos');
    if (!resultado.nascimento || !maiorDeIdade(resultado.nascimento, hoje)) return concluir('reprovada', 'idade');

    const cpfHmac = codigoDoCpf(resultado.cpf, chave);

    const [banido] = await tx.select().from(cpfsBanidos).where(eq(cpfsBanidos.cpfHmac, cpfHmac));
    if (banido) {
      await tx.update(usuarios).set({ estado: 'banido', convitesRestantes: 0 }).where(eq(usuarios.id, verificacao.usuarioId));
      return concluir('banido', 'documento banido');
    }

    const [outraConta] = await tx
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(and(eq(usuarios.cpfHmac, cpfHmac), ne(usuarios.id, verificacao.usuarioId)));
    if (outraConta) return concluir('reprovada', 'documento já usado');

    await tx
      .update(usuarios)
      .set({ estado: 'ativo', cpfHmac, convitesRestantes: sql`${usuarios.convitesRestantes} + ${CONVITES_DO_NOVO_MEMBRO}` })
      .where(and(eq(usuarios.id, verificacao.usuarioId), eq(usuarios.estado, 'aguardando_verificacao')));
    return concluir('aprovada');
  });
}
