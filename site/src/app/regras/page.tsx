import type { Metadata } from 'next';
import { PUNICOES_EM_MINUTOS } from '@/dominio/faltas';
import { PaginaDeTexto } from '../pagina-de-texto';

export const metadata: Metadata = { title: 'Regras do clube · Magnatas do CS' };

/** "3 min, 15 min, 30 min e 24 h", direto das punições que o site aplica. */
function punicoes(): string {
  const nomes = PUNICOES_EM_MINUTOS.map((minutos) => (minutos >= 60 ? `${minutos / 60} h` : `${minutos} min`));
  return `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
}

/** As regras que o site já aplica, escritas para quem chega pelo convite (dono, 13/11/2026). */
export default function Regras() {
  return (
    <PaginaDeTexto titulo="Regras do clube" atualizada="13/11/2026">
      <p>A Magnatas do CS é um clube de CS2 só por convite. As regras abaixo valem para todos, inclusive a equipe.</p>

      <h2>Quem pode entrar</h2>
      <ul>
        <li>Só maiores de 18 anos.</li>
        <li>Uma conta por pessoa. Todo mundo passa pela verificação de identidade antes de jogar.</li>
        <li>Só entra quem recebe um convite de um membro.</li>
      </ul>

      <h2>Sem hack</h2>
      <p>
        Hack, cheat, macro, script ou qualquer programa que dê vantagem é banimento definitivo. Quem é banido não volta, nem com outra conta da Steam: o
        bloqueio vale para a pessoa.
      </p>

      <h2>Aceitar a partida</h2>
      <p>
        Quando a partida do mix aparece, todos têm 30 segundos para aceitar. Quem não aceita leva uma pausa para entrar na fila, que cresce a cada vez:{' '}
        {punicoes()}. Na {PUNICOES_EM_MINUTOS.length + 1}ª vez em 30 dias, a conta é banida.
      </p>

      <h2>Respeito</h2>
      <p>
        Xingamento pesado, racismo, preconceito, ameaça e assédio, no chat do jogo, na voz ou nas mensagens do site, podem levar a suspensão ou banimento.
        Zoeira entre amigos é normal; passar do limite com quem não quer, não.
      </p>

      <h2>Denúncias e chamados</h2>
      <ul>
        <li>Durante a partida, dá para chamar a equipe pelo site. Alguém entra para assistir ao vivo.</li>
        <li>No fim da partida, dá para denunciar quem passou do limite e elogiar quem jogou limpo.</li>
        <li>A equipe analisa cada denúncia com a gravação da partida e decide: recusa a denúncia, suspende a conta ou propõe o banimento.</li>
        <li>Denúncia falsa de propósito também é falta de respeito.</li>
      </ul>

      <h2>Punições</h2>
      <ul>
        <li>
          <b>Suspensão:</b> a conta sai na hora da fila, das salas e dos servidores e fica sem jogar até um Adm decidir.
        </li>
        <li>
          <b>Banimento:</b> definitivo. A conta não volta e a pessoa não consegue criar outra.
        </li>
      </ul>

      <h2>Dúvidas</h2>
      <p>Fale com a equipe pelo Discord do clube.</p>
    </PaginaDeTexto>
  );
}
