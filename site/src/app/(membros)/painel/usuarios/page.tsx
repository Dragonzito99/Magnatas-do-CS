import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import type { Usuario } from '@/bd/esquema';
import { buscarUsuarios, type FiltroDeUsuarios } from '@/dominio/painel-adm';
import { NOME_DO_ESTADO, NOME_DO_PAPEL } from '@/dominio/textos-da-conta';
import { Avatar } from '../../avatar';
import { TelaDoPainel } from '../lateral-do-painel';

const numero = new Intl.NumberFormat('pt-BR');
const data = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });

type Filtro = { valor: string; nome: string; filtro: FiltroDeUsuarios };
const FILTROS: Filtro[] = [
  { valor: '', nome: 'Todos', filtro: {} },
  { valor: 'ativo', nome: 'Ativos', filtro: { estado: 'ativo' } },
  { valor: 'aguardando_verificacao', nome: 'Esperando verificação', filtro: { estado: 'aguardando_verificacao' } },
  { valor: 'suspenso', nome: 'Suspensos', filtro: { estado: 'suspenso' } },
  { valor: 'banido', nome: 'Banidos', filtro: { estado: 'banido' } },
  { valor: 'equipe', nome: 'Equipe', filtro: {} },
  { valor: 'premium', nome: 'Premium', filtro: { premium: true } },
];

const COR_DO_ESTADO: Record<Usuario['estado'], string> = { ativo: 'verde', aguardando_verificacao: 'azul', suspenso: 'ouro', banido: 'vermelho' };

/** "há 5 min", "há 3 h", "há 2 dias". */
function haQuanto(quando: Date | null, agora: number): string {
  if (!quando) return 'nunca';
  const minutos = Math.max(0, Math.round((agora - quando.getTime()) / 60_000));
  if (minutos < 2) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
}

/** Gerenciamento de usuários (dono, 13/11/2026): busca, filtros e a lista; cada linha abre a ficha com as ações. */
export default async function Usuarios({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; premium?: string }> }) {
  const usuario = await exigirAcesso('/painel/usuarios');
  if (!pode(usuario, 'ver_equipe')) redirect('/inicio');
  const { q, estado, premium } = await searchParams;
  const escolhido = FILTROS.find((filtro) => filtro.valor === (premium ? 'premium' : (estado ?? ''))) ?? FILTROS[0];
  const termo = q?.trim().slice(0, 64) ?? '';
  const encontrados = await buscarUsuarios(obterBd(), { ...escolhido.filtro, termo });
  const lista = escolhido.valor === 'equipe' ? encontrados.filter((conta) => conta.papel !== 'jogador') : encontrados;
  // eslint-disable-next-line react-hooks/purity -- página do servidor: a hora é lida uma vez por pedido.
  const agora = Date.now();
  const linkDo = (filtro: Filtro) => {
    const busca = new URLSearchParams();
    if (filtro.valor === 'premium') busca.set('premium', '1');
    else if (filtro.valor) busca.set('estado', filtro.valor);
    if (termo) busca.set('q', termo);
    return `/painel/usuarios${busca.size ? `?${busca}` : ''}`;
  };

  return (
    <TelaDoPainel usuario={usuario} atual="usuarios" titulo="Usuários" extra={<span className="apoio">{lista.length === 100 ? 'os 100 mais novos' : `${lista.length} contas`}</span>}>
      <form className="busca-adm" action="/painel/usuarios">
        {escolhido.valor === 'premium' && <input type="hidden" name="premium" value="1" />}
        {escolhido.valor && escolhido.valor !== 'premium' && <input type="hidden" name="estado" value={escolhido.valor} />}
        <input name="q" defaultValue={termo} placeholder="Apelido ou SteamID" aria-label="Buscar por apelido ou SteamID" maxLength={64} />
        <button type="submit" className="botao ouro pequeno">
          Buscar
        </button>
      </form>
      <nav className="filtros-da-shop" aria-label="Filtrar usuários">
        {FILTROS.map((filtro) => (
          <Link key={filtro.valor || 'todos'} href={linkDo(filtro)} aria-current={filtro === escolhido ? 'page' : undefined}>
            {filtro.nome}
          </Link>
        ))}
      </nav>

      <div className="tabela-adm" role="table" aria-label="Usuários">
        <div className="cabeca-da-tabela-adm" role="row">
          <span role="columnheader">Conta</span>
          <span role="columnheader">Situação</span>
          <span role="columnheader">Cargo</span>
          <span role="columnheader">Grana</span>
          <span role="columnheader">MagCoins</span>
          <span role="columnheader">Último acesso</span>
          <span role="columnheader">Entrou</span>
        </div>
        {lista.length === 0 && <p className="vazio">Nenhuma conta com esse filtro.</p>}
        {lista.map((conta) => (
          <Link key={conta.id} href={`/painel/usuarios/${conta.id}`} className="linha-da-tabela-adm" role="row">
            <span role="cell" className="conta-adm">
              <Avatar usuario={conta} />
              <span>
                <b>{conta.apelido}</b>
                <small className="mono">{conta.steamid64}</small>
              </span>
            </span>
            <span role="cell">
              <i className="selo-adm" data-cor={COR_DO_ESTADO[conta.estado]}>
                {NOME_DO_ESTADO[conta.estado]}
              </i>
            </span>
            <span role="cell">{NOME_DO_PAPEL[conta.papel]}</span>
            <span role="cell" className="mono">
              {numero.format(conta.grana)}
            </span>
            <span role="cell" className="mono">
              {numero.format(conta.magcoin)}
            </span>
            <span role="cell">{haQuanto(conta.vistoEm, agora)}</span>
            <span role="cell">{data.format(conta.criadoEm)}</span>
          </Link>
        ))}
      </div>
    </TelaDoPainel>
  );
}
