import { redirect } from 'next/navigation';
import { destinoPara } from '@/auth/destino';
import { usuarioAtual } from '@/auth/sessao-atual';
import { obterBd } from '@/bd/conexao';
import { motivoDaUltimaRecusa } from '@/dominio/verificacao';
import { comecar } from './acoes';
import { MolduraDaVerificacao } from './moldura';

// O motivo guardado na verificação, em palavras de quem tenta entrar.
const MOTIVOS: Record<string, string> = {
  'dados do documento inválidos': 'Não achamos o CPF no documento. Use a CNH ou o RG novo, que trazem o CPF, e tente de novo.',
  idade: 'O clube é só para maiores de 18 anos.',
  'documento já usado': 'Esse documento já está em outra conta. Cada pessoa pode ter só uma.',
  'recusada pelo provedor': 'A verificação não passou. Confira se a foto do documento está nítida e se a selfie mostra bem o seu rosto, e tente de novo.',
};
const PADRAO = 'Não foi possível confirmar seus dados. Confira as dicas abaixo e tente de novo.';

const PASSOS = [
  { titulo: 'Documento', texto: 'Foto da CNH ou do RG novo (os dois têm o CPF).' },
  { titulo: 'Selfie', texto: 'Uma foto do rosto, para provar que é você.' },
  { titulo: 'Pronto', texto: 'Leva uns 2 minutos e você vira Magnata.' },
];

export default async function Verificacao({ searchParams }: { searchParams: Promise<{ resultado?: string }> }) {
  const usuario = await usuarioAtual();
  const destino = destinoPara(usuario, '/verificacao');
  if (destino) redirect(destino);
  const { resultado } = await searchParams;
  const motivo = resultado && usuario ? await motivoDaUltimaRecusa(obterBd(), usuario.id) : null;

  return (
    <MolduraDaVerificacao passo="Último passo" titulo="Confirme que é você">
      <p className="texto-da-verificacao">Para manter o clube sem hack, cada pessoa tem uma conta só. A verificação é rápida e feita pelo celular ou pelo PC.</p>
      {resultado && (
        <p role="alert" className="aviso">
          {(motivo && MOTIVOS[motivo]) ?? PADRAO}
        </p>
      )}
      <ol className="passos-da-verificacao">
        {PASSOS.map((passo, indice) => (
          <li key={passo.titulo}>
            <b>{indice + 1}</b>
            <span>
              <strong>{passo.titulo}</strong>
              <small>{passo.texto}</small>
            </span>
          </li>
        ))}
      </ol>
      <ul className="regras-da-verificacao">
        <li>🔞 Só maiores de 18 anos</li>
        <li>👤 Uma conta por pessoa</li>
        <li>⛔ Banido não volta, nem com outra Steam</li>
      </ul>
      <p className="privacidade-da-verificacao">
        🔒 As fotos ficam com a Didit, a empresa que confere os documentos. O clube nunca vê nem guarda as fotos: guarda só um código feito a partir do seu CPF.
      </p>
      <form action={comecar}>
        <button type="submit" className="botao-da-shop botao-grande">
          Começar verificação
        </button>
      </form>
      <form action="/api/auth/sair" method="post">
        <button type="submit" className="botao-texto">
          Sair
        </button>
      </form>
    </MolduraDaVerificacao>
  );
}
