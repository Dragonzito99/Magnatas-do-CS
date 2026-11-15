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
cp -r "$ORIGEM/plugins/MagnatasDiversao" "$OBRA/codigo"
DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1 DOTNET_CLI_HOME="$OBRA/casa" \
  "$SDK/dotnet" build "$OBRA/codigo" -c Release -o "$OBRA/saida" -p:CssApi="$API" -v quiet --nologo
install -o "$USUARIO" -g "$USUARIO" -m 644 "$OBRA/saida/MagnatasDiversao.dll" "$CASA/bin/"
echo "Plugin compilado em $CASA/bin/MagnatasDiversao.dll."

# A Ilha Lemnos tem plugin próprio (15/11/2026): o iniciar_diversao.sh põe ele só no servidor da ilha.
cp -r "$ORIGEM/plugins/MagnatasLemnos" "$OBRA/lemnos"
DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1 DOTNET_CLI_HOME="$OBRA/casa"   "$SDK/dotnet" build "$OBRA/lemnos" -c Release -o "$OBRA/saida-lemnos" -p:CssApi="$API" -v quiet --nologo
install -o "$USUARIO" -g "$USUARIO" -m 644 "$OBRA/saida-lemnos/MagnatasLemnos.dll" "$CASA/bin/"
echo "Plugin da Ilha Lemnos compilado em $CASA/bin/MagnatasLemnos.dll."

# O servidor do competitivo só tem o MatchZy. Este plugin pequeno diz ao site quem já entrou na partida, porque o
# status do CS2 não mostra o SteamID. A pasta do competitivo não é refeita a cada início, então ele vai direto para lá.
cp -r "$ORIGEM/plugins/MagnatasLista" "$OBRA/lista"
DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1 DOTNET_CLI_HOME="$OBRA/casa"   "$SDK/dotnet" build "$OBRA/lista" -c Release -o "$OBRA/saida-lista" -p:CssApi="$API" -v quiet --nologo
PASTA_DA_LISTA=$CASA/server/game/csgo/addons/counterstrikesharp/plugins/MagnatasLista
install -d -o "$USUARIO" -g "$USUARIO" "$PASTA_DA_LISTA"
install -o "$USUARIO" -g "$USUARIO" -m 644 "$OBRA/saida-lista/MagnatasLista.dll" "$PASTA_DA_LISTA/"
echo "Plugin da lista instalado no servidor do competitivo."

# A Magnata Shop no chat (cor, etiqueta, aviso de entrada). Vai para o competitivo, e a Diversão copia os addons dele a
# cada início. A config leva o endereço do site e o token dos servidores, então só o usuário cs2 lê.
cp -r "$ORIGEM/plugins/MagnatasVisual" "$OBRA/visual"
DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1 DOTNET_CLI_HOME="$OBRA/casa" \
  "$SDK/dotnet" build "$OBRA/visual" -c Release -o "$OBRA/saida-visual" -p:CssApi="$API" -v quiet --nologo
PASTA_DO_VISUAL=$CASA/server/game/csgo/addons/counterstrikesharp/plugins/MagnatasVisual
install -d -o "$USUARIO" -g "$USUARIO" "$PASTA_DO_VISUAL"
install -o "$USUARIO" -g "$USUARIO" -m 644 "$OBRA/saida-visual/MagnatasVisual.dll" "$PASTA_DO_VISUAL/"
CONFIG_DO_VISUAL=$CASA/server/game/csgo/addons/counterstrikesharp/configs/plugins/MagnatasVisual
install -d -o "$USUARIO" -g "$USUARIO" "$CONFIG_DO_VISUAL"
SITE_URL=""
SERVIDOR_TOKEN=""
# shellcheck disable=SC1091
[ -f "$CASA/cs2.env" ] && source "$CASA/cs2.env"
install -o "$USUARIO" -g "$USUARIO" -m 600 /dev/null "$CONFIG_DO_VISUAL/MagnatasVisual.json"
chmod 600 "$CONFIG_DO_VISUAL/MagnatasVisual.json"
printf '{ "SiteUrl": "%s", "Token": "%s", "ConfigVersion": 1 }\n' "$SITE_URL" "$SERVIDOR_TOKEN" > "$CONFIG_DO_VISUAL/MagnatasVisual.json"
echo "Plugin do visual da loja instalado no servidor do competitivo."
