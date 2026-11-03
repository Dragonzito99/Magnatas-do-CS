# Inicia o servidor de teste no PC, numa janela propria e minimizada.
# GSLT e SV_PASSWORD sao opcionais no PC e ficam em G:\Irmandade\cs2.env, fora do repositorio.
# Com o Metamod ativo, o console.log fica em game\csgo\addons\metamod\.
# Uso: powershell -ExecutionPolicy Bypass -File iniciar_local.ps1
$ErrorActionPreference = 'Stop'

$raiz = 'G:\Irmandade'
$segredos = Join-Path $raiz 'cs2.env'
$executavel = Join-Path $raiz 'cs2\game\bin\win64\cs2.exe'

$valores = @{}
if (Test-Path -LiteralPath $segredos) {
    Get-Content -LiteralPath $segredos | Where-Object { $_ -match '^\s*\w+\s*=' } | ForEach-Object {
        $partes = $_ -split '=', 2
        $valores[$partes[0].Trim()] = $partes[1].Trim()
    }
}

$argumentos = @(
    '-dedicated', '-condebug', '-port', '27015',
    '+game_type', '0', '+game_mode', '1', '+map', 'de_mirage', '+sv_lan', '0',
    '+tv_enable', '1', '+tv_delay', '0', '+exec', 'server.cfg'
)
if ($valores['GSLT']) { $argumentos += '+sv_setsteamaccount', $valores['GSLT'] }
if ($valores['SV_PASSWORD']) { $argumentos += '+sv_password', $valores['SV_PASSWORD'] }

$processo = Start-Process -FilePath $executavel -ArgumentList $argumentos -WorkingDirectory (Split-Path $executavel) -WindowStyle Minimized -PassThru
Write-Output "Servidor iniciado (processo $($processo.Id)). No CS2: connect 127.0.0.1:27015"
