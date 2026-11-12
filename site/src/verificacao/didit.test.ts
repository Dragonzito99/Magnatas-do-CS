import { createHmac } from 'node:crypto';
import { expect, test } from 'vitest';
import { assinaturaValida, resultadoDaDecisao } from './didit';

const SEGREDO = 'segredo-de-teste';
const AGORA = new Date('2026-11-12T20:00:00Z');
const segundos = Math.floor(AGORA.getTime() / 1000);
const assinar = (corpo: string, segredo = SEGREDO) => createHmac('sha256', segredo).update(corpo).digest('hex');

test('a assinatura do aviso da Didit confere com o corpo cru e o horário recente', () => {
  const corpo = '{"session_id":"abc","status":"Approved"}';
  expect(assinaturaValida(corpo, assinar(corpo), String(segundos), SEGREDO, AGORA)).toBe(true);
  expect(assinaturaValida(corpo, assinar(corpo, 'outro'), String(segundos), SEGREDO, AGORA)).toBe(false);
  expect(assinaturaValida(`${corpo} `, assinar(corpo), String(segundos), SEGREDO, AGORA)).toBe(false);
  // Aviso velho (mais de 5 minutos) pode ser repetição de alguém que copiou.
  expect(assinaturaValida(corpo, assinar(corpo), String(segundos - 301), SEGREDO, AGORA)).toBe(false);
  expect(assinaturaValida(corpo, null, String(segundos), SEGREDO, AGORA)).toBe(false);
  expect(assinaturaValida(corpo, assinar(corpo), String(segundos), '', AGORA)).toBe(false);
});

test('aprovada: tira o CPF do documento (número pessoal ou do documento) e a data de nascimento', () => {
  const decisao = {
    status: 'Approved',
    id_verifications: [{ status: 'Approved', document_number: '12345678', personal_number: '529.982.247-25', date_of_birth: '1995-03-10' }],
  };
  expect(resultadoDaDecisao('sessao-1', decisao)).toEqual({ referencia: 'sessao-1', aprovado: true, cpf: '52998224725', nascimento: '1995-03-10' });
  // Na CNH o CPF às vezes vem no número do documento.
  const cnh = { status: 'Approved', id_verifications: [{ status: 'Approved', document_number: '52998224725', personal_number: null, date_of_birth: '1995-03-10' }] };
  expect(resultadoDaDecisao('sessao-2', cnh).cpf).toBe('52998224725');
});

test('recusada ou sem CPF no documento não aprova', () => {
  expect(resultadoDaDecisao('s', { status: 'Declined', id_verifications: [] })).toMatchObject({ aprovado: false });
  const semCpf = { status: 'Approved', id_verifications: [{ status: 'Approved', document_number: 'AB123', personal_number: '', date_of_birth: '1995-03-10' }] };
  expect(resultadoDaDecisao('s', semCpf)).toMatchObject({ aprovado: true, cpf: undefined, nascimento: '1995-03-10' });
  const documentoRecusado = { status: 'Approved', id_verifications: [{ status: 'Declined', personal_number: '52998224725', date_of_birth: '1995-03-10' }] };
  expect(resultadoDaDecisao('s', documentoRecusado)).toMatchObject({ aprovado: false });
});
