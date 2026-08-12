#!/usr/bin/env bash
# Push groklius's live browser to OBS / pump.fun RTMP.
# 1. Start the rack: ./start.sh --live
# 2. In OBS: Sources → Browser → http://127.0.0.1:4173/obs.html  (1280x720)
#    or pull this MJPEG: http://127.0.0.1:4173/api/frame.mjpeg
# 3. On pump.fun: Start livestream → RTMP (OBS) → copy server + key
# 4. Optional ffmpeg (no OBS):
#      PUMP_RTMP_URL=rtmp://... PUMP_STREAM_KEY=... ./scripts/stream-obs.sh
set -euo pipefail
URL="${PUMP_RTMP_URL:-}"
KEY="${PUMP_STREAM_KEY:-}"
SRC="${STREAM_SRC:-http://127.0.0.1:4173/api/frame.mjpeg}"

if [[ -z "$URL" || -z "$KEY" ]]; then
  echo "OBS path (no ffmpeg needed):"
  echo "  Browser source → http://127.0.0.1:4173/obs.html"
  echo "  or Media source → $SRC"
  echo
  echo "To push to pump.fun without OBS:"
  echo "  PUMP_RTMP_URL=rtmp://... PUMP_STREAM_KEY=... $0"
  exit 0
fi

exec ffmpeg -hide_banner -loglevel warning \
  -f mjpeg -i "$SRC" \
  -f lavfi -i anullsrc=r=44100:cl=stereo \
  -c:v libx264 -pix_fmt yuv420p -preset veryfast -tune zerolatency -r 8 \
  -c:a aac -shortest \
  -f flv "${URL%/}/${KEY}"
