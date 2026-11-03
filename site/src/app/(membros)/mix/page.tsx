import { exigirAcesso } from '@/auth/guarda';

export default async function Mix() {
  await exigirAcesso('/mix');
  return (
    <>
      <div className="topo-pagina">
        <h1>Mix</h1>
      </div>
      <section className="cartao-escuro">
        <h2>Em breve</h2>
        <p>Aqui você vai entrar na sala, e a partida começa sozinha quando chegar em 10 pessoas.</p>
      </section>
    </>
  );
}
