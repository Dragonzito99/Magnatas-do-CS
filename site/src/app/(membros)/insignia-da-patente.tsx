import type { GrupoDePatente, Patente } from '@/dominio/xp';

const CLASSE_DO_GRUPO: Record<GrupoDePatente, string> = {
  Rua: 'insignia-rua',
  Família: 'insignia-familia',
  Negócios: 'insignia-negocios',
  Poder: 'insignia-poder',
  Elite: 'insignia-elite',
  Topo: 'insignia-topo',
};

/** O símbolo da patente: a cor diz o grupo, e as divisas dizem a posição da patente dentro dele. No topo, a coroa. */
export function InsigniaDaPatente({ patente, classe = '' }: { patente: Pick<Patente, 'grupo' | 'ordemNoGrupo'>; classe?: string }) {
  const topo = patente.grupo === 'Topo';
  return (
    <svg className={`insignia ${CLASSE_DO_GRUPO[patente.grupo]} ${classe}`.trim()} viewBox="0 0 32 32" aria-hidden="true">
      <path className="insignia-escudo" d="M16 2 28 6v9c0 7-5.5 12.5-12 15C9.5 27.5 4 22 4 15V6z" />
      {topo ? (
        <>
          <path className="insignia-coroa" d="m9 20-1.5-9 4.5 3.5L16 8l4 6.5 4.5-3.5-1.5 9z" />
          {Array.from({ length: patente.ordemNoGrupo }, (_, indice) => (
            <circle key={indice} className="insignia-ponto" cx={16 - (patente.ordemNoGrupo - 1) * 2.5 + indice * 5} cy={24} r={1.4} />
          ))}
        </>
      ) : (
        Array.from({ length: patente.ordemNoGrupo }, (_, indice) => (
          <path key={indice} className="insignia-divisa" d={`m10 ${10 + indice * 5} 6 4.5 6-4.5`} />
        ))
      )}
    </svg>
  );
}
