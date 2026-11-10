"""Grava os gestos de um personagem do Meshy (dança, flexão, mortal...) em FBX, um por gesto, para o modelo de cena.

Uso: blender -b --python exportar_gestos.py -- "<fbx animado>" danca=All_Night_Dance flexao=push_up mortal=Backflip_Jump
Depois: python montar_gestos.py danca flexao mortal e compilar <MUTANTE_PASTA>/gestos/gestos.vmdl.

Como a queda do mutante (exportar_morte.py): o modelo de cena tem o esqueleto do Mixamo e o compilador lê o FBX direto.
O plugin esconde o jogador e põe este modelo no lugar dele tocando o gesto.
"""
import bpy, sys, os

argumentos = sys.argv[sys.argv.index('--') + 1:]
ORIGEM = argumentos[0]
GESTOS = dict(par.split('=', 1) for par in argumentos[1:])
ADDON = os.environ.get('MUTANTE_ADDON', 'magnatas_personagens')
PASTA = os.environ.get('MUTANTE_PASTA', 'models/magnatas/adm_v1')
DESTINO = os.path.join(r'G:\Steam\steamapps\common\Counter-Strike Global Offensive\content\csgo_addons', ADDON, *PASTA.split('/'), 'gestos')
# Mesma altura e mesma conta de unidades da queda do mutante (ver exportar_morte.py).
ALTURA = 75.0
UNIDADES_POR_METRO = 100.0

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=ORIGEM)
malha = next(o for o in bpy.data.objects if o.type == 'MESH')
armadura = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
# O compilador troca este nome pelo material do corpo (o remap fica no vmdl).
malha.data.materials[0].name = 'mutante_corpo'

armadura.data.pose_position = 'REST'
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
pontos = [malha.matrix_world @ v.co for v in malha.evaluated_get(dg).to_mesh().vertices]
altura = max(p.z for p in pontos) - min(p.z for p in pontos)
escala = ALTURA / (altura * UNIDADES_POR_METRO)
armadura.data.pose_position = 'POSE'

os.makedirs(DESTINO, exist_ok=True)
# Só o primeiro gesto leva o corpo (é a malha do modelo); os outros levam só os ossos, para o pacote não pesar à toa.
for numero, (gesto, trecho) in enumerate(GESTOS.items()):
    acao = next(a for a in bpy.data.actions if f'|{trecho}|' in a.name)
    armadura.animation_data_create().action = acao
    if hasattr(armadura.animation_data, 'action_slot') and acao.slots:
        armadura.animation_data.action_slot = acao.slots[0]
    inicio, fim = (int(x) for x in acao.frame_range)
    cena = bpy.context.scene
    cena.frame_start, cena.frame_end = inicio, fim
    bpy.context.view_layer.update()
    arquivo = os.path.join(DESTINO, f'{gesto}.fbx')
    tipos = {'ARMATURE', 'MESH'} if numero == 0 else {'ARMATURE'}
    bpy.ops.export_scene.fbx(filepath=arquivo, global_scale=escala, bake_anim=True, bake_anim_use_all_actions=False,
                             bake_anim_use_nla_strips=False, add_leaf_bones=False, embed_textures=False, path_mode='STRIP',
                             object_types=tipos)
    print('GESTO', gesto, acao.name, 'quadros', fim - inicio + 1, 'segundos', round((fim - inicio + 1) / cena.render.fps, 2), os.path.getsize(arquivo))
print('ESCALA', round(escala, 4))
