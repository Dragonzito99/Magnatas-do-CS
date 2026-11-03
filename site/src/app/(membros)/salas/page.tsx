import { exigirAcesso } from '@/auth/guarda';

export default async function Salas() {
  await exigirAcesso('/salas');
  return (
    <>
      <div className="topo-pagina">
        <h1>Salas</h1>
      </div>
      <section className="cartao-escuro">
        <h2>Em breve</h2>
        <p>Aqui você vai criar uma sala de até 5 pessoas e desafiar outros times.</p>
      </section>
    </>
  );
}
