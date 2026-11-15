import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import { banimentosDaIlha, granaDaIlhaPorDia, paresSuspeitos, type PunicaoDoPainel } from '@/dominio/lemnos/painel';
import { BotaoConfirmar } from '../../botao-confirmar';
import { GraficoDeDias, NumeroDoPainel, TelaDoPainel } from '../lateral-do-painel';
import { desfazer } from './acoes';

const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const MOTIVO = { afk: 'AFK', acampar: 'Acampar' } as const;

function situacao(linha: PunicaoDoPainel): string {
  if (linha.desfeita) return 'desfeito';
  if (linha.paraSempre) return 'banido para sempre';
  if (linha.banidoAte) return `banido até ${quando.format(linha.banidoAte)}`;
  return 'kick';
}

/** A Ilha Lemnos no Painel ADM: a grana que a ilha gera (inflação), kicks e banimentos da ilha, e mortes repetidas. */
export default async function PainelDaIlha({ searchParams }: { searchParams: Promise<{ aviso?: string; erro?: string }> }) {
  const usuario = await exigirAcesso('/painel/lemnos');
  if (!pode(usuario, 'cuidar_de_lemnos')) redirect('/inicio');
  const { aviso, erro } = await searchParams;
  const bd = obterBd();
  const [dias, { valendo, kicks }, suspeitos] = await Promise.all([granaDaIlhaPorDia(bd), banimentosDaIlha(bd), paresSuspeitos(bd)]);
  const hoje = dias[dias.length - 1];

  const linhaDaPunicao = (linha: PunicaoDoPainel) => (
    <li key={linha.id}>
      <b>{linha.apelido}</b> · {MOTIVO[linha.motivo]} · {quando.format(linha.criadoEm)} · <em>{situacao(linha)}</em>
      {!linha.desfeita && (
        <form action={desfazer}>
          <input type="hidden" name="punicao" value={linha.id} />
          <BotaoConfirmar className="botao-da-shop vazado" mensagem={`Desfazer a punição de ${linha.apelido}?`}>
            Desfazer
          </BotaoConfirmar>
        </form>
      )}
    </li>
  );

  return (
    <TelaDoPainel usuario={usuario} atual="lemnos" titulo="Ilha Lemnos">
      {aviso === 'desfeito' && (
        <p role="status" className="aviso ok">
          Punição desfeita.
        </p>
      )}
      {erro === 'permissao' && (
        <p role="alert" className="aviso">
          Seu cargo não desfaz punições da ilha.
        </p>
      )}
      <div className="numeros-adm">
        <NumeroDoPainel rotulo="Grana de saque hoje" valor={hoje.venda} cor="ouro" />
        <NumeroDoPainel rotulo="Grana em dinheiro hoje" valor={hoje.dinheiro} cor="ouro" />
        <NumeroDoPainel rotulo="Banidos da ilha" valor={valendo.length} cor="vermelho" apoio="só da Ilha Lemnos" />
        <NumeroDoPainel rotulo="Pares suspeitos" valor={suspeitos.length} cor={suspeitos.length > 0 ? 'vermelho' : 'cinza'} apoio="5 mortes do mesmo par em 24h" />
      </div>
      <GraficoDeDias titulo="Grana que a ilha gerou" pontos={dias.map((dia) => ({ dia: dia.dia, total: dia.venda + dia.dinheiro }))} />

      <h3>Mortes repetidas (24 horas)</h3>
      {suspeitos.length === 0 ? (
        <p className="apoio">Ninguém matou a mesma pessoa 5 vezes nas últimas 24 horas.</p>
      ) : (
        <ul className="lista-adm">
          {suspeitos.map((par) => (
            <li key={`${par.matador}-${par.morto}`}>
              {par.matador} matou {par.morto} <b>{par.vezes} vezes</b>
            </li>
          ))}
        </ul>
      )}

      <h3>Banidos da ilha agora</h3>
      {valendo.length === 0 ? <p className="apoio">Ninguém banido da ilha.</p> : <ul className="lista-adm">{valendo.map(linhaDaPunicao)}</ul>}

      <h3>Últimos kicks</h3>
      {kicks.length === 0 ? <p className="apoio">Nenhum kick ainda.</p> : <ul className="lista-adm">{kicks.map(linhaDaPunicao)}</ul>}
    </TelaDoPainel>
  );
}
