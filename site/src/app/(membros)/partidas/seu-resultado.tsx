import type { ResultadoDaConta } from '@/dominio/avaliar';
import { nomeDaInsignia, PREMIOS, textoDoPremio } from '@/dominio/insignias';
import { Insignia } from '../insignia';

const numero = new Intl.NumberFormat('pt-BR');
const NOME_DO_RESULTADO = { vitoria: 'Vitória', empate: 'Empate', derrota: 'Derrota' } as const;

/**
 * "Seu resultado" no topo da partida encerrada, para quem jogou: resultado, XP, Grana, K/D, abates e as insígnias que
 * saíram nela (dono, 11/11/2026).
 */
export function SeuResultado({ resultado }: { resultado: ResultadoDaConta }) {
  return (
    <section className="painel seu-resultado" aria-label="Seu resultado">
      <div className="cabeca-painel">
        <h2>Seu resultado</h2>
      </div>
      <div className="seu-resultado-numeros">
        <div className={`seu-numero ${resultado.resultado === 'vitoria' ? 'verde' : resultado.resultado === 'derrota' ? 'vermelho' : ''}`}>
          <small>Resultado</small>
          <b>{NOME_DO_RESULTADO[resultado.resultado]}</b>
        </div>
        <div className="seu-numero ouro">
          <small>XP ganho</small>
          <b>+{numero.format(resultado.xp)}</b>
        </div>
        <div className="seu-numero ouro">
          <small>Grana ganha</small>
          <b>+{numero.format(resultado.grana)}</b>
        </div>
        <div className="seu-numero">
          <small>K/D</small>
          <b>{resultado.kd === null ? '—' : resultado.kd.toFixed(2)}</b>
          <span>
            {resultado.abates} {resultado.abates === 1 ? 'abate' : 'abates'}
            {resultado.mortes !== null && ` · ${resultado.mortes} ${resultado.mortes === 1 ? 'morte' : 'mortes'}`}
          </span>
        </div>
      </div>
      {resultado.insignias.map((insignia) => (
        <div className="seu-resultado-insignia" key={`${insignia.familia}:${insignia.nivel}`}>
          <Insignia familia={insignia.familia} nivel={insignia.nivel} tamanho={40} />
          <div>
            <b>Nova insígnia: {nomeDaInsignia(insignia.familia, insignia.nivel)}</b>
            <small>{textoDoPremio({ ...PREMIOS[insignia.nivel], mutanteId: null, mutanteDias: null })}</small>
          </div>
        </div>
      ))}
    </section>
  );
}
