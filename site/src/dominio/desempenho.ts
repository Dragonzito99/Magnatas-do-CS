/** Os números de um jogador numa partida, do jeito que a HLTV mostra. */

type MultiKills = { k1: number; k2: number; k3: number; k4: number; k5: number };

const duasCasas = (valor: number) => Math.round(valor * 100) / 100;
const porcentagem = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);

/**
 * Rating 1.0 da HLTV, a fórmula pública: abates por rodada, sobrevivência e multi-kills,
 * cada um dividido pela média de referência, somados e divididos por 2,7.
 */
export function ratingHltv1(j: { kills: number; deaths: number; rodadas: number } & MultiKills): number {
  if (j.rodadas <= 0) return 0;
  const abates = j.kills / j.rodadas / 0.679;
  const sobrevivencia = (j.rodadas - j.deaths) / j.rodadas / 0.317;
  const multis = (j.k1 + 4 * j.k2 + 9 * j.k3 + 16 * j.k4 + 25 * j.k5) / j.rodadas / 1.277;
  return duasCasas((abates + 0.7 * sobrevivencia + multis) / 2.7);
}

/** Mais estrelas de MVP nas rodadas; empate, mais abates; empate, o apelido que vem primeiro. */
export function mvpDaPartida<T extends { mvps: number; kills: number; apelido: string; rodadas: number }>(jogadores: T[]): T | null {
  const jogaram = jogadores.filter((jogador) => jogador.rodadas > 0);
  if (jogaram.length === 0) return null;
  return jogaram.reduce((melhor, jogador) =>
    jogador.mvps !== melhor.mvps
      ? jogador.mvps > melhor.mvps
        ? jogador
        : melhor
      : jogador.kills !== melhor.kills
        ? jogador.kills > melhor.kills
          ? jogador
          : melhor
        : jogador.apelido.localeCompare(melhor.apelido, 'pt-BR') < 0
          ? jogador
          : melhor,
  );
}

export function linhaHltv(j: { kills: number; deaths: number; damage: number; rodadas: number; kast: number; headshotKills: number } & MultiKills): {
  kd: string;
  saldo: number;
  adr: number;
  kast: number;
  hs: number;
  rating: number;
} {
  return {
    kd: `${j.kills}-${j.deaths}`,
    saldo: j.kills - j.deaths,
    adr: j.rodadas > 0 ? Math.round(j.damage / j.rodadas) : 0,
    kast: porcentagem(j.kast, j.rodadas),
    hs: porcentagem(j.headshotKills, j.kills),
    rating: ratingHltv1(j),
  };
}
