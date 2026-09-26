#!/bin/bash
set -euo pipefail

PROFILE="${1:-}"

case "$PROFILE" in
  development|preview|release|nightly) EXTENSION=apk ;;
  production) EXTENSION=aab ;;
  *) echo "Usage: $0 <development|preview|release|nightly|production> [output]" >&2; exit 1 ;;
esac
OUTPUT="${2:-lunar-${PROFILE}.${EXTENSION}}"
EAS_CLI_VERSION=21.8.0

: "${EXPO_TOKEN:?EXPO_TOKEN must be provided by the build environment}"

SYSTEM_PACKAGES=()
command -v javac >/dev/null 2>&1 || SYSTEM_PACKAGES+=(openjdk-17-jdk-headless)
command -v unzip >/dev/null 2>&1 || SYSTEM_PACKAGES+=(unzip)
command -v wget >/dev/null 2>&1 || SYSTEM_PACKAGES+=(wget)
command -v curl >/dev/null 2>&1 || SYSTEM_PACKAGES+=(curl)
command -v git >/dev/null 2>&1 || SYSTEM_PACKAGES+=(git)
command -v cc >/dev/null 2>&1 || SYSTEM_PACKAGES+=(build-essential)

if (( ${#SYSTEM_PACKAGES[@]} > 0 )); then
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "apt-get is required to install the CNB build dependencies." >&2
    exit 1
  fi
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends "${SYSTEM_PACKAGES[@]}"
fi

for command_name in java javac node unzip wget curl git; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "$command_name is required in the CNB build image." >&2
    exit 1
  fi
done

JAVAC_BIN="$(command -v javac)"
export JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$JAVAC_BIN")")")"

java -version
node --version

export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

if ! command -v sdkmanager >/dev/null 2>&1; then
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  wget "https://dl.google.com/android/repository/commandlinetools-linux-15859902_latest.zip" \
    -O /tmp/tools.zip
  rm -rf "$ANDROID_HOME/cmdline-tools/latest"
  unzip -q /tmp/tools.zip -d "$ANDROID_HOME/cmdline-tools"
  mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -f /tmp/tools.zip
fi

if ! command -v sdkmanager >/dev/null 2>&1; then
  echo "Unable to find sdkmanager under $ANDROID_HOME." >&2
  exit 1
fi

if [[ ! -d "$ANDROID_HOME/platforms/android-36" || ! -d "$ANDROID_HOME/ndk/27.1.12297006" || ! -d "$ANDROID_HOME/build-tools/36.0.0" || ! -d "$ANDROID_HOME/cmake/3.30.5" || ! -d "$ANDROID_HOME/platform-tools" ]]; then
  yes | sdkmanager --licenses || true
  sdkmanager \
    "platform-tools" \
    "platforms;android-36" \
    "build-tools;36.0.0" \
    "ndk;27.1.12297006" \
    "cmake;3.30.5"
fi

if command -v corepack >/dev/null 2>&1; then
  corepack enable
  corepack prepare pnpm@11.24.0 --activate
elif ! command -v pnpm >/dev/null 2>&1; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "pnpm or npm is required in the CNB build image." >&2
    exit 1
  fi
  npm install --global pnpm@11.24.0
fi

pnpm install --frozen-lockfile

if [[ "$PROFILE" == release || "$PROFILE" == nightly ]]; then
  pnpm run check
  pnpm run test:release
  EXPO_OFFLINE=1 pnpm run check:expo
  export RITO_FFI_REBUILD=1
fi

rm -rf "${TMPDIR:-/tmp}/metro-cache" "${TMPDIR:-/tmp}"/haste-map-*

mkdir -p "$(dirname "$OUTPUT")"
pnpm dlx "eas-cli@$EAS_CLI_VERSION" build \
  --profile "$PROFILE" \
  --platform android \
  --local \
  --non-interactive \
  --output "$OUTPUT"

test -s "$OUTPUT"
if [[ "$EXTENSION" == apk ]]; then
  "$ANDROID_HOME/build-tools/36.0.0/apksigner" verify "$OUTPUT"
fi
