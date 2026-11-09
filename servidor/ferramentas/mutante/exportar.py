import bpy, sys, os

# Pasta do boneco no pacote; cada versão do boneco tem a sua (ver LEIAME.md).
PASTA = os.environ.get('MUTANTE_PASTA', 'models/magnatas/mutante')

SAIDA = r'G:\Magnatas-ferramentas\zumbi\saida'
bpy.ops.wm.open_mainfile(filepath=os.path.join(SAIDA, 'mutante.blend'))
sys.path.append(r'G:\Magnatas-ferramentas\bst\BlenderSourceTools-master')
import io_scene_valvesource
io_scene_valvesource.register()

cena = bpy.context.scene
cena.vs.export_format = 'DMX'
cena.vs.engine_path = r'G:\Steam\steamapps\common\Counter-Strike Global Offensive\game\bin\win64'
cena.vs.dmx_encoding = '9'
cena.vs.dmx_format = '22'
cena.vs.export_path = SAIDA
corpo = bpy.data.objects['mutante_corpo']
# O material no DMX vira o caminho do vmat no pacote.
corpo.data.materials[0].name = 'mutante_corpo'
cena.vs.material_path = PASTA + '/materials/'
for o in bpy.data.objects:
    o.select_set(o.name == 'mutante_corpo')
bpy.context.view_layer.objects.active = corpo
resultado = bpy.ops.export_scene.smd(export_scene=False)
print('EXPORTOU', resultado, os.listdir(SAIDA))
