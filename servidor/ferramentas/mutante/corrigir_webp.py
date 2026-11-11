"""Corrige a animação .webp do mutante andando, gravada pelo ffmpeg, para cada quadro substituir o anterior.

O ffmpeg grava todo quadro com "misturar com o anterior" e sem apagar. Com fundo transparente, o navegador vai somando
os quadros, e o boneco aparece com várias cópias sobrepostas (dono, 11/11/2026). Como cada quadro ocupa a imagem
inteira, basta ligar "não misturar" em todos.

Uso: python corrigir_webp.py <arquivo.webp> [...]
"""
import struct
import sys

NAO_MISTURAR = 0b10
# Dentro de cada ANMF: x, y, largura-1, altura-1 e duração (3 bytes cada), e então o byte das bandeiras.
POSICAO_DAS_BANDEIRAS = 15


def _quadros(dados: bytes):
    if dados[:4] != b"RIFF" or dados[8:12] != b"WEBP":
        raise ValueError("não é um arquivo WebP")
    i = 12
    while i + 8 <= len(dados):
        tag = dados[i : i + 4]
        tamanho = struct.unpack("<I", dados[i + 4 : i + 8])[0]
        if tag == b"ANMF":
            yield i + 8 + POSICAO_DAS_BANDEIRAS
        i += 8 + tamanho + (tamanho & 1)


def bandeiras(dados: bytes) -> list[int]:
    return [dados[posicao] for posicao in _quadros(dados)]


def sem_mistura(dados: bytes) -> bytes:
    posicoes = list(_quadros(dados))
    if not posicoes:
        raise ValueError("não é um WebP animado")
    saida = bytearray(dados)
    for posicao in posicoes:
        saida[posicao] |= NAO_MISTURAR
    return bytes(saida)


if __name__ == "__main__":
    for caminho in sys.argv[1:]:
        with open(caminho, "rb") as arquivo:
            corrigido = sem_mistura(arquivo.read())
        with open(caminho, "wb") as arquivo:
            arquivo.write(corrigido)
        print("corrigido", caminho, len(bandeiras(corrigido)), "quadros")
