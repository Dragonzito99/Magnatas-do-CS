import Image from 'next/image';
import { LogoGrande } from '../logo-grande';

/**
 * A moldura das telas de verificação, no visual do site (dono, 12/11/2026): o personagem do clube de um lado, com o
 * brilho roxo, e o cartão do passo do outro. No celular o personagem some e fica só o cartão.
 */
export function MolduraDaVerificacao({ passo, titulo, children }: { passo: string; titulo: string; children: React.ReactNode }) {
  return (
    <div className="tela-da-verificacao">
      <div className="arte-da-verificacao" aria-hidden="true">
        <Image src="/marca/personagem.webp" alt="" width={756} height={800} priority />
      </div>
      <main className="cartao-da-verificacao">
        <LogoGrande />
        <span className="passo-da-verificacao">{passo}</span>
        <h1>{titulo}</h1>
        {children}
      </main>
    </div>
  );
}
