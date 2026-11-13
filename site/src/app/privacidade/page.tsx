import type { Metadata } from 'next';
import { PaginaDeTexto } from '../pagina-de-texto';

export const metadata: Metadata = { title: 'Privacidade · Magnatas do CS' };

/**
 * O que o site guarda, para quê e por quanto tempo, de acordo com o que o código faz hoje (13/11/2026). Ao mudar o que
 * se guarda (ex.: um prazo novo), esta página muda junto.
 */
export default function Privacidade() {
  return (
    <PaginaDeTexto titulo="Privacidade" atualizada="13/11/2026">
      <p>
        Esta página explica quais dados a Magnatas do CS guarda, para que usa e por quanto tempo, como pede a Lei Geral de Proteção de Dados (LGPD). Nós
        não vendemos dados de ninguém.
      </p>

      <h2>O que guardamos</h2>
      <ul>
        <li>
          <b>Da sua Steam:</b> o seu número da Steam (SteamID), o apelido e a foto do perfil, que já são públicos. É assim que você entra no site.
        </li>
        <li>
          <b>Da verificação de identidade:</b> quem confere o documento e o rosto é a Didit, empresa especializada. As fotos ficam com ela; o clube nunca vê
          nem guarda as fotos. Guardamos só o resultado (aprovado ou não, e o motivo) e um código feito a partir do seu CPF, que não dá para transformar de
          volta no CPF. Ele serve para garantir uma conta por pessoa e impedir que um banido volte.
        </li>
        <li>
          <b>Do jogo:</b> partidas, placares, estatísticas, XP, patentes, insígnias, elogios e denúncias. As gravações das partidas ficam 30 dias, ou
          enquanto houver denúncia aberta sobre a partida.
        </li>
        <li>
          <b>Da comunidade:</b> amigos, grupos e mensagens que você manda pelo site. Uma mensagem denunciada pode ser lida pela equipe para decidir a
          denúncia.
        </li>
        <li>
          <b>Da loja e do apoio:</b> o que você comprou e o seu saldo. O pagamento é feito no Mercado Pago: não vemos nem guardamos dados do cartão. Na
          assinatura, guardamos o e-mail que o Mercado Pago pede.
        </li>
        <li>
          <b>Endereço (só Magnata Premium):</b> usado só para mandar os produtos. Só você e o Adm veem, e ele é apagado 90 dias depois que a assinatura
          acaba.
        </li>
        <li>
          <b>De acesso:</b> o login fica guardado no seu navegador por até 30 dias, e o site anota quando você esteve online por último.
        </li>
      </ul>

      <h2>Com quem compartilhamos</h2>
      <ul>
        <li>
          <b>Steam:</b> para você entrar com a sua conta.
        </li>
        <li>
          <b>Didit:</b> para a verificação de identidade.
        </li>
        <li>
          <b>Mercado Pago:</b> para pagamentos e assinaturas.
        </li>
        <li>
          <b>Discord do clube:</b> só avisos públicos, como notícias e placares de partidas.
        </li>
      </ul>

      <h2>Quem vê o quê</h2>
      <p>
        Outros membros veem o seu perfil de jogador (apelido, foto, patente, insígnias e partidas). A equipe vê também a situação da conta, os convites, as
        punições e os saldos, para cuidar do clube. Toda ação da equipe numa conta fica registrada.
      </p>

      <h2>Seus direitos</h2>
      <p>
        Você pode pedir para ver, corrigir ou apagar os seus dados, e tirar dúvidas, falando com a equipe pelo Discord do clube. Se a conta for banida, o
        código feito a partir do CPF continua guardado, para impedir a volta com outra conta.
      </p>
    </PaginaDeTexto>
  );
}
