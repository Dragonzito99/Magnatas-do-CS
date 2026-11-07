'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export type SlideDeNoticia = { id: string; titulo: string; resumo: string; imagem: string; fixada: boolean };

const SEGUNDOS_POR_NOTICIA = 6;

/** A notícia grande da Início passa sozinha entre as mais novas, como o destaque do site do CrossFire. */
export function CarrosselDeNoticias({ noticias }: { noticias: SlideDeNoticia[] }) {
  const [atual, setAtual] = useState(0);

  useEffect(() => {
    if (noticias.length < 2) return;
    const relogio = setInterval(() => setAtual((indice) => (indice + 1) % noticias.length), SEGUNDOS_POR_NOTICIA * 1000);
    return () => clearInterval(relogio);
  }, [noticias.length]);

  const noticia = noticias[atual] ?? noticias[0];
  if (!noticia) {
    return (
      <div className="cartao-destaque grande sem-foto">
        <span className="selo-modo ouro">Notícias do clube</span>
        <h2>Nenhuma notícia ainda</h2>
      </div>
    );
  }

  return (
    <div className="carrossel">
      <Link href={`/noticias/${noticia.id}`} className="cartao-destaque grande" key={noticia.id}>
        <Image src={noticia.imagem} alt="" width={960} height={540} />
        <span className="selo-modo ouro">{noticia.fixada ? 'Fixada · Notícia do clube' : 'Notícia do clube'}</span>
        <h2>{noticia.titulo}</h2>
        <p>{noticia.resumo}</p>
      </Link>
      {noticias.length > 1 && (
        <div className="pontos-do-carrossel">
          {noticias.map((item, indice) => (
            <button
              key={item.id}
              type="button"
              className={indice === atual ? 'ponto ativo' : 'ponto'}
              aria-label={`Mostrar a notícia ${indice + 1}`}
              aria-current={indice === atual ? 'true' : undefined}
              onClick={() => setAtual(indice)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
