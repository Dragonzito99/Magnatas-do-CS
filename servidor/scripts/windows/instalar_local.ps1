# Instala uma copia separada do servidor de CS2 no PC, para testes locais.
# Copia os arquivos do CS2 da Steam, sem altera-lo, e a SteamCMD acerta as diferencas.
# Pode rodar de novo sem quebrar nada.
# Uso: powershell -ExecutionPolicy Bypass -File instalar_local.ps1
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$raiz = 'G:\Irmandade'
$origem = 'G:\Steam\steamapps\common\Counter-Strike Global Offensive'
$destino = Join-Path $raiz 'cs2'
$pastaSteamCmd = Join-Path $raiz 'steamcmd'
$steamCmd = Join-Path $pastaSteamCmd 'steamcmd.exe'
$config = Join-Path $PSScriptRoot '..\..\config\server.cfg'

if (-not (Test-Path -LiteralPath $origem)) { throw "CS2 da Steam nao encontrado em $origem" }
New-Item -ItemType Directory -Force -Path $raiz, $destino, $pastaSteamCmd | Out-Null

Write-Output "[1/3] Copiando o CS2 para $destino"
& robocopy $origem $destino /E /XO /MT:8 /R:1 /W:1 /NFL /NDL /NP /NJH
if ($LASTEXITCODE -ge 8) { throw "A copia falhou com o codigo $LASTEXITCODE" }

if (-not (Test-Path -LiteralPath $steamCmd)) {
    Write-Output '[2/3] Baixando a SteamCMD da Valve'
    $zip = Join-Path $pastaSteamCmd 'steamcmd.zip'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip' -OutFile $zip
    Expand-Archive -LiteralPath $zip -DestinationPath $pastaSteamCmd -Force
    Remove-Item -LiteralPath $zip
}

Write-Output '[3/3] Acertando as diferencas com a SteamCMD'
& $steamCmd +quit | Out-Null
& $steamCmd +force_install_dir $destino +login anonymous +app_update 730 validate +quit
if ($LASTEXITCODE -ne 0) { throw "A SteamCMD terminou com o codigo $LASTEXITCODE" }

Copy-Item -LiteralPath $config -Destination (Join-Path $destino 'game\csgo\cfg\server.cfg') -Force
Write-Output "Servidor pronto em $destino"
