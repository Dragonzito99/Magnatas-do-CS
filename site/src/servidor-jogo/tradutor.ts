import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { Traduzir } from '@/dominio/noticias-steam';

const MODELO = 'claude-opus-5-5';
const Traducao = z.object({ titulo: z.string(), resumo: z.string() });

const INSTRUCAO = [
  'Você traduz notas de atualização do Counter-Strike 2 para o português do Brasil, para a tela principal de um clube de jogadores.',
  'Devolva um título curto (até 80 caracteres) que diga o que mudou de mais importante; evite títulos genéricos como "Atualização do CS2" quando o texto disser o que mudou.',
  'Devolva também um resumo de uma ou duas frases, em linguagem simples, com as mudanças que mais afetam quem joga.',
  'Mantenha em inglês os nomes de mapas, armas, modos e termos que a comunidade brasileira usa assim (por exemplo: Inferno, AK-47, Premier, smoke).',
].join(' ');

/** Sem chave configurada, não há tradução: a tela mostra o título original. */
export function criarTradutor(chave: string | undefined): Traduzir | null {
  if (!chave) return null;
  const cliente = new Anthropic({ apiKey: chave });
  return async ({ titulo, conteudo }) => {
    try {
      const resposta = await cliente.beta.messages.parse({
        model: MODELO,
        max_tokens: 1024,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: INSTRUCAO,
        messages: [{ role: 'user', content: `Título original: ${titulo}\n\nNotas da atualização:\n${conteudo}` }],
        output_config: { effort: 'low', format: betaZodOutputFormat(Traducao) },
      });
      if (resposta.stop_reason === 'refusal') return null;
      const lido = resposta.parsed_output;
      if (!lido || !lido.titulo.trim() || !lido.resumo.trim()) return null;
      return { titulo: lido.titulo.trim().slice(0, 120), resumo: lido.resumo.trim().slice(0, 400) };
    } catch (erro) {
      if (erro instanceof Anthropic.AuthenticationError) console.warn('Chave da Anthropic recusada: a tradução fica desligada até trocar a chave.');
      else if (erro instanceof Anthropic.RateLimitError) console.warn('Limite da Anthropic atingido: a tradução tenta de novo na próxima rodada.');
      else if (erro instanceof Anthropic.APIError) console.warn(`A Anthropic respondeu ${erro.status} ao traduzir.`);
      else console.warn('Falha ao falar com a Anthropic:', erro);
      return null;
    }
  };
}
