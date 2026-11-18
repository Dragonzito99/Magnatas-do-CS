"""Capa da Oficina: a planta do estádio vista de cima, mais clara quanto mais alto. Só Python, sem bibliotecas.
Uso: python capa.py <saida.png>"""
import struct
import sys
import zlib

from gerar_mapa import estadio

LADO = 512
ESCALA = LADO / 4352.0  # do muro de fora (-2176..2176) para a imagem


def png(caminho, pixels):
    linhas = b''.join(b'\x00' + bytes(v for p in linha for v in p) for linha in pixels)

    def bloco(tipo, dados):
        return struct.pack('>I', len(dados)) + tipo + dados + struct.pack('>I', zlib.crc32(tipo + dados) & 0xffffffff)

    with open(caminho, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(bloco(b'IHDR', struct.pack('>IIBBBBB', LADO, LADO, 8, 2, 0, 0, 0)))
        f.write(bloco(b'IDAT', zlib.compress(linhas, 9)))
        f.write(bloco(b'IEND', b''))


def cor(mat, z):
    base = {'grass': (52, 98, 46), 'wood': (120, 86, 52), 'metal': (110, 116, 126),
            'painted': (170, 84, 52), 'reflectivity_10': (40, 42, 48), 'reflectivity_90': (235, 225, 190),
            'invisibleladder': (210, 170, 40)}
    c = next((v for k, v in base.items() if k in mat), (128, 124, 116))
    luz = 0.55 + min(z, 640) / 640 * 0.6
    return tuple(min(255, int(x * luz)) for x in c)


def main(saida):
    fundo = (22, 26, 36)
    pixels = [[fundo] * LADO for _ in range(LADO)]
    altura = [[-1e9] * LADO for _ in range(LADO)]
    for peca in estadio():
        xs = [v[0] for v in peca.vertices]
        ys = [v[1] for v in peca.vertices]
        topo = max(v[2] for v in peca.vertices)
        mat = peca.materiais[0].split('/')[-1]
        c = cor(mat, topo)
        x0 = int((min(xs) + 2176) * ESCALA)
        x1 = int((max(xs) + 2176) * ESCALA)
        y0 = int((2176 - max(ys)) * ESCALA)
        y1 = int((2176 - min(ys)) * ESCALA)
        for py in range(max(0, y0), min(LADO, max(y1, y0 + 1))):
            for px in range(max(0, x0), min(LADO, max(x1, x0 + 1))):
                if topo >= altura[py][px]:
                    altura[py][px] = topo
                    pixels[py][px] = c
    png(saida, pixels)


if __name__ == '__main__':
    main(sys.argv[1])
