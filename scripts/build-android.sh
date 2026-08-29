#!/bin/bash
set -euo pipefail

PROFILE="${1:-}"

if [[ -z "$PROFILE" ]]; then
  echo "Usage: $0 <profile>" >&2
  exit 1
fi

: "${EXPO_TOKEN:?EXPO_TOKEN must be provided by the CNB secret import}"

PKGS=""
for cmd in unzip:unzip wget:wget; do
  command -v "${cmd%%:*}" >/dev/null 2>&1 || PKGS+=" ${cmd##*:}"
done
if [[ -n "$PKGS" ]]; then
  apt-get update
  apt-get install -y $PKGS
fi

export SDKMAN_DIR="${SDKMAN_DIR:-$HOME/.sdkman}"
if [[ -s "$SDKMAN_DIR/bin/sdkman-init.sh" ]]; then
  # shellcheck disable=SC1090
  . "$SDKMAN_DIR/bin/sdkman-init.sh"
fi

if ! command -v java >/dev/null 2>&1; then
  if [[ ! -s "$SDKMAN_DIR/bin/sdkman-init.sh" ]]; then
    curl -s "https://get.sdkman.io" | bash
    # shellcheck disable=SC1090
    . "$SDKMAN_DIR/bin/sdkman-init.sh"
  fi
  sdk install java 21.0.7-tem
  export JAVA_HOME="$SDKMAN_DIR/candidates/java/current"
  export PATH="$JAVA_HOME/bin:$PATH"
else
  java -version
fi

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/refs/heads/master/install.sh | bash
fi
# shellcheck disable=SC1090
. "$NVM_DIR/nvm.sh"

NODE_VERSION="${NODE_VERSION:-22.18.0}"
nvm install "$NODE_VERSION"
nvm use "$NODE_VERSION"

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

if [[ ! -d "$ANDROID_HOME/platforms/android-36" || ! -d "$ANDROID_HOME/ndk/27.1.12297006" ]]; then
  yes | sdkmanager --licenses || true
  sdkmanager \
    "platform-tools" \
    "platforms;android-36" \
    "build-tools;36.0.0" \
    "ndk;27.1.12297006" \
    "cmake;3.22.1"
fi

corepack enable
corepack prepare pnpm@10.32.0 --activate
pnpm install --frozen-lockfile

rm -rf "${TMPDIR:-/tmp}/metro-cache" "${TMPDIR:-/tmp}"/haste-map-*

pnpm dlx eas-cli@latest build \
  --profile "$PROFILE" \
  --platform android \
  --local \
  --non-interactive \
  --output "lunar-${PROFILE}.apk"
