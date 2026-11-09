"""Grava o guerreiro com a animação de morte do Meshy (esqueleto Mixamo) em FBX, na pasta do pacote, para o modelo de cena.

Uso: blender -b --python exportar_morte.py -- "<arquivo animado.fbx>"  (MUTANTE_ANIMACAO=<fbx> usa a queda de outro boneco)
Depois: python montar_morte.py e compilar models/magnatas/mutante/morte/guerreiro_morte.vmdl.

O DMX do Blender Source Tools estragava a animação desse esqueleto (o corpo esticava); o compilador do CS2 lê o FBX
direto e acerta. O modelo de cena tem esqueleto próprio: não é o boneco do jogador, só toca a queda no lugar do corpo.
"""
import bpy, sys, os, mathutils

ORIGEM = sys.argv[sys.argv.index('--') + 1]
ADDON = os.environ.get('MUTANTE_ADDON', 'magnatas_sons')
PASTA = os.environ.get('MUTANTE_PASTA', 'models/magnatas/mutante')
DESTINO = os.path.join(r'G:\Steam\steamapps\common\Counter-Strike Global Offensive\content\csgo_addons', ADDON, *PASTA.split('/'), 'morte', 'guerreiro_morte.fbx')
# Mesma altura do boneco do mutante no jogo (75 polegadas).
ALTURA = 75.0
# O FBX sai em centímetros e o compilador lê cada centímetro como uma unidade do jogo, sem converter: 100 por metro.
# Conferido nos limites do modelo compilado (m_vMaxBounds): com 39,37 a queda saiu com 190,5 de altura, 2,54 vezes
# o boneco do jogador (74); com 366,5 a da v1 saiu pequena.
UNIDADES_POR_METRO = 100.0

# Boneco sem animação de morte própria (o nível 3): MUTANTE_ANIMACAO aponta para o FBX de outro boneco do Meshy, e a
# queda dele passa para este pelos nomes dos ossos do Mixamo. Ossos que só um deles tem ficam parados.
ANIMACAO = os.environ.get('MUTANTE_ANIMACAO')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=ORIGEM)
malha = next(o for o in bpy.data.objects if o.type == 'MESH')
if ANIMACAO:
    proprias = set(bpy.data.actions)
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=ANIMACAO)
    acao = next(a for a in bpy.data.actions if a not in proprias)
    for o in [o for o in bpy.data.objects if o not in antes]:
        bpy.data.objects.remove(o)
    base = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    base.animation_data_create().action = acao
    if hasattr(base.animation_data, 'action_slot') and acao.slots:
        base.animation_data.action_slot = acao.slots[0]
    for a in proprias:
        bpy.data.actions.remove(a)
    ossos = {b.name for b in base.data.bones}
    print('OSSOS DA QUEDA', sum(1 for nome in {f.data_path.split('"')[1] for f in getattr(acao, 'fcurves', []) if '"' in f.data_path} if nome in ossos))
else:
    acao = bpy.data.actions[0]
acao.name = 'morte'
# O compilador troca este nome pelo material do mutante (o remap fica no vmdl).
malha.data.materials[0].name = 'mutante_corpo'

# Altura em pé, na pose de descanso: algumas animações começam agachadas (a "Dead" do nível 2).
armadura = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
armadura.data.pose_position = 'REST'
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
pontos = [malha.matrix_world @ v.co for v in malha.evaluated_get(dg).to_mesh().vertices]
altura = max(p.z for p in pontos) - min(p.z for p in pontos)
escala = ALTURA / (altura * UNIDADES_POR_METRO)
armadura.data.pose_position = 'POSE'
bpy.context.view_layer.update()

os.makedirs(os.path.dirname(DESTINO), exist_ok=True)
bpy.ops.export_scene.fbx(filepath=DESTINO, global_scale=escala, bake_anim=True, bake_anim_use_all_actions=False,
                         bake_anim_use_nla_strips=False, add_leaf_bones=False, embed_textures=False, path_mode='STRIP')
print('ALTURA_BLENDER', round(altura, 3), 'ESCALA', round(escala, 4), 'FBX', os.path.getsize(DESTINO))
