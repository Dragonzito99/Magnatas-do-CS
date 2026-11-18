"""Leitura e escrita do formato de texto do Hammer (DMX keyvalues2), usado para gerar o .vmap por programa."""
import random
import uuid


class Elemento:
    def __init__(self, classe, atributos=None):
        self.classe = classe
        # Lista de (nome, tipo, valor). Valor: str, Elemento, Ref, ou lista (para *_array).
        self.atributos = atributos if atributos is not None else []

    def get(self, nome, padrao=None):
        for n, _t, v in self.atributos:
            if n == nome:
                return v
        return padrao

    def set(self, nome, tipo, valor):
        for i, (n, _t, _v) in enumerate(self.atributos):
            if n == nome:
                self.atributos[i] = (nome, tipo, valor)
                return
        self.atributos.append((nome, tipo, valor))

    @property
    def id(self):
        return self.get('id')


class Ref:
    def __init__(self, alvo):
        self.alvo = alvo


def novo_id():
    return str(uuid.uuid4())


def novo_ref_id():
    return '0x%016x' % random.getrandbits(64)


def _tokens(texto):
    i, n = 0, len(texto)
    while i < n:
        c = texto[i]
        if c in ' \t\r\n,':
            i += 1
        elif c == '<' and texto.startswith('<!--', i):
            i = texto.index('-->', i) + 3
        elif c in '{}[]':
            yield c
            i += 1
        elif c == '"':
            j = i + 1
            partes = []
            while texto[j] != '"':
                if texto[j] == '\\':
                    partes.append(texto[j:j + 2])
                    j += 2
                else:
                    partes.append(texto[j])
                    j += 1
            yield ('s', ''.join(partes))
            i = j + 1
        else:
            raise ValueError('caractere inesperado %r na posição %d' % (c, i))


def ler(texto):
    """Devolve a lista de elementos do topo do arquivo."""
    toks = list(_tokens(texto))
    pos = 0

    def proximo():
        nonlocal pos
        t = toks[pos]
        pos += 1
        return t

    def elemento(classe):
        assert proximo() == '{'
        el = Elemento(classe)
        while toks[pos] != '}':
            nome = proximo()[1]
            tipo = proximo()[1]
            if toks[pos] == '{':
                el.atributos.append((nome, tipo, elemento(tipo)))
            elif toks[pos] == '[':
                proximo()
                itens = []
                while toks[pos] != ']':
                    v = proximo()[1]
                    if tipo == 'element_array':
                        if toks[pos] == '{':
                            itens.append(elemento(v))
                        else:
                            assert v == 'element', v
                            itens.append(Ref(proximo()[1]))
                    else:
                        itens.append(v)
                proximo()
                el.atributos.append((nome, tipo, itens))
            else:
                v = proximo()[1]
                el.atributos.append((nome, tipo, Ref(v) if tipo == 'element' else v))
        proximo()
        return el

    topo = []
    while pos < len(toks):
        classe = proximo()[1]
        topo.append(elemento(classe))
    return topo


def indexar(topo):
    """Mapa id -> elemento de tudo o que está escrito por extenso no arquivo."""
    mapa = {}

    def andar(el):
        if el.id:
            mapa[el.id] = el
        for _n, _t, v in el.atributos:
            if isinstance(v, Elemento):
                andar(v)
            elif isinstance(v, list):
                for x in v:
                    if isinstance(x, Elemento):
                        andar(x)

    for el in topo:
        andar(el)
    return mapa


def escrever(topo, cabecalho):
    linhas = [cabecalho]

    def esc(el, nivel):
        tab = '\t' * nivel
        linhas.append(tab + '{')
        for nome, tipo, v in el.atributos:
            t2 = '\t' * (nivel + 1)
            if isinstance(v, Elemento):
                linhas.append('%s"%s" "%s"' % (t2, nome, tipo))
                esc(v, nivel + 1)
                linhas.append('')
            elif isinstance(v, list):
                linhas.append('%s"%s" "%s" ' % (t2, nome, tipo))
                linhas.append(t2 + '[')
                t3 = '\t' * (nivel + 2)
                for k, x in enumerate(v):
                    fim = ',' if k < len(v) - 1 else ''
                    if isinstance(x, Elemento):
                        linhas.append('%s"%s"' % (t3, x.classe))
                        esc(x, nivel + 2)
                        if fim:
                            linhas[-1] += ','
                    elif isinstance(x, Ref):
                        linhas.append('%s"element" "%s"%s' % (t3, x.alvo, fim))
                    else:
                        linhas.append('%s"%s"%s' % (t3, x, fim))
                linhas.append(t2 + ']')
            elif isinstance(v, Ref):
                linhas.append('%s"%s" "element" "%s"' % (t2, nome, v.alvo))
            else:
                linhas.append('%s"%s" "%s" "%s"' % (t2, nome, tipo, v))
        linhas.append(tab + '}')

    for el in topo:
        linhas.append('"%s"' % el.classe)
        esc(el, 0)
        linhas.append('')
    return '\n'.join(linhas) + '\n'
