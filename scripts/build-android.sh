#!/bin/bash
set -euo pipefail

PROFILE="${1:-}"

case "$PROFILE" in
  development|preview|release) EXTENSION=apk ;;
  production) EXTENSION=aab ;;
  *) echo "Usage: $0 <development|preview|release|production> [output]" >&2; exit 1 ;;
esac
OUTPUT="${2:-lunar-${PROFILE}.${EXTENSION}}"
EAS_CLI_VERSION=21.8.0
ANDROID_NDK_VERSION=27.1.12297006
DEVELOPMENT_SYMBOL_ARCHIVE=""

: "${EXPO_TOKEN:?EXPO_TOKEN must be provided by the build environment}"

SYSTEM_PACKAGES=()
command -v javac >/dev/null 2>&1 || SYSTEM_PACKAGES+=(openjdk-17-jdk-headless)
command -v unzip >/dev/null 2>&1 || SYSTEM_PACKAGES+=(unzip)
command -v zip >/dev/null 2>&1 || SYSTEM_PACKAGES+=(zip)
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

for command_name in java javac node unzip zip wget curl git; do
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

if [[ ! -d "$ANDROID_HOME/platforms/android-36" || ! -d "$ANDROID_HOME/ndk/$ANDROID_NDK_VERSION" || ! -d "$ANDROID_HOME/build-tools/36.0.0" || ! -d "$ANDROID_HOME/cmake/3.30.5" || ! -d "$ANDROID_HOME/platform-tools" ]]; then
  yes | sdkmanager --licenses || true
  sdkmanager \
    "platform-tools" \
    "platforms;android-36" \
    "build-tools;36.0.0" \
    "ndk;$ANDROID_NDK_VERSION" \
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

if [[ "$PROFILE" == release ]]; then
  pnpm run check
  pnpm run test:release
  EXPO_OFFLINE=1 pnpm run check:expo
  export RITO_FFI_REBUILD=1
fi

if [[ "$PROFILE" == development ]]; then
  # The APK remains compact, while the retained build output carries the
  # DWARF line tables required to symbolize Rust frames from Perfetto.
  export RITO_FFI_REBUILD=1
  export CARGO_PROFILE_RELEASE_DEBUG=1
  export CARGO_PROFILE_RELEASE_STRIP=none
  export EAS_LOCAL_BUILD_SKIP_CLEANUP=1
  export EAS_LOCAL_BUILD_WORKINGDIR
  EAS_LOCAL_BUILD_WORKINGDIR="$(mktemp -d "${TMPDIR:-/tmp}/lunar-eas-local-build.XXXXXX")"
  DEVELOPMENT_SYMBOL_ARCHIVE="${OUTPUT%.*}-symbols.zip"
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

if [[ "$PROFILE" == development ]]; then
  LLVM_READELF="$ANDROID_HOME/ndk/$ANDROID_NDK_VERSION/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-readelf"
  APK_RITO_LIBRARY="$EAS_LOCAL_BUILD_WORKINGDIR/apk-libRitoNitro.so"
  SYMBOL_METADATA="$EAS_LOCAL_BUILD_WORKINGDIR/rito-native-symbols.txt"

  unzip -p "$OUTPUT" 'lib/arm64-v8a/libRitoNitro.so' > "$APK_RITO_LIBRARY"
  test -s "$APK_RITO_LIBRARY"
  APK_BUILD_ID="$($LLVM_READELF -n "$APK_RITO_LIBRARY" | awk '/Build ID:/ { print $3; exit }')"
  if [[ -z "$APK_BUILD_ID" ]]; then
    echo "Unable to read the Rito Build ID from $OUTPUT." >&2
    exit 1
  fi

  UNSTRIPPED_RITO_LIBRARY=""
  while IFS= read -r candidate; do
    CANDIDATE_BUILD_ID="$($LLVM_READELF -n "$candidate" | awk '/Build ID:/ { print $3; exit }')"
    if [[ "$CANDIDATE_BUILD_ID" == "$APK_BUILD_ID" ]]; then
      UNSTRIPPED_RITO_LIBRARY="$candidate"
      break
    fi
  done < <(find "$EAS_LOCAL_BUILD_WORKINGDIR" -type f \
    -path '*/intermediates/cxx/*/obj/arm64-v8a/libRitoNitro.so' -print)

  if [[ -z "$UNSTRIPPED_RITO_LIBRARY" ]]; then
    echo "Unable to find an unstripped libRitoNitro.so with Build ID $APK_BUILD_ID." >&2
    exit 1
  fi

  RITO_SECTIONS="$($LLVM_READELF --sections "$UNSTRIPPED_RITO_LIBRARY")"
  if [[ "$RITO_SECTIONS" != *'.debug_info'* || "$RITO_SECTIONS" != *'.debug_line'* ]]; then
    echo "The matching libRitoNitro.so does not contain DWARF debug information." >&2
    exit 1
  fi

  printf 'git_commit=%s\nbuild_id=%s\nabi=arm64-v8a\ncargo_profile_release_debug=1\n' \
    "$(git rev-parse HEAD)" "$APK_BUILD_ID" > "$SYMBOL_METADATA"
  zip -q -j "$DEVELOPMENT_SYMBOL_ARCHIVE" \
    "$UNSTRIPPED_RITO_LIBRARY" "$SYMBOL_METADATA"
  test -s "$DEVELOPMENT_SYMBOL_ARCHIVE"
fi
