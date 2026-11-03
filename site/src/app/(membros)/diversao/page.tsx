import { exigirAcesso } from '@/auth/guarda';

export default async function Diversao() {
  await exigirAcesso('/diversao');
  return (
    <>
      <div className="topo-pagina">
        <h1>Diversão</h1>
      </div>
      <section className="cartao-escuro">
        <h2>Em breve</h2>
        <p>Aqui vão ficar as salas de fantasma, mutação e dos próximos modos.</p>
      </section>
    </>
  );
}
