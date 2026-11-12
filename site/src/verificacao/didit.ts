import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ResultadoVerificacao } from '@/dominio/verificacao';
import { cpfValido } from '@/dominio/verificacao';

/**
 * A Didit confere documento com foto e selfie (dono, 12/11/2026). O site nunca vê as fotos: recebe só a decisão, com o
 * número do documento e a data de nascimento, e guarda o CPF apenas como código embaralhado (ver dominio/verificacao).
 */
export const ENDERECO_DA_DIDIT = 'https://verification.didit.me';
const TOLERANCIA_DO_AVISO_S = 300;

type ItemDoDocumento = { status?: string; document_number?: string | null; personal_number?: string | null; date_of_birth?: string | null };
export type DecisaoDaDidit = { status?: string; id_verifications?: ItemDoDocumento[] };

/** O aviso da Didit vem assinado com HMAC-SHA256 do corpo cru; aviso de mais de 5 minutos é recusado. */
export function assinaturaValida(corpo: string, assinatura: string | null, horario: string | null, segredo: string, agora: Date = new Date()): boolean {
  if (!assinatura || !horario || !segredo) return false;
  const enviadoEm = Number(horario);
  if (!Number.isFinite(enviadoEm) || Math.abs(agora.getTime() / 1000 - enviadoEm) > TOLERANCIA_DO_AVISO_S) return false;
  const esperada = Buffer.from(createHmac('sha256', segredo).update(corpo).digest('hex'));
  const recebida = Buffer.from(assinatura.trim().toLowerCase());
  return esperada.length === recebida.length && timingSafeEqual(esperada, recebida);
}

const digitos = (texto: string | null | undefined) => (texto ?? '').replace(/\D/g, '');

/** Aprovada só se a sessão e o documento passaram. O CPF sai do número pessoal ou do número do documento (CNH). */
export function resultadoDaDecisao(referencia: string, decisao: DecisaoDaDidit): ResultadoVerificacao {
  const documento = decisao.id_verifications?.[0];
  const aprovado = decisao.status === 'Approved' && (decisao.id_verifications ?? []).every((item) => item.status === 'Approved');
  const cpf = [documento?.personal_number, documento?.document_number].map(digitos).find((numero) => numero.length === 11 && cpfValido(numero));
  return { referencia, aprovado, cpf, nascimento: documento?.date_of_birth ?? undefined };
}

/** Status em que a Didit já decidiu; os outros (em análise, em andamento) esperam. */
export function decidida(status: string | undefined): boolean {
  return status === 'Approved' || status === 'Declined';
}

export async function criarSessaoNaDidit(chave: string, fluxo: string, usuarioId: string, voltarPara: string): Promise<{ referencia: string; url: string }> {
  const resposta = await fetch(`${ENDERECO_DA_DIDIT}/v3/session/`, {
    method: 'POST',
    headers: { 'x-api-key': chave, 'Content-Type': 'application/json' },
    body: JSON.stringify({ workflow_id: fluxo, vendor_data: usuarioId, callback: voltarPara, language: 'pt' }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!resposta.ok) throw new Error(`A Didit recusou criar a verificação: ${resposta.status}.`);
  const dados = (await resposta.json()) as { session_id: string; url: string };
  return { referencia: dados.session_id, url: dados.url };
}

export async function buscarDecisaoNaDidit(chave: string, referencia: string): Promise<DecisaoDaDidit> {
  const resposta = await fetch(`${ENDERECO_DA_DIDIT}/v3/session/${encodeURIComponent(referencia)}/decision/`, {
    headers: { 'x-api-key': chave },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resposta.ok) throw new Error(`A Didit não respondeu a decisão: ${resposta.status}.`);
  return (await resposta.json()) as DecisaoDaDidit;
}
