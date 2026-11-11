import importlib.util
import struct
from pathlib import Path

CAMINHO = Path(__file__).resolve().parents[1] / "ferramentas" / "mutante" / "corrigir_webp.py"
especificacao = importlib.util.spec_from_file_location("corrigir_webp", CAMINHO)
corrigir_webp = importlib.util.module_from_spec(especificacao)
especificacao.loader.exec_module(corrigir_webp)


def pedaco(tag, dados):
    return tag + struct.pack("<I", len(dados)) + dados + (b"\0" if len(dados) % 2 else b"")


def quadro(bandeiras):
    # x, y, largura-1, altura-1, duração (3 bytes cada) e as bandeiras; depois o "desenho" do quadro.
    return pedaco(b"ANMF", bytes(12) + (33).to_bytes(3, "little") + bytes([bandeiras]) + pedaco(b"VP8L", b"abc"))


def webp(*quadros):
    corpo = b"WEBP" + pedaco(b"VP8X", bytes(10)) + pedaco(b"ANIM", bytes(6)) + b"".join(quadros)
    return b"RIFF" + struct.pack("<I", len(corpo)) + corpo


def test_cada_quadro_passa_a_substituir_o_anterior_sem_misturar():
    # O ffmpeg grava "misturar com o anterior" (bit 1 = 0): o fundo transparente deixa os quadros velhos aparecendo.
    original = webp(quadro(0b00), quadro(0b01), quadro(0b00))
    corrigido = corrigir_webp.sem_mistura(original)
    assert [b & 0b10 for b in corrigir_webp.bandeiras(corrigido)] == [0b10, 0b10, 0b10]
    # O resto do arquivo fica igual, só o byte das bandeiras muda.
    assert len(corrigido) == len(original)
    assert sum(1 for a, b in zip(original, corrigido) if a != b) == 3


def test_arquivo_que_nao_e_webp_animado_e_recusado():
    try:
        corrigir_webp.sem_mistura(b"RIFF\0\0\0\0WAVE")
    except ValueError:
        return
    raise AssertionError("devia recusar")
