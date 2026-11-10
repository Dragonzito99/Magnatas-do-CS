import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { assinaturas, enderecos, envios, mensalidades, pedidos, usuarios, type Usuario } from '@/bd/esquema';
import { exigirPermissao, registrarAuditoria, SemPermissao } from './equipe';

export class EnderecoInvalido extends Error {
  constructor(public readonly campo: string) {
    super('Confira o endereço.');
  }
}

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const DIAS_GUARDANDO_O_ENDERECO = 90;

export type DadosDoEndereco = { nome: string; cep: string; rua: string; numero: string; complemento?: string | null; bairro: string; cidade: string; uf: string; telefone: string };

function limpar(dados: DadosDoEndereco) {
  const texto = (valor: string | null | undefined, campo: string, maximo = 120) => {
    const limpo = (valor ?? '').trim().replace(/\s+/g, ' ');
    if (!limpo || limpo.length > maximo) throw new EnderecoInvalido(campo);
    return limpo;
  };
  const cep = (dados.cep ?? '').replace(/\D/g, '');
  if (cep.length !== 8) throw new EnderecoInvalido('cep');
  const telefone = (dados.telefone ?? '').replace(/\D/g, '');
  if (telefone.length < 10 || telefone.length > 11) throw new EnderecoInvalido('telefone');
  const uf = (dados.uf ?? '').trim().toUpperCase();
  if (!UFS.includes(uf)) throw new EnderecoInvalido('uf');
  const complemento = (dados.complemento ?? '').trim();
  return {
    nome: texto(dados.nome, 'nome'),
    cep,
    rua: texto(dados.rua, 'rua'),
    numero: texto(dados.numero, 'numero', 20),
    complemento: complemento ? complemento.slice(0, 80) : null,
    bairro: texto(dados.bairro, 'bairro'),
    cidade: texto(dados.cidade, 'cidade'),
    uf,
    telefone,
  };
}

/** Só quem é ou já foi Premium cadastra endereço: ele só serve para os produtos em casa. */
export async function salvarEndereco(bd: Bd, usuario: Pick<Usuario, 'id'>, dados: DadosDoEndereco): Promise<void> {
  const limpo = limpar(dados);
  const [premium] = await bd.select({ id: assinaturas.id }).from(assinaturas).where(and(eq(assinaturas.usuarioId, usuario.id), eq(assinaturas.nivel, 'premium')));
  if (!premium) throw new SemPermissao();
  await bd
    .insert(enderecos)
    .values({ usuarioId: usuario.id, ...limpo })
    .onConflictDoUpdate({ target: enderecos.usuarioId, set: { ...limpo, atualizadoEm: new Date() } });
}

export async function enderecoDe(bd: Bd, usuarioId: string) {
  const [endereco] = await bd.select().from(enderecos).where(eq(enderecos.usuarioId, usuarioId));
  return endereco ?? null;
}

/** Os envios da própria pessoa, para ela acompanhar. */
export async function enviosDe(bd: Bd, usuarioId: string) {
  return bd.select().from(envios).where(eq(envios.usuarioId, usuarioId)).orderBy(desc(envios.criadoEm));
}

/** Só o Adm: os envios que faltam sair, com o endereço de cada um. */
export async function enviosPendentes(bd: Bd, ator: Pick<Usuario, 'id'>) {
  await exigirPermissao(bd, ator, 'ver_envios');
  const linhas = await bd
    .select({ envioId: envios.id, criadoEm: envios.criadoEm, usuarioId: usuarios.id, apelido: usuarios.apelido, endereco: enderecos })
    .from(envios)
    .innerJoin(usuarios, eq(usuarios.id, envios.usuarioId))
    .leftJoin(enderecos, eq(enderecos.usuarioId, envios.usuarioId))
    .where(eq(envios.estado, 'pendente'))
    .orderBy(asc(envios.criadoEm));
  return linhas;
}

export async function marcarEnviado(bd: Bd, ator: Pick<Usuario, 'id'>, envioId: string, rastreio: string): Promise<void> {
  const codigo = rastreio.trim().slice(0, 60);
  await bd.transaction(async (tx) => {
    await exigirPermissao(tx, ator, 'ver_envios');
    const [envio] = await tx
      .update(envios)
      .set({ estado: 'enviado', rastreio: codigo || null, enviadoEm: new Date() })
      .where(and(eq(envios.id, envioId), eq(envios.estado, 'pendente')))
      .returning({ usuarioId: envios.usuarioId });
    if (envio) await registrarAuditoria(tx, { atorId: ator.id, acao: 'envio_marcado', alvoId: envio.usuarioId, detalhes: { envioId, rastreio: codigo } });
  });
}

/** Apaga o endereço de quem deixou de ser Premium há mais de 90 dias. A varredura do site chama. */
export async function apagarEnderecosVencidos(bd: Bd, agora: Date = new Date()): Promise<number> {
  const limite = new Date(agora.getTime() - DIAS_GUARDANDO_O_ENDERECO * 24 * 60 * 60 * 1000);
  const apagados = await bd
    .delete(enderecos)
    .where(
      sql`not exists (select 1 from ${assinaturas} where ${assinaturas.usuarioId} = ${enderecos.usuarioId} and ${assinaturas.nivel} = 'premium' and (${assinaturas.pagoAte} is null or ${assinaturas.pagoAte} > ${limite}))`,
    )
    .returning({ usuarioId: enderecos.usuarioId });
  return apagados.length;
}

/** Para a nota fiscal: tudo o que entrou no mês (pacotes de MagCoin e mensalidades). Só o Adm. */
export async function vendasDoMes(bd: Bd, ator: Pick<Usuario, 'id'>, dia: Date) {
  await exigirPermissao(bd, ator, 'ver_envios');
  const inicio = new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), 1));
  const fim = new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth() + 1, 1));
  const pacotes = await bd
    .select({ quando: pedidos.pagoEm, apelido: usuarios.apelido, descricao: pedidos.pacote, valorCentavos: pedidos.valorCentavos, pagamento: pedidos.mpPagamentoId, estado: pedidos.estado })
    .from(pedidos)
    .innerJoin(usuarios, eq(usuarios.id, pedidos.usuarioId))
    .where(and(gte(pedidos.pagoEm, inicio), lt(pedidos.pagoEm, fim)));
  const mensais = await bd
    .select({ quando: mensalidades.pagoEm, apelido: usuarios.apelido, descricao: assinaturas.nivel, valorCentavos: mensalidades.valorCentavos, pagamento: mensalidades.mpPagamentoId })
    .from(mensalidades)
    .innerJoin(assinaturas, eq(assinaturas.id, mensalidades.assinaturaId))
    .innerJoin(usuarios, eq(usuarios.id, assinaturas.usuarioId))
    .where(and(gte(mensalidades.pagoEm, inicio), lt(mensalidades.pagoEm, fim)));
  const linhas = [
    ...pacotes.map((linha) => ({ ...linha, quando: linha.quando ?? inicio, tipo: 'MagCoin' as const, estornado: linha.estado === 'estornado' })),
    ...mensais.map((linha) => ({ ...linha, tipo: 'Assinatura' as const, estornado: false })),
  ].sort((a, b) => b.quando.getTime() - a.quando.getTime());
  return { linhas, totalCentavos: linhas.filter((linha) => !linha.estornado).reduce((soma, linha) => soma + linha.valorCentavos, 0) };
}
