import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { Traduzir } from '@/dominio/noticias-steam';

const MODELO = 'claude-opus-5-5';
// Folga para o pensamento (que conta nos tokens) e para a resposta curta.
export const MAXIMO_DE_TOKENS = 4096;
const Traducao = z.object({ titulo: z.string(), resumo: z.string() });

const INSTRUCAO = [
  'Você traduz notas de atualização do Counter-Strike 2 para o português do Brasil, para a tela principal de um clube de jogadores.',
  'Devolva um título curto (até 80 caracteres) que diga o que mudou de mais importante; evite títulos genéricos como "Atualização do CS2" quando o texto disser o que mudou.',
  'Devolva também um resumo de uma ou duas frases, em linguagem simples, com as mudanças que mais afetam quem joga.',
  'Mantenha em inglês os nomes de mapas, armas, modos e termos que a comunidade brasileira usa assim (por exemplo: Inferno, AK-47, Premier, smoke).',
].join(' ');

function descrever(erro: unknown): string {
  if (erro instanceof Anthropic.APIError) return erro.status ? `resposta ${erro.status}` : 'sem conexão';
  return erro instanceof Error ? erro.message : 'erro desconhecido';
}

/**
 * Falha da conta ou da rede (chave recusada, sem permissão, sem crédito, limite, fora do ar, sem conexão) é passageira:
 * resolve sozinha ou quando o dono arruma a conta, então não pode gastar as tentativas da notícia.
 * Pedido recusado por outro motivo, ou resposta que não deu para ler, é da notícia.
 */
export function tipoDaFalha(erro: unknown): 'tentar_depois' | 'falhou' {
  if (!(erro instanceof Anthropic.APIError)) return 'falhou';
  const status = erro.status;
  if (status === undefined || status === 401 || status === 403 || status === 429 || status >= 500) return 'tentar_depois';
  if (status === 400 && /credit|billing|balance/i.test(erro.message)) return 'tentar_depois';
  return 'falhou';
}

/** Sem chave configurada, não há tradução: a tela mostra o título original. */
export function criarTradutor(chave: string | undefined): Traduzir | null {
  if (!chave) return null;
  const cliente = new Anthropic({ apiKey: chave });
  return async ({ titulo, conteudo }) => {
    try {
      const resposta = await cliente.beta.messages.parse({
        model: MODELO,
        max_tokens: MAXIMO_DE_TOKENS,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: INSTRUCAO,
        messages: [{ role: 'user', content: `Título original: ${titulo}\n\nNotas da atualização:\n${conteudo}` }],
        output_config: { effort: 'low', format: betaZodOutputFormat(Traducao) },
      });
      if (resposta.stop_reason === 'refusal' || resposta.stop_reason === 'max_tokens') {
        console.warn(`A tradução de uma notícia parou por ${resposta.stop_reason}.`);
        return null;
      }
      const lido = resposta.parsed_output;
      if (!lido || !lido.titulo.trim() || !lido.resumo.trim()) return null;
      return { titulo: lido.titulo.trim().slice(0, 120), resumo: lido.resumo.trim().slice(0, 400) };
    } catch (erro) {
      const tipo = tipoDaFalha(erro);
      if (tipo === 'tentar_depois') {
        console.warn(`A tradução está parada por um problema da conta ou da rede (${descrever(erro)}); tenta de novo na próxima rodada.`);
        return 'tentar_depois';
      }
      console.warn(`A tradução de uma notícia falhou (${descrever(erro)}).`);
      return null;
    }
  };
}
