#!/usr/bin/env bash
# Polls EAS for new finished Android builds and uploads them to Google Drive.
# Run on a schedule (cron). State is stored in ~/.mokshavoice_last_uploaded_build.

set -euo pipefail

DRIVE_FOLDER_ID="19aI_nie3nDnED-DgbcQEX09ojAl3j1B3"
STATE_FILE="$HOME/.mokshavoice_last_uploaded_build"
MOBILE_DIR="$(cd "$(dirname "$0")/.." && pwd)/apps/mobile"
LOG_FILE="/tmp/moksha-apk-upload.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# Get latest finished Android build
LATEST=$(cd "$MOBILE_DIR" && eas build:list --platform android --status FINISHED --limit 1 --json 2>/dev/null)

BUILD_ID=$(echo "$LATEST" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'])" 2>/dev/null || echo "")
APK_URL=$(echo "$LATEST" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['artifacts']['applicationArchiveUrl'])" 2>/dev/null || echo "")
VERSION=$(echo "$LATEST" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('appVersion','1.0.0'))" 2>/dev/null || echo "1.0.0")
BUILD_NUM=$(echo "$LATEST" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('appBuildVersion','1'))" 2>/dev/null || echo "1")

if [[ -z "$BUILD_ID" || -z "$APK_URL" ]]; then
  log "Could not fetch build info from EAS."
  exit 0
fi

# Check if already uploaded
LAST_ID=$(cat "$STATE_FILE" 2>/dev/null || echo "")
if [[ "$BUILD_ID" == "$LAST_ID" ]]; then
  log "Build $BUILD_ID already uploaded. Nothing to do."
  exit 0
fi

FILENAME="MokshaVoice-v${VERSION}-build${BUILD_NUM}-$(date +%Y%m%d).apk"
TMP_FILE="/tmp/${FILENAME}"

log "New build detected: $BUILD_ID"
log "Downloading $APK_URL..."
curl -sL "$APK_URL" -o "$TMP_FILE"
log "Downloaded $(du -sh "$TMP_FILE" | cut -f1)"

log "Uploading $FILENAME to Google Drive..."
rclone copy "$TMP_FILE" "gdrive:" \
  --drive-root-folder-id "$DRIVE_FOLDER_ID" \
  --drive-use-trash=false

rm -f "$TMP_FILE"
echo "$BUILD_ID" > "$STATE_FILE"
log "Done. $FILENAME is live in the shared Drive folder."
