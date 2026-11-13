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
  // No RG novo o CPF é o próprio número do documento.
  const rgNovo = { status: 'Approved', id_verifications: [{ status: 'Approved', document_type: 'Identity Card', document_number: '52998224725', personal_number: null, date_of_birth: '1995-03-10' }] };
  expect(resultadoDaDecisao('sessao-2', rgNovo).cpf).toBe('52998224725');
});

test('CNH: o CPF vem em extra_fields.tax_number; o número do documento é o registro da CNH e nunca vale como CPF', () => {
  const cnh = {
    status: 'Approved',
    id_verifications: [
      {
        status: 'Approved',
        document_type: "Driver's License",
        // Registro da CNH que por acaso passa na conta do CPF: mesmo assim não pode ser usado.
        document_number: '11144477735',
        personal_number: '1234567',
        date_of_birth: '1995-03-10',
        extra_fields: { tax_number: '529.982.247-25' },
      },
    ],
  };
  expect(resultadoDaDecisao('sessao-3', cnh).cpf).toBe('52998224725');
  const cnhSemCpf = { ...cnh, id_verifications: [{ ...cnh.id_verifications[0], extra_fields: {} }] };
  expect(resultadoDaDecisao('sessao-4', cnhSemCpf).cpf).toBeUndefined();
});

test('recusada ou sem CPF no documento não aprova', () => {
  expect(resultadoDaDecisao('s', { status: 'Declined', id_verifications: [] })).toMatchObject({ aprovado: false });
  const semCpf = { status: 'Approved', id_verifications: [{ status: 'Approved', document_number: 'AB123', personal_number: '', date_of_birth: '1995-03-10' }] };
  expect(resultadoDaDecisao('s', semCpf)).toMatchObject({ aprovado: true, cpf: undefined, nascimento: '1995-03-10' });
  const documentoRecusado = { status: 'Approved', id_verifications: [{ status: 'Declined', personal_number: '52998224725', date_of_birth: '1995-03-10' }] };
  expect(resultadoDaDecisao('s', documentoRecusado)).toMatchObject({ aprovado: false });
});

test('rosto que já está em outra conta recusa, com o motivo; o mesmo rosto da própria conta (tentar de novo) passa', () => {
  const documento = { status: 'Approved', personal_number: '52998224725', date_of_birth: '1995-03-10' };
  const comMatch = (vendorData: string, similaridade = 97) => ({
    status: 'Approved',
    id_verifications: [documento],
    liveness_checks: [{ status: 'Approved', matches: [{ vendor_data: vendorData, similarity_percentage: similaridade }] }],
  });
  expect(resultadoDaDecisao('s', comMatch('outra-conta'), 'minha-conta')).toMatchObject({ aprovado: false, motivo: 'rosto já usado' });
  expect(resultadoDaDecisao('s', comMatch('minha-conta'), 'minha-conta')).toMatchObject({ aprovado: true });
  // Parecido demais só abaixo do corte não conta.
  expect(resultadoDaDecisao('s', comMatch('outra-conta', 60), 'minha-conta')).toMatchObject({ aprovado: true });
  // A selfie tirada junto do documento também é conferida.
  const pelaFotoDoDocumento = { status: 'Approved', id_verifications: [{ ...documento, document_selfie_face_matches: [{ vendor_data: 'outra-conta', similarity_percentage: 95 }] }] };
  expect(resultadoDaDecisao('s', pelaFotoDoDocumento, 'minha-conta')).toMatchObject({ aprovado: false, motivo: 'rosto já usado' });
});
