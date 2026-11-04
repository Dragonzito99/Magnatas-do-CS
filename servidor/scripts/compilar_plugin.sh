#!/usr/bin/env bash
# Compila o plugin que entrega a AK no modo Cada um por si e deixa o resultado em /home/cs2/bin.
# Precisa do CounterStrikeSharp já instalado. O .NET SDK é baixado só na primeira vez.
# Uso: sudo bash compilar_plugin.sh
set -euo pipefail

USUARIO=cs2
CASA=/home/$USUARIO
ORIGEM="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API=$CASA/server/game/csgo/addons/counterstrikesharp/api
SDK=/opt/dotnet-sdk
VERSAO=10.0.403
SHA512=b7b3d8461cf98b07d2552ce9199702fa3ad010ac2671a5f8cd5136f7534e50f6855ba7bbb02b11494563f1d04156276a31cda1103b900e5eecd0d9473dc7b9c5

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode com sudo." >&2
  exit 1
fi

if [ ! -f "$API/CounterStrikeSharp.API.dll" ]; then
  echo "Instale o CounterStrikeSharp antes de compilar o plugin." >&2
  exit 1
fi

OBRA=$(mktemp -d)
trap 'rm -rf "$OBRA"' EXIT

if [ "$("$SDK/dotnet" --version 2>/dev/null || true)" != "$VERSAO" ]; then
  curl -fsSL -o "$OBRA/sdk.tar.gz" "https://builds.dotnet.microsoft.com/dotnet/Sdk/$VERSAO/dotnet-sdk-$VERSAO-linux-x64.tar.gz"
  echo "$SHA512  $OBRA/sdk.tar.gz" | sha512sum -c --quiet -
  rm -rf "$SDK"
  mkdir -p "$SDK"
  tar -xzf "$OBRA/sdk.tar.gz" -C "$SDK"
  rm -f "$OBRA/sdk.tar.gz"
fi

# Compila em uma pasta temporária para não deixar arquivos gerados junto do código.
cp -r "$ORIGEM/plugins/MagnatasMataMata" "$OBRA/codigo"
DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1 DOTNET_CLI_HOME="$OBRA/casa" \
  "$SDK/dotnet" build "$OBRA/codigo" -c Release -o "$OBRA/saida" -p:CssApi="$API" -v quiet --nologo
install -o "$USUARIO" -g "$USUARIO" -m 644 "$OBRA/saida/MagnatasMataMata.dll" "$CASA/bin/"
echo "Plugin compilado em $CASA/bin/MagnatasMataMata.dll."
