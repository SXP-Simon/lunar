#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:-}"
if [[ "$PROFILE" != "development" ]]; then
  echo "Usage: $0 development" >&2
  exit 2
fi

: "${EXPO_TOKEN:?EXPO_TOKEN must be provided by the CNB secret import}"

export CI=1
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

if ! command -v java >/dev/null 2>&1; then
  echo "Java is required in the CNB build image." >&2
  exit 1
fi

if ! command -v sdkmanager >/dev/null 2>&1; then
  echo "sdkmanager is required in the CNB build image." >&2
  exit 1
fi

yes | sdkmanager --licenses >/dev/null || true
sdkmanager \
  "platform-tools" \
  "platforms;android-36" \
  "build-tools;36.0.0" \
  "ndk;27.1.12297006" \
  "cmake;3.22.1" >/dev/null

corepack enable
pnpm install --frozen-lockfile

rm -f lunar-development.apk
if command -v eas >/dev/null 2>&1; then
  EAS=(eas)
else
  EAS=(pnpm dlx eas-cli@latest)
fi

"${EAS[@]}" build \
  --profile "$PROFILE" \
  --platform android \
  --local \
  --non-interactive \
  --output lunar-development.apk
