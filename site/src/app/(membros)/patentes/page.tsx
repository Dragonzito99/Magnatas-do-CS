import { exigirAcesso } from '@/auth/guarda';
import { COMO_GANHAR_XP, PATENTES, patentesPorGrupo, progressoDe } from '@/dominio/xp';
import { InsigniaDaPatente } from '../insignia-da-patente';

const numero = new Intl.NumberFormat('pt-BR');

/** A escada inteira, do Recruta ao Magnata Lendário, com a patente de quem está vendo marcada. */
export default async function Patentes() {
  const usuario = await exigirAcesso('/patentes');
  const progresso = progressoDe(usuario.xpTotal);
  const grupos = patentesPorGrupo();

  return (
    <>
      <div className="topo-jogar">
        <h1>Patentes</h1>
        <p className="apoio">{PATENTES.length} degraus, do Recruta ao Magnata Lendário. Cada partida jogada até o fim dá XP.</p>
      </div>

      <section className="painel patente-e-xp">
        <InsigniaDaPatente patente={progresso.patente} classe="insignia-perfil" />
        <div className="patente-resumo-largo">
          <strong>Você é {progresso.patente.nome}</strong>
          <span className="apoio">
            {progresso.patente.grupo} · degrau {progresso.patente.nivel} de {PATENTES.length}
          </span>
          <div className="barra-xp" role="progressbar" aria-label="Progresso até a próxima patente" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso.porcentagem}>
            <i style={{ width: `${progresso.porcentagem}%` }} />
          </div>
          <span className="apoio">
            {progresso.proxima
              ? `${numero.format(usuario.xpTotal)} de ${numero.format(progresso.proxima.xp)} XP para ${progresso.proxima.nome}`
              : `${numero.format(usuario.xpTotal)} XP. Patente máxima`}
          </span>
        </div>
        <div className="como-ganhar">
          <b>Como ganhar XP</b>
          <span>Jogar até o fim: {COMO_GANHAR_XP.jogar}</span>
          <span>
            Vitória: +{COMO_GANHAR_XP.vitoria} · Empate: +{COMO_GANHAR_XP.empate}
          </span>
          <span>
            Cada abate: +{COMO_GANHAR_XP.abate} (até {COMO_GANHAR_XP.maximoPorAbates})
          </span>
          <span>No máximo {numero.format(COMO_GANHAR_XP.maximoPorPartida)} por partida</span>
        </div>
      </section>

      {grupos.map(({ grupo, patentes }) => (
        <section key={grupo} className="grupo-de-patentes">
          <h2 className={`titulo-grupo grupo-${grupo === 'Família' ? 'familia' : grupo === 'Negócios' ? 'negocios' : grupo.toLowerCase()}`}>{grupo}</h2>
          <div className="patentes-grade">
            {patentes.map((patente) => {
              const minha = patente.base === progresso.patente.base;
              return (
                <div key={patente.base} className={minha ? 'patente-cartao minha' : 'patente-cartao'}>
                  {minha && <span className="selo-modo ouro voce-aqui">Você está aqui</span>}
                  <InsigniaDaPatente patente={{ grupo, ordemNoGrupo: patente.ordemNoGrupo }} classe="insignia-grande" />
                  <b>{patente.base}</b>
                  <span>{patente.niveis === 1 ? 'sem níveis' : `${patente.niveis} níveis`}</span>
                  <small>
                    {patente.niveis === 1
                      ? `${numero.format(patente.xpInicial)} XP`
                      : `${numero.format(patente.xpInicial)} a ${numero.format(patente.xpFinal)} XP`}
                  </small>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
