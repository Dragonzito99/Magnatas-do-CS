"""Grava o guerreiro com a animação de morte do Meshy (esqueleto Mixamo) em FBX, na pasta do pacote, para o modelo de cena.

Uso: blender -b --python exportar_morte.py -- "<arquivo animado.fbx>"
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
# O FBX sai em centímetros e o compilador converte para polegadas, a unidade do jogo: 39,37 por metro.
# (A medida de 366,5 vinha de uma conferência errada e deixou a queda da v1 com uns 10% do tamanho.)
UNIDADES_POR_METRO = 39.37

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=ORIGEM)
malha = next(o for o in bpy.data.objects if o.type == 'MESH')
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
