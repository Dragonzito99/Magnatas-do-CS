"""Peças do mapa (caixas, lajes inclinadas, salas) viradas em malhas do Hammer (CMapMesh com CDmePolygonMesh)."""
import kv2
from kv2 import Elemento, novo_id, novo_ref_id

# Uma unidade de textura a cada 256 unidades do jogo (equivale a uma textura de 1024 px na escala 0,25 do Hammer).
TAMANHO_DA_TEXTURA = 256.0


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _cruz(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _ponto(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _normal(pontos):
    nx = ny = nz = 0.0
    for i in range(len(pontos)):
        a, b = pontos[i], pontos[(i + 1) % len(pontos)]
        nx += (a[1] - b[1]) * (a[2] + b[2])
        ny += (a[2] - b[2]) * (a[0] + b[0])
        nz += (a[0] - b[0]) * (a[1] + b[1])
    m = (nx * nx + ny * ny + nz * nz) ** 0.5
    return (nx / m, ny / m, nz / m)


def _eixos(n):
    """Eixos de textura alinhados ao mundo, como o Hammer faz."""
    ax, ay, az = abs(n[0]), abs(n[1]), abs(n[2])
    if az >= ax and az >= ay:
        return (1.0, 0.0, 0.0), (0.0, -1.0, 0.0)
    if ax >= ay:
        return (0.0, 1.0, 0.0), (0.0, 0.0, -1.0)
    return (1.0, 0.0, 0.0), (0.0, 0.0, -1.0)


def _fmt(*v):
    return ' '.join(('%.4f' % x).rstrip('0').rstrip('.') if isinstance(x, float) else str(x) for x in v)


class Peca:
    """Um sólido convexo: vértices no mundo e faces (índices), uma textura por face."""

    def __init__(self, vertices, faces, materiais):
        self.vertices = vertices
        self.faces = faces
        self.materiais = materiais if isinstance(materiais, list) else [materiais] * len(faces)


def caixa(x0, x1, y0, y1, z0, z1, mat):
    x0, x1 = min(x0, x1), max(x0, x1)
    y0, y1 = min(y0, y1), max(y0, y1)
    z0, z1 = min(z0, z1), max(z0, z1)
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [[4, 5, 6, 7], [0, 3, 2, 1], [0, 1, 5, 4], [2, 3, 7, 6], [3, 0, 4, 7], [1, 2, 6, 5]]
    return Peca(v, f, mat)


def laje(x0, x1, y0, y1, z_inicio, z_fim, espessura, mat, ao_longo='x'):
    """Laje reta que sobe de z_inicio a z_fim ao longo de x (de x0 para x1) ou de y (de y0 para y1). z é o topo."""
    def z(x, y):
        t = (x - x0) / (x1 - x0) if ao_longo == 'x' else (y - y0) / (y1 - y0)
        return z_inicio + (z_fim - z_inicio) * t
    cantos = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    v = [(x, y, z(x, y) - espessura) for x, y in cantos] + [(x, y, z(x, y)) for x, y in cantos]
    f = [[4, 5, 6, 7], [0, 3, 2, 1], [0, 1, 5, 4], [2, 3, 7, 6], [3, 0, 4, 7], [1, 2, 6, 5]]
    return Peca(v, f, mat)


def cunha(xc, meia_largura, altura, y_alto, z_alto, y_baixo, z_baixo, mat):
    """Rampa de surf: prisma triangular com a crista descendo de (y_alto, z_alto) para (y_baixo, z_baixo)."""
    v = []
    for y, zc in ((y_alto, z_alto), (y_baixo, z_baixo)):
        v += [(xc - meia_largura, y, zc - altura), (xc + meia_largura, y, zc - altura), (xc, y, zc)]
    f = [[0, 1, 2], [3, 5, 4], [0, 3, 4, 1], [1, 4, 5, 2], [2, 5, 3, 0]]
    return Peca(v, f, mat)


def sala(x0, x1, y0, y1, z0, z1, esp, parede, teto, portas=()):
    """Sala oca: quatro paredes e teto. Portas: (lado, a0, a1, z_baixo, z_alto), lado em 'n','s','l','o'.
    a0/a1 são as coordenadas ao longo da parede (x para n/s, y para l/o)."""
    pecas = [caixa(x0, x1, y0, y1, z1, z1 + esp, teto)]
    lados = {
        's': (x0, x1, y0, y0 + esp, 'x'),
        'n': (x0, x1, y1 - esp, y1, 'x'),
        'o': (y0 + esp, y1 - esp, x0, x0 + esp, 'y'),
        'l': (y0 + esp, y1 - esp, x1 - esp, x1, 'y'),
    }
    for lado, (a, b, c, d, eixo) in lados.items():
        buracos = sorted([p[1:] for p in portas if p[0] == lado])
        trechos = []
        inicio = a
        for a0, a1, zb, za in buracos:
            trechos.append((inicio, a0, z0, z1))
            if zb > z0:
                trechos.append((a0, a1, z0, zb))
            if za < z1:
                trechos.append((a0, a1, za, z1))
            inicio = a1
        trechos.append((inicio, b, z0, z1))
        for p, q, zb, za in trechos:
            if q - p <= 0 or za - zb <= 0:
                continue
            if eixo == 'x':
                pecas.append(caixa(p, q, c, d, zb, za, parede))
            else:
                pecas.append(caixa(c, d, p, q, zb, za, parede))
    return pecas


def _fluxo(nome, padrao, tipo, dados, estado):
    return Elemento('CDmePolygonMeshDataStream', [
        ('id', 'elementid', novo_id()),
        ('name', 'string', nome),
        ('standardAttributeName', 'string', padrao),
        ('semanticName', 'string', nome.split(':')[0]),
        ('semanticIndex', 'int', '0'),
        ('vertexBufferLocation', 'int', '1' if nome.startswith('PerVertex') else '0'),
        ('dataStateFlags', 'int', str(estado)),
        ('subdivisionBinding', 'element', kv2.Ref('')),
        ('data', tipo, dados),
    ])


def _arranjo(tamanho, fluxos):
    return Elemento('CDmePolygonMeshDataArray', [
        ('id', 'elementid', novo_id()),
        ('size', 'int', str(tamanho)),
        ('streams', 'element_array', fluxos),
    ])


class Contador:
    def __init__(self, inicio=1000):
        self.n = inicio

    def proximo(self):
        self.n += 1
        return str(self.n)


def malha(peca, contador):
    """CMapMesh com a malha em meia-aresta. Faces viradas para fora (anti-horário visto de fora)."""
    cx = sum(p[0] for p in peca.vertices) / len(peca.vertices)
    cy = sum(p[1] for p in peca.vertices) / len(peca.vertices)
    cz = sum(p[2] for p in peca.vertices) / len(peca.vertices)
    centro = (cx, cy, cz)
    faces = []
    for f in peca.faces:
        pts = [peca.vertices[i] for i in f]
        n = _normal(pts)
        fc = tuple(sum(p[k] for p in pts) / len(pts) for k in range(3))
        if _ponto(n, _sub(fc, centro)) < 0:
            f = list(reversed(f))
        faces.append(f)

    materiais = sorted(set(peca.materiais))
    arestas = {}
    meia = []  # (origem, destino, face)
    for fi, f in enumerate(faces):
        for k in range(len(f)):
            a, b = f[k], f[(k + 1) % len(f)]
            chave = (min(a, b), max(a, b))
            if chave not in arestas:
                arestas[chave] = len(arestas)
            meia.append((a, b, fi))
    total = 2 * len(arestas)
    destino = [0] * total
    face_de = [-1] * total
    proxima = [0] * total
    indice = {}
    for a, b, fi in meia:
        e = arestas[(min(a, b), max(a, b))]
        h = 2 * e + (0 if a < b else 1)
        indice[(a, b)] = h
    for (a, b), h in indice.items():
        destino[h] = b
        destino[h ^ 1] = a
    for a, b, fi in meia:
        face_de[indice[(a, b)]] = fi
    for f in faces:
        for k in range(len(f)):
            a, b, c = f[k], f[(k + 1) % len(f)], f[(k + 2) % len(f)]
            proxima[indice[(a, b)]] = indice[(b, c)]
    assert len(indice) == total, 'malha aberta'
    sai_de = [0] * len(peca.vertices)
    for (a, b), h in indice.items():
        sai_de[a] = h

    uv, normais, tangentes = [], [], []
    for h in range(total):
        fi = face_de[h]
        pts = [peca.vertices[i] for i in faces[fi]]
        n = _normal(pts)
        u, v = _eixos(n)
        p = peca.vertices[destino[h]]
        uv.append(_fmt(_ponto(p, u) / TAMANHO_DA_TEXTURA, _ponto(p, v) / TAMANHO_DA_TEXTURA))
        normais.append(_fmt(*n))
        w = 1.0 if _ponto(_cruz(n, u), v) >= 0 else -1.0
        tangentes.append(_fmt(u[0], u[1], u[2], w))

    escala, eixo_u, eixo_v, indice_mat = [], [], [], []
    for fi, f in enumerate(faces):
        n = _normal([peca.vertices[i] for i in f])
        u, v = _eixos(n)
        escala.append('0.25 0.25')
        eixo_u.append(_fmt(u[0], u[1], u[2], 0))
        eixo_v.append(_fmt(v[0], v[1], v[2], 0))
        indice_mat.append(str(materiais.index(peca.materiais[fi])))

    dados = Elemento('CDmePolygonMesh', [
        ('id', 'elementid', novo_id()),
        ('name', 'string', 'meshData'),
        ('vertexEdgeIndices', 'int_array', [str(x) for x in sai_de]),
        ('vertexDataIndices', 'int_array', [str(i) for i in range(len(peca.vertices))]),
        ('edgeVertexIndices', 'int_array', [str(x) for x in destino]),
        ('edgeOppositeIndices', 'int_array', [str(h ^ 1) for h in range(total)]),
        ('edgeNextIndices', 'int_array', [str(x) for x in proxima]),
        ('edgeFaceIndices', 'int_array', [str(x) for x in face_de]),
        ('edgeDataIndices', 'int_array', [str(h // 2) for h in range(total)]),
        ('edgeVertexDataIndices', 'int_array', [str(h) for h in range(total)]),
        ('faceEdgeIndices', 'int_array', [str(indice[(f[0], f[1])]) for f in faces]),
        ('faceDataIndices', 'int_array', [str(i) for i in range(len(faces))]),
        ('materials', 'string_array', materiais),
        ('vertexData', 'CDmePolygonMeshDataArray', _arranjo(len(peca.vertices), [
            _fluxo('position:0', 'position', 'vector3_array', [_fmt(p[0] - cx, p[1] - cy, p[2] - cz) for p in peca.vertices], 3),
        ])),
        ('faceVertexData', 'CDmePolygonMeshDataArray', _arranjo(total, [
            _fluxo('texcoord:0', 'texcoord', 'vector2_array', uv, 1),
            _fluxo('normal:0', 'normal', 'vector3_array', normais, 1),
            _fluxo('tangent:0', 'tangent', 'vector4_array', tangentes, 1),
            _fluxo('PerVertexLighting:0', '', 'vector4_array', ['1 1 1 0'] * total, 1),
        ])),
        ('edgeData', 'CDmePolygonMeshDataArray', _arranjo(total // 2, [
            _fluxo('flags:0', 'flags', 'int_array', ['0'] * (total // 2), 3),
        ])),
        ('faceData', 'CDmePolygonMeshDataArray', _arranjo(len(faces), [
            _fluxo('textureScale:0', 'textureScale', 'vector2_array', escala, 0),
            _fluxo('textureAxisU:0', 'textureAxisU', 'vector4_array', eixo_u, 0),
            _fluxo('textureAxisV:0', 'textureAxisV', 'vector4_array', eixo_v, 0),
            _fluxo('materialindex:0', 'materialindex', 'int_array', indice_mat, 8),
            _fluxo('flags:0', 'flags', 'int_array', ['0'] * len(faces), 3),
            _fluxo('lightmapScaleBias:0', 'lightmapScaleBias', 'int_array', ['0'] * len(faces), 1),
        ])),
        ('subdivisionData', 'CDmePolygonMeshSubdivisionData', Elemento('CDmePolygonMeshSubdivisionData', [
            ('id', 'elementid', novo_id()),
            ('subdivisionLevels', 'int_array', []),
            ('streams', 'element_array', []),
        ])),
    ])

    return Elemento('CMapMesh', [
        ('id', 'elementid', novo_id()),
        ('nodeID', 'int', contador.proximo()),
        ('referenceID', 'uint64', novo_ref_id()),
        ('children', 'element_array', []),
        ('variableTargetKeys', 'string_array', []),
        ('variableNames', 'string_array', []),
        ('cubeMapName', 'string', ''),
        ('lightGroup', 'string', ''),
        ('visexclude', 'bool', '0'),
        ('disablemerging', 'bool', '0'),
        ('renderwithdynamic', 'bool', '0'),
        ('disableHeightDisplacement', 'bool', '0'),
        ('fademindist', 'float', '-1'),
        ('fademaxdist', 'float', '0'),
        ('bakelighting', 'bool', '1'),
        ('precomputelightprobes', 'bool', '1'),
        ('renderToCubemaps', 'bool', '1'),
        ('emissiveLightingEnabled', 'bool', '1'),
        ('emissiveLightingBoost', 'float', '1'),
        ('disableShadows', 'int', '0'),
        ('lightingDummy', 'bool', '0'),
        ('smoothingAngle', 'float', '40'),
        ('tintColor', 'color', '255 255 255 255'),
        ('renderAmt', 'int', '255'),
        ('physicsType', 'string', 'default'),
        ('physicsGroup', 'string', ''),
        ('physicsInteractsAs', 'string', ''),
        ('physicsInteractsWith', 'string', ''),
        ('physicsInteractsExclude', 'string', ''),
        ('meshData', 'CDmePolygonMesh', dados),
        ('physicsSimplificationOverride', 'bool', '0'),
        ('physicsSimplificationError', 'float', '0'),
        ('origin', 'vector3', _fmt(cx, cy, cz)),
        ('angles', 'qangle', '0 0 0'),
        ('scales', 'vector3', '1 1 1'),
        ('transformLocked', 'bool', '0'),
        ('force_hidden', 'bool', '0'),
        ('editorOnly', 'bool', '0'),
    ])
