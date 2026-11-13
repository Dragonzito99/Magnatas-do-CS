import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import { partidasRolando } from '@/dominio/painel-adm';
import { nomeDaPartida, nomeDoMapa, TEXTOS_DO_ESTADO } from '@/dominio/textos-da-partida';
import { Atualizar } from '../../atualizar';
import { BotaoConfirmar } from '../../botao-confirmar';
import { cancelar } from '../../partidas/[id]/acoes';
import { TelaDoPainel } from '../lateral-do-painel';

/** "há 5 min", "há 2 h". */
function haQuanto(quando: Date, agora: number): string {
  const minutos = Math.max(0, Math.round((agora - quando.getTime()) / 60_000));
  if (minutos < 60) return `há ${minutos} min`;
  return `há ${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}

// Parada há mais que isso no mesmo passo, a partida ganha o alerta: provavelmente travou.
const MINUTOS_PARA_ALERTA = 20;

/** Partidas rolando (dono, 13/11/2026): todas as que não acabaram, a mais antiga em cima, com o botão de cancelar a travada. */
export default async function PartidasRolando() {
  const usuario = await exigirAcesso('/painel/partidas');
  if (!pode(usuario, 'ver_equipe')) redirect('/inicio');
  const rolando = await partidasRolando(obterBd());
  // eslint-disable-next-line react-hooks/purity -- página do servidor: a hora é lida uma vez por pedido.
  const agora = Date.now();
  const cancelarPode = pode(usuario, 'moderar');

  return (
    <>
      <Atualizar segundos={15} />
      <TelaDoPainel usuario={usuario} atual="partidas" titulo="Partidas rolando" extra={<span className="apoio">{rolando.length} agora</span>}>
        {rolando.length === 0 && <p className="vazio cartao-adm">Nenhuma partida rolando agora.</p>}
        <div className="grade-adm">
          {rolando.map(({ partida, servidorNome }) => {
            const parada = (agora - partida.estadoDesde.getTime()) / 60_000 > MINUTOS_PARA_ALERTA && partida.estado !== 'ao_vivo';
            const aoVivo = partida.estado === 'ao_vivo';
            return (
              <div key={partida.id} className="cartao-servidor-adm" data-cor={parada ? 'vermelho' : aoVivo ? 'verde' : 'ouro'}>
                <span className="tipo-adm">{nomeDaPartida(partida)}</span>
                <b>{partida.mapa ? nomeDoMapa(partida.mapa) : 'Mapa a definir'}</b>
                {aoVivo && (
                  <span className="placar-adm mono">
                    {partida.nomeTime1 ?? 'Time 1'} {partida.placar1 ?? 0} x {partida.placar2 ?? 0} {partida.nomeTime2 ?? 'Time 2'}
                  </span>
                )}
                <div className="selos-adm">
                  <i className="selo-adm" data-cor={aoVivo ? 'verde' : 'ouro'}>
                    {TEXTOS_DO_ESTADO[partida.estado].etiqueta}
                  </i>
                  {parada && (
                    <i className="selo-adm" data-cor="vermelho">
                      Parada {haQuanto(partida.estadoDesde, agora).replace('há ', '')}
                    </i>
                  )}
                </div>
                <p>
                  Criada {haQuanto(partida.criadoEm, agora)}
                  {servidorNome ? ` · ${servidorNome}` : ''}
                </p>
                <form className="botoes-adm">
                  <input type="hidden" name="partidaId" value={partida.id} />
                  <Link className="botao ouro pequeno" href={`/partidas/${partida.id}`}>
                    Abrir
                  </Link>
                  {cancelarPode && (
                    <BotaoConfirmar mensagem={`Cancelar ${nomeDaPartida(partida)}? Ninguém ganha nem perde nada.`} formAction={cancelar} className="botao contorno pequeno">
                      Cancelar
                    </BotaoConfirmar>
                  )}
                </form>
              </div>
            );
          })}
        </div>
      </TelaDoPainel>
    </>
  );
}
