const horaCurta = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

/** Mostra até quando a pessoa fica sem jogar por não ter aceitado uma partida, e a última chance antes do banimento. */
export function AvisoDeBloqueio({ situacao }: { situacao: { bloqueadoAte: Date | null; ultimaChance: boolean } }) {
  if (!situacao.bloqueadoAte) return null;
  return (
    <p role="alert" className="aviso">
      Você não aceitou uma partida. Pode jogar de novo às {horaCurta.format(situacao.bloqueadoAte)}.
      {situacao.ultimaChance && <b> Se não aceitar de novo, sua conta será banida.</b>}
    </p>
  );
}
