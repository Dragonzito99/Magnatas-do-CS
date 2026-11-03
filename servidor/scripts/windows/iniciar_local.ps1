# Inicia o servidor de teste no PC, numa janela propria. O console fica nessa janela.
# Le GSLT e SV_PASSWORD de G:\Irmandade\cs2.env, que fica fora do repositorio.
# Uso: powershell -ExecutionPolicy Bypass -File iniciar_local.ps1
$ErrorActionPreference = 'Stop'

$raiz = 'G:\Irmandade'
$segredos = Join-Path $raiz 'cs2.env'
$servidor = Join-Path $raiz 'cs2'
$executavel = Join-Path $servidor 'game\bin\win64\cs2.exe'

if (-not (Test-Path -LiteralPath $segredos)) { throw "Crie $segredos com GSLT e SV_PASSWORD." }

$valores = @{}
Get-Content -LiteralPath $segredos | Where-Object { $_ -match '^\s*\w+\s*=' } | ForEach-Object {
    $partes = $_ -split '=', 2
    $valores[$partes[0].Trim()] = $partes[1].Trim()
}
foreach ($nome in 'GSLT', 'SV_PASSWORD') {
    if (-not $valores[$nome]) { throw "$segredos precisa definir $nome." }
}

$argumentos = @(
    '-dedicated', '-condebug', '-port', '27015',
    '+game_type', '0', '+game_mode', '1', '+map', 'de_mirage',
    '+sv_setsteamaccount', $valores['GSLT'], '+sv_password', $valores['SV_PASSWORD'],
    '+tv_enable', '1', '+tv_delay', '0', '+exec', 'server.cfg'
)
Start-Process -FilePath $executavel -ArgumentList $argumentos -WorkingDirectory (Split-Path $executavel)
Write-Output 'Servidor iniciado em uma janela propria. No CS2: password <senha> e connect 127.0.0.1:27015'
