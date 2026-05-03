#!/usr/bin/env bash
# Usage: ./scripts/upload-apk-to-drive.sh <apk-url> [filename]
# Downloads the APK from an EAS artifact URL and uploads to the shared Drive folder.

set -euo pipefail

DRIVE_FOLDER_ID="19aI_nie3nDnED-DgbcQEX09ojAl3j1B3"
APK_URL="${1:?Usage: $0 <apk-url> [filename]}"
FILENAME="${2:-MokshaVoice-$(date +%Y%m%d-%H%M%S).apk}"
TMP_FILE="/tmp/${FILENAME}"

echo "Downloading APK..."
curl -sL "$APK_URL" -o "$TMP_FILE"
echo "Downloaded $(du -sh "$TMP_FILE" | cut -f1)"

echo "Uploading to Google Drive..."
rclone copy "$TMP_FILE" "gdrive:" \
  --drive-root-folder-id "$DRIVE_FOLDER_ID" \
  --drive-use-trash=false \
  --progress

rm -f "$TMP_FILE"
echo "Done: $FILENAME is now in the shared Drive folder."
