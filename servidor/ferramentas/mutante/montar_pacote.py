"""Monta o boneco do mutante no pacote magnatas_sons, a partir do boneco do SAS (esqueleto, animações, acertos)."""
import os, shutil, re

REF = r'G:\Magnatas-ferramentas\cs2ref\agents\models\ctm_sas'
SAIDA = r'G:\Magnatas-ferramentas\zumbi\saida'
# Cada versão do boneco vai num pacote da Oficina próprio e numa pasta própria (ver LEIAME.md).
ADDON = os.path.join(r'G:\Steam\steamapps\common\Counter-Strike Global Offensive\content\csgo_addons', os.environ.get('MUTANTE_ADDON', 'magnatas_sons'))
PASTA = os.environ.get('MUTANTE_PASTA', 'models/magnatas/mutante')
DESTINO = os.path.join(ADDON, *PASTA.split('/'))
os.makedirs(os.path.join(DESTINO, 'materials'), exist_ok=True)

# Corpo do zumbi e as texturas.
shutil.copy(os.path.join(SAIDA, 'mutante_corpo.dmx'), DESTINO)
# O Blender às vezes grava o JPG embutido com nome de PNG, e o compilador recusa. O ffmpeg regrava como PNG de verdade.
# O nome do material muda de um modelo do Meshy para outro (Material_0, BakedMaterial), e nem todo modelo traz o normal.
import subprocess
TIPOS = ('baseColor', 'normal', 'roughness', 'metallic')
achadas = {tipo: next((f for f in os.listdir(SAIDA) if f.endswith(f'_{tipo}.png')), None) for tipo in TIPOS}
assert achadas['baseColor'], 'sem a textura de cor'
for tipo in TIPOS:
    destino = os.path.join(DESTINO, 'materials', f'mutante_{tipo}.png')
    if achadas[tipo] is None:
        if os.path.exists(destino):
            os.remove(destino)
        print('SEM TEXTURA', tipo)
        continue
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(SAIDA, achadas[tipo]), '-pix_fmt', 'gray' if tipo in ('roughness', 'metallic') else 'rgb24',
                    destino], check=True)

# Braços de primeira pessoa, kit e animações de ferramenta continuam os do SAS.
COPIAS = {
    'ctm_sas_firstperson_default_gloves_arms2.dmx': 'mutante_braco_primeira_pessoa.dmx',
    'ctm_sas_firstperson_sleeves3.dmx': 'mutante_manga_primeira_pessoa.dmx',
    'ctm_sas_defusekit4.dmx': 'mutante_kit.dmx',
    'ctm_sas_tools_preview.dmx': 'mutante_tools_preview.dmx',
    'ctm_sas_eye_test.dmx': 'mutante_eye_test.dmx',
}
for de, para in COPIAS.items():
    shutil.copy(os.path.join(REF, de), os.path.join(DESTINO, para))

with open(os.path.join(DESTINO, 'materials', 'mutante_corpo.vmat'), 'w', encoding='utf-8', newline='\n') as arquivo:
    normal = f'\tTextureNormal "{PASTA}/materials/mutante_normal.png"\n' if achadas['normal'] else ''
    arquivo.write(f'''// Material do mutante, no mesmo shader dos bonecos do CS2.
Layer0
{{
	shader "csgo_character.vfx"
	F_SUPPORTS_DECALS 1
	g_flModelTintAmount "1.000"
	g_vColorTint "[1.000000 1.000000 1.000000 0.000000]"
	TextureColor "{PASTA}/materials/mutante_baseColor.png"
{normal}	TextureRoughness "{PASTA}/materials/mutante_roughness.png"
	TextureMetalness "{PASTA}/materials/mutante_metallic.png"
	TextureAmbientOcclusion "materials/default/default_ao.tga"
	TextureBloodMask "materials/default/default_mask.tga"
}}
''')

t = open(os.path.join(REF, 'ctm_sas.vmdl'), encoding='utf-8').read()
# Sem as luvas do SAS na terceira pessoa: o zumbi tem as próprias mãos.
luvas = '''					{
						_class = "RenderMeshFile"
						name = "thirdperson_default_gloves"
						filename = "agents/models/ctm_sas/ctm_sas_thirdperson_default_gloves1.dmx"
					},
'''
assert luvas in t
t = t.replace(luvas, '')
escolha = '''									"thirdperson_body",
									"thirdperson_default_gloves",
'''
assert escolha in t
t = t.replace(escolha, '''									"thirdperson_body",
''')
t = t.replace('agents/models/ctm_sas/ctm_sas_thirdperson_body.dmx', f'{PASTA}/mutante_corpo.dmx')
for de, para in COPIAS.items():
    t = t.replace(f'agents/models/ctm_sas/{de}', f'{PASTA}/{para}')
assert 'ctm_sas' not in t, re.findall(r'.*ctm_sas.*', t)
with open(os.path.join(DESTINO, 'mutante.vmdl'), 'w', encoding='utf-8', newline='\n') as arquivo:
    arquivo.write(t)
print('pronto', sorted(os.listdir(DESTINO)))
