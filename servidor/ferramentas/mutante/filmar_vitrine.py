"""Filma o mutante andando no lugar, sem fundo, para a vitrine da Magnata Shop.

Uso: blender -b --python filmar_vitrine.py -- "<personagem.fbx>" "<fbx com a animação de andar>" "<pasta de saída>"
Depois o ffmpeg junta os quadros num webp animado. A animação pode vir de outro boneco do Meshy: passa pelos nomes dos
ossos do Mixamo, como a queda do nível 3 do mutante comum.
"""
import bpy, math, mathutils, os, sys

PERSONAGEM, ANIMACAO, SAIDA = sys.argv[sys.argv.index('--') + 1:][:3]
NOME_DA_ACAO = os.environ.get('VITRINE_ACAO', 'Walking')
PASSO = 2  # a animação é de 60 quadros por segundo; um sim, um não dá 30


def curvas(acao):
    if getattr(acao, 'fcurves', None):
        return list(acao.fcurves)
    lista = []
    for camada in getattr(acao, 'layers', []):
        for faixa in camada.strips:
            for slot in acao.slots:
                saco = faixa.channelbag(slot)
                if saco:
                    lista.extend(saco.fcurves)
    return lista


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=PERSONAGEM)
armadura = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
malhas = [o for o in bpy.data.objects if o.type == 'MESH']
proprias = set(bpy.data.actions)
antes = set(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath=ANIMACAO)
acao = next(a for a in bpy.data.actions if a not in proprias and NOME_DA_ACAO in a.name)
for o in [o for o in bpy.data.objects if o not in antes]:
    bpy.data.objects.remove(o)
armadura.animation_data_create().action = acao
if hasattr(armadura.animation_data, 'action_slot') and acao.slots:
    armadura.animation_data.action_slot = acao.slots[0]

# Anda no lugar: o eixo do quadril que avança muito (o caminho) fica parado; o sobe e desce do passo continua.
for curva in curvas(acao):
    if 'Hips' in curva.data_path and curva.data_path.endswith('location') and len(curva.keyframe_points) > 1:
        valores = [ponto.co[1] for ponto in curva.keyframe_points]
        if max(valores) - min(valores) > 20:
            for ponto in curva.keyframe_points:
                ponto.co[1] = valores[0]
                ponto.handle_left[1] = valores[0]
                ponto.handle_right[1] = valores[0]

cena = bpy.context.scene
cena.render.engine = 'BLENDER_WORKBENCH'
cena.display.shading.light = 'STUDIO'
cena.display.shading.color_type = 'TEXTURE'
cena.render.film_transparent = True
cena.render.resolution_x = 360
cena.render.resolution_y = 450
inicio, fim = (int(x) for x in acao.frame_range)

# Enquadra pelo tamanho do boneco parado, de três quartos, um pouco de cima.
cena.frame_set(inicio)
dg = bpy.context.evaluated_depsgraph_get()
pontos = [o.matrix_world @ v.co for o in malhas for v in o.evaluated_get(dg).to_mesh().vertices]
baixo = mathutils.Vector((min(p.x for p in pontos), min(p.y for p in pontos), min(p.z for p in pontos)))
alto = mathutils.Vector((max(p.x for p in pontos), max(p.y for p in pontos), max(p.z for p in pontos)))
centro = (baixo + alto) / 2
altura = alto.z - baixo.z
cam_dados = bpy.data.cameras.new('cam')
cam_dados.type = 'ORTHO'
cam_dados.ortho_scale = altura * 1.25
cam = bpy.data.objects.new('cam', cam_dados)
cena.collection.objects.link(cam)
cena.camera = cam
direcao = mathutils.Vector((math.sin(math.radians(30)), -math.cos(math.radians(30)), 0.15)).normalized()
cam.location = centro + direcao * altura * 3
cam.rotation_euler = (centro - cam.location).to_track_quat('-Z', 'Y').to_euler()

os.makedirs(SAIDA, exist_ok=True)
for numero, quadro in enumerate(range(inicio, fim, PASSO)):
    cena.frame_set(quadro)
    cena.render.filepath = os.path.join(SAIDA, f'q{numero:03d}.png')
    bpy.ops.render.render(write_still=True)
print('QUADROS', len(range(inicio, fim, PASSO)), 'ALTURA', round(altura, 2))
