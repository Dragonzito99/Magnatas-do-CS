"""Gera o mapa de Mutação do estádio abandonado (primeira versão, só os volumes) a partir do mapa modelo da Valve.

Uso: python gerar_mapa.py <modelo em texto keyvalues2> <saída .vmap>
O modelo em texto sai do dmxconvert: dmxconvert -i xxx_mapname_xxx.vmap -o modelo.txt -oe keyvalues2
Medidas em unidades do jogo (o jogador tem 72 de altura e 32 de largura; pulo normal ~56, agachado ~64).
"""
import copy
import sys

import kv2
from geometria import Contador, caixa, cunha, laje, malha, sala
from kv2 import Elemento, novo_id, novo_ref_id

PISO = 'materials/concrete/concrete_floor_04.vmat'
CONCRETO = 'materials/ar_baggage/baggage_concrete_wall_01.vmat'
GRAMA = 'materials/shared_base/grass/grass_001.vmat'
METAL = 'materials/cs_italy/metal/metal_basic_1.vmat'
PINTADO = 'materials/ar_baggage/trim/painted_metal_trim_1.vmat'
MADEIRA = 'materials/de_anubis/anubis_wood_planks01.vmat'
TELA = 'materials/dev/reflectivity_10.vmat'
LUZ = 'materials/dev/reflectivity_90.vmat'
ESCADA = 'materials/tools/toolsinvisibleladder.vmat'


def estadio():
    p = []
    # Chão: gramado no meio, concreto em volta.
    p.append(caixa(-1024, 1024, -640, 640, -32, 0, GRAMA))
    p.append(caixa(-2048, 2048, 640, 1536, -32, 0, PISO))
    p.append(caixa(-2048, 2048, -1536, -640, -32, 0, PISO))
    p.append(caixa(-2048, -1024, -640, 640, -32, 0, PISO))
    p.append(caixa(1024, 2048, -640, 640, -32, 0, PISO))
    # Muro de fora.
    p.append(caixa(-2112, 2112, 1536, 1600, -32, 768, CONCRETO))
    p.append(caixa(-2112, 2112, -1600, -1536, -32, 768, CONCRETO))
    p.append(caixa(-2112, -2048, -1536, 1536, -32, 768, CONCRETO))
    p.append(caixa(2048, 2112, -1536, 1536, -32, 768, CONCRETO))

    # Arquibancadas: degraus de 16 de altura e 48 de fundo, dá para subir andando.
    for i in range(12):
        p.append(caixa(-1088, 1088, 672 + 48 * i, 672 + 48 * (i + 1), 0, 16 * (i + 1), CONCRETO))  # norte
        p.append(caixa(-1088 - 48 * (i + 1), -1088 - 48 * i, -576, 576, 0, 16 * (i + 1), CONCRETO))  # oeste
        p.append(caixa(1088 + 48 * i, 1088 + 48 * (i + 1), -576, 576, 0, 16 * (i + 1), CONCRETO))  # leste
    for i in range(8):  # sul, cortada pelo túnel
        y0, y1 = -672 - 48 * (i + 1), -672 - 48 * i
        p.append(caixa(-1088, -96, y0, y1, 0, 16 * (i + 1), CONCRETO))
        p.append(caixa(96, 1088, y0, y1, 0, 16 * (i + 1), CONCRETO))
    # Túnel dos jogadores: passagem coberta pela arquibancada sul.
    p.append(caixa(-112, 112, -1056, -672, 128, 144, CONCRETO))

    # Cabine de imprensa, atrás do alto da arquibancada norte.
    p.append(caixa(-1024, -128, 1248, 1472, 0, 192, CONCRETO))
    p += sala(-1024, -128, 1248, 1472, 192, 320, 16, CONCRETO, CONCRETO, portas=[
        ('s', -1008, -912, 192, 320),   # porta do lado do alto da arquibancada
        ('s', -880, -160, 240, 304),    # janelão de vidro (sem vidro)
    ])
    # Escada de marinheiro para o telhado da cabine, na parede leste.
    p.append(caixa(-128, -112, 1328, 1392, 192, 344, ESCADA))
    p.append(caixa(-112, -108, 1328, 1392, 192, 344, METAL))

    # Passarela de ferro do telhado da cabine até a torre do refletor, subindo devagar.
    p.append(laje(-160, 1360, 1208, 1288, 336, 576, 12, METAL))
    p.append(laje(-160, 1360, 1208, 1212, 376, 616, 40, METAL))
    p.append(laje(-160, 1360, 1284, 1288, 376, 616, 40, METAL))
    for x in (400, 900):
        z = 336 + (x + 160) * 240 / 1520 - 12
        p.append(caixa(x - 12, x + 12, 1272, 1296, 0, z, METAL))

    # Torre do refletor no canto nordeste.
    p.append(caixa(1344, 1600, 1120, 1376, 560, 576, METAL))
    for x, y in ((1344, 1120), (1576, 1120), (1344, 1352), (1576, 1352)):
        p.append(caixa(x, x + 24, y, y + 24, 0, 560, METAL))
    p.append(caixa(1360, 1584, 1376, 1392, 576, 672, LUZ))
    p.append(caixa(1456, 1520, 1104, 1116, 0, 592, ESCADA))
    p.append(caixa(1456, 1520, 1116, 1120, 0, 560, METAL))

    # Rampa de surf: a cobertura que desabou em cima da arquibancada norte.
    p.append(cunha(544, 128, 176, 1184, 380, 704, 208, METAL))

    # Mirante no alto do setor leste, com escada.
    p.append(caixa(1536, 1856, 192, 576, 304, 320, CONCRETO))
    for x, y in ((1536, 192), (1832, 192), (1536, 552), (1832, 552)):
        p.append(caixa(x, x + 24, y, y + 24, 0, 304, CONCRETO))
    for k in range(8):
        p.append(caixa(1664, 1776, 192 - 32 * (k + 1), 192 - 32 * k, 0, 320 - 16 * k, CONCRETO))

    # Viga atrás do setor oeste: pulo longo de 192 a partir do alto da arquibancada.
    p.append(caixa(-1888, -1856, -320, 320, 192, 208, METAL))
    p.append(caixa(-1984, -1856, 320, 448, 192, 208, METAL))
    for y in (-320, 424):
        p.append(caixa(-1888, -1864, y, y + 24, 0, 192, METAL))

    # Lanchonete (noroeste), com duas saídas e o balcão.
    p += sala(-1792, -1280, 896, 1312, 0, 192, 16, CONCRETO, CONCRETO, portas=[
        ('s', -1600, -1472, 0, 128),
        ('s', -1440, -1328, 64, 128),
        ('l', 1056, 1152, 0, 128),
    ])
    # Bilheteria (sudoeste) com a marquise, que só se alcança com pulo agachado dos caixotes.
    p += sala(-1792, -1280, -1408, -1024, 0, 192, 16, CONCRETO, CONCRETO, portas=[
        ('n', -1600, -1504, 0, 128),
        ('n', -1440, -1376, 80, 128),
    ])
    p.append(caixa(-1792, -1280, -1024, -896, 160, 176, CONCRETO))
    p.append(caixa(-1456, -1392, -880, -816, 0, 48, MADEIRA))
    p.append(caixa(-1392, -1328, -880, -816, 0, 112, MADEIRA))

    # Vestiários atrás da arquibancada sul, perto da saída do túnel.
    p += sala(-960, -192, -1456, -1168, 0, 192, 16, CONCRETO, CONCRETO, portas=[
        ('n', -352, -224, 0, 128),
        ('l', -1360, -1264, 0, 128),
    ])

    # Escadas do canto sudeste até o alto do setor leste.
    for k in range(12):
        p.append(caixa(1312, 1760, -1344 + 32 * k, -1344 + 32 * (k + 1), 0, 16 * (k + 1), CONCRETO))
    p.append(caixa(1312, 1760, -960, -576, 0, 192, CONCRETO))

    # Palco do show, no fundo sul do campo. Embaixo dá para entrar agachado.
    p.append(caixa(-640, 640, -640, -224, 64, 96, MADEIRA))
    p.append(caixa(-640, -320, -240, -224, 0, 64, MADEIRA))
    p.append(caixa(320, 640, -240, -224, 0, 64, MADEIRA))
    p.append(caixa(-640, 640, -640, -624, 0, 64, MADEIRA))
    p.append(caixa(-640, -624, -624, -240, 0, 64, MADEIRA))
    p.append(caixa(624, 640, -624, -240, 0, 64, MADEIRA))
    for x0 in (-576, 448):
        for k in range(6):
            p.append(caixa(x0, x0 + 128, -224 + 32 * k, -224 + 32 * (k + 1), 0, 96 - 16 * k, MADEIRA))
    # Teto do palco em treliça e o telão ainda de pé atrás.
    for x, y in ((-640, -640), (608, -640), (-640, -240), (608, -240)):
        p.append(caixa(x, x + 32, y, y + 32, 96, 284, METAL))
    p.append(caixa(-672, 672, -656, -208, 284, 300, METAL))
    p.append(caixa(-448, 448, -616, -600, 96, 272, TELA))
    # Caixas de som em escadinha na frente do palco: cinco pulos agachados até o teto.
    for lado in (-1, 1):
        x0, x1 = (-704, -640) if lado < 0 else (640, 704)
        for k, altura in enumerate((60, 120, 180, 240)):
            y1 = 48 - 64 * k
            p.append(caixa(x0, x1, y1 - 64, y1, 0, altura, PINTADO))

    # Telão caído na frente do palco, de rampa.
    p.append(laje(-448, 0, -160, 64, 112, 8, 24, TELA, ao_longo='y'))

    # Mesa de som no meio do campo: dá para passar embaixo e subir pela escadinha de trás.
    p.append(caixa(-160, 160, 160, 416, 96, 112, METAL))
    for x, y in ((-160, 160), (136, 160), (-160, 392), (136, 392)):
        p.append(caixa(x, x + 24, y, y + 24, 0, 96, METAL))
        p.append(caixa(x + 8, x + 16, y + 8, y + 16, 112, 240, METAL))
    p.append(caixa(-176, 176, 144, 432, 240, 256, PINTADO))
    p.append(caixa(-96, 96, 320, 368, 112, 160, PINTADO))
    for k in range(7):
        p.append(caixa(-48, 48, 416 + 32 * k, 416 + 32 * (k + 1), 0, 112 - 16 * k, METAL))

    # Food trucks, ocos, com porta e janela de atendimento. Caixotes para subir no teto.
    for lado in (-1, 1):
        x0, x1 = (-832, -448) if lado < 0 else (448, 832)
        porta = ('l', 384, 480, 0, 112) if lado < 0 else ('o', 384, 480, 0, 112)
        janela = ('s', x0 + 64, x1 - 96, 80, 136) if lado < 0 else ('s', x0 + 96, x1 - 64, 80, 136)
        p += sala(x0, x1, 352, 512, 0, 164, 12, PINTADO, PINTADO, portas=[porta, janela])
        # Caixote alto encostado na ponta de fora do truck (112, depois agachado até o teto em 176) e o baixo (48).
        alto = x0 - 64 if lado < 0 else x1
        baixo = alto - 64 if lado < 0 else alto + 64
        p.append(caixa(alto, alto + 64, 400, 464, 0, 112, MADEIRA))
        p.append(caixa(baixo, baixo + 64, 400, 464, 0, 48, MADEIRA))

    # Banheiros químicos ao lado do campo.
    for y0 in (-176, -80, 16, 112):
        p += sala(896, 976, y0, y0 + 80, 0, 160, 8, PINTADO, PINTADO, portas=[('o', y0 + 16, y0 + 64, 0, 96)])
    p.append(caixa(992, 1040, -256, -208, 0, 104, MADEIRA))
    p.append(caixa(1040, 1088, -256, -208, 0, 48, MADEIRA))

    # Camarins (contêineres) dos dois lados do palco.
    p += sala(-1008, -848, -608, -256, 0, 160, 12, PINTADO, PINTADO, portas=[('l', -480, -384, 0, 112)])
    p += sala(848, 1008, -640, -288, 0, 160, 12, PINTADO, PINTADO, portas=[('o', -512, -416, 0, 112)])
    return p


# Onde nasce cada um. Humanos no campo, mutantes na frente dos setores oeste e leste.
NASCER_CT = [(x, y, 2) for y in (128, 256) for x in (-768, -640, -512, -384, 384, 512, 640, 768)]
NASCER_T = [(-1208, y, 50) for y in (-448, -320, -192, -64, 64, 192, 320, 448)] + \
           [(1208, y, 50) for y in (-448, -320, -192, -64, 64, 192, 320, 448)]

# Fora do modelo: o post_processing_volume e as cenas de apresentação dos times apontam para arquivos do pacote de
# exemplo da Valve, que não vão junto, e deixavam a tela toda rosa (teste do dono, 12/11/2026).
MANTER = {'env_sky', 'light_environment', 'env_cubemap_fog', 'env_soundscape', 'info_map_parameters',
          'info_player_start', 'point_nav_walkable', 'env_combined_light_probe_volume'}


def classe_de(el):
    props = el.get('entity_properties')
    return props.get('classname') if isinstance(props, Elemento) else None


def gerar(modelo_txt, saida):
    texto = open(modelo_txt, encoding='utf-8').read()
    topo = kv2.ler(texto)
    mapa = kv2.indexar(topo)
    prefixo, raiz = topo[0], topo[1]
    mundo = raiz.get('world')

    filhos = []
    sondas = 0
    modelo_ct = None
    for item in mundo.get('children'):
        el = mapa[item.alvo] if isinstance(item, kv2.Ref) else item
        if el.classe != 'CMapEntity':
            continue
        classe = classe_de(el)
        if classe == 'info_player_counterterrorist' and modelo_ct is None:
            modelo_ct = el
        if classe not in MANTER:
            continue
        if classe == 'env_combined_light_probe_volume':
            sondas += 1
            if sondas > 1:
                continue
            props = el.get('entity_properties')
            props.set('box_mins', 'string', '-2112 -1600 -64')
            props.set('box_maxs', 'string', '2112 1600 800')
            el.set('origin', 'vector3', '0 0 0')
        if classe in ('info_player_start', 'point_nav_walkable'):
            el.set('origin', 'vector3', '0 560 16')
        filhos.append(el)

    def nascer(classe, x, y, z, angulo):
        e = copy.deepcopy(modelo_ct)
        e.set('id', 'elementid', novo_id())
        e.set('nodeID', 'int', contador.proximo())
        e.set('referenceID', 'uint64', novo_ref_id())
        e.get('relayPlugData').set('id', 'elementid', novo_id())
        props = e.get('entity_properties')
        props.set('id', 'elementid', novo_id())
        props.set('classname', 'string', classe)
        e.set('origin', 'vector3', '%d %d %d' % (x, y, z))
        e.set('angles', 'qangle', '0 %d 0' % angulo)
        return e

    contador = Contador(1000)
    for x, y, z in NASCER_CT:
        filhos.append(nascer('info_player_counterterrorist', x, y, z, 270 if y > 0 else 90))
    for x, y, z in NASCER_T:
        filhos.append(nascer('info_player_terrorist', x, y, z, 0 if x < 0 else 180))
    for peca in estadio():
        filhos.append(malha(peca, contador))

    mundo.set('children', 'element_array', filhos)
    raiz.set('nodeInstanceData', 'element_array', [])
    raiz.set('m_ReferencedMeshSnapshots', 'element_array', [])
    sel = raiz.get('rootSelectionSet')
    sel.set('children', 'element_array', [])
    prefixo.set('map_asset_references', 'string_array', [])

    cabecalho = texto.splitlines()[0]
    open(saida, 'w', encoding='utf-8', newline='\n').write(kv2.escrever([prefixo, raiz], cabecalho))
    print('peças:', len(estadio()), 'entidades:', len(filhos) - len(estadio()))


if __name__ == '__main__':
    gerar(sys.argv[1], sys.argv[2])
