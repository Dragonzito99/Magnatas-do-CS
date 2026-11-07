// Só para desenvolvimento: cria contas fictícias e as coloca em uma sala ou no mix.
// Uso: npx tsx scripts/dev-preencher.ts sala <nome> <quantas>
//      npx tsx scripts/dev-preencher.ts mix <quantas>
//      npx tsx scripts/dev-preencher.ts completar <nome da sala>
//      npx tsx scripts/dev-preencher.ts lider <nome da sala>  (imprime uma sessão do líder)
//      npx tsx scripts/dev-preencher.ts limpar  (cancela as partidas em andamento e esvazia salas e mix)
import { randomInt } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { criarSessao } from '@/auth/sessoes';
import { obterBd, type Bd } from '@/bd/conexao';
import { desafios, filaMix, partidas, salas, usuarios, type Usuario } from '@/bd/esquema';
import { ESTADOS_ATIVOS_DE_PARTIDA } from '@/dominio/disponibilidade';
import { entrarNoMix } from '@/dominio/mix';
import { finalizarPartida } from '@/dominio/partidas';
import { criarSala, entrarNaSala, minhaSala, TAMANHO_DA_SALA } from '@/dominio/salas';
import { carregarAmbiente, exigirBancoLocal } from './ambiente';

async function contaFicticia(bd: Bd, apelido?: string): Promise<Usuario> {
  const sufixo = String(randomInt(1e9)).padStart(9, '0');
  const [conta] = await bd
    .insert(usuarios)
    // Vista no site daqui a um dia: senão a varredura tira a conta fictícia da sala por ter sumido do site.
    .values({ steamid64: `76561190${sufixo}`, apelido: apelido ?? `ficticio_${sufixo.slice(-4)}`, estado: 'ativo', vistoEm: new Date(Date.now() + 24 * 60 * 60_000) })
    .returning();
  return conta;
}

async function principal() {
  carregarAmbiente();
  exigirBancoLocal();
  const bd = obterBd();
  const [modo, ...resto] = process.argv.slice(2);

  if (modo === 'mix') {
    const quantas = Number(resto[0]);
    if (!Number.isInteger(quantas) || quantas < 1 || quantas > 9) throw new Error('Informe de 1 a 9 contas.');
    for (let i = 0; i < quantas; i += 1) await entrarNoMix(bd, await contaFicticia(bd));
    console.log(`${quantas} contas fictícias no mix.`);
  } else if (modo === 'sala') {
    const [nome, texto] = resto;
    const quantas = Number(texto);
    if (!nome || !Number.isInteger(quantas) || quantas < 1 || quantas > 5) throw new Error('Informe o nome e de 1 a 5 contas.');
    // A sala leva o nick do líder, então o líder fictício recebe o nome pedido.
    const sala = await criarSala(bd, await contaFicticia(bd, nome));
    for (let i = 1; i < quantas; i += 1) await entrarNaSala(bd, await contaFicticia(bd), sala.id);
    console.log(`Sala ${nome} com ${quantas} contas fictícias.`);
  } else if (modo === 'completar' || modo === 'lider') {
    const [sala] = await bd.select().from(salas).where(eq(salas.nome, resto[0] ?? ''));
    if (!sala) throw new Error('Sala não encontrada.');
    if (modo === 'lider') {
      console.log(await criarSessao(bd, sala.liderId));
    } else {
      const atual = await minhaSala(bd, sala.liderId);
      for (let i = atual?.membros.length ?? 0; i < TAMANHO_DA_SALA; i += 1) await entrarNaSala(bd, await contaFicticia(bd), sala.id);
      console.log(`Sala ${sala.nome} completa.`);
    }
  } else if (modo === 'limpar') {
    await bd.transaction(async (tx) => {
      const ativas = await tx
        .select({ id: partidas.id })
        .from(partidas)
        .where(inArray(partidas.estado, [...ESTADOS_ATIVOS_DE_PARTIDA]));
      for (const partida of ativas) await finalizarPartida(tx, partida.id, { estado: 'cancelada', vencedor: null });
      await tx.update(desafios).set({ estado: 'cancelado' }).where(eq(desafios.estado, 'pendente'));
      await tx.delete(salas);
      await tx.delete(filaMix);
    });
    console.log('Partidas canceladas, salas apagadas e fila do mix vazia.');
  } else {
    throw new Error('Use: dev-preencher sala <nome> <quantas>, mix <quantas>, completar <nome>, lider <nome> ou limpar');
  }
  process.exit(0);
}

principal().catch((erro) => {
  console.error(`Erro: ${erro.message}`);
  process.exit(1);
});
