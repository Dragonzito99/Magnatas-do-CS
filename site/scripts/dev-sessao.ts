// Só para desenvolvimento: cria uma conta fictícia e imprime um token de sessão para testar as telas.
// Uso: npx tsx scripts/dev-sessao.ts <jogador|gm|adm> <aguardando_verificacao|ativo|suspenso|banido>
import { randomInt } from 'node:crypto';
import { obterBd } from '@/bd/conexao';
import { usuarios, type EstadoUsuario, type Papel } from '@/bd/esquema';
import { criarSessao } from '@/auth/sessoes';
import { carregarAmbiente } from './ambiente';

async function principal() {
  if (process.env.NODE_ENV === 'production') throw new Error('Este script não roda em produção.');
  carregarAmbiente();
  const [papel = 'jogador', estado = 'ativo'] = process.argv.slice(2);
  const bd = obterBd();
  const sufixo = String(randomInt(1e9)).padStart(9, '0');
  const [conta] = await bd
    .insert(usuarios)
    .values({
      steamid64: `76561190${sufixo}`,
      apelido: `teste_${papel}_${sufixo.slice(-4)}`,
      papel: papel as Papel,
      estado: estado as EstadoUsuario,
      convitesRestantes: 2,
    })
    .returning();
  console.log(await criarSessao(bd, conta.id));
  process.exit(0);
}

principal().catch((erro) => {
  console.error(`Erro: ${erro.message}`);
  process.exit(1);
});
