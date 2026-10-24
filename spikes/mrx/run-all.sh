#!/bin/bash
set -euo pipefail
REPO=$(cd "$(dirname "$0")/../.." && pwd)
CACHE=/Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx
MODEL="$CACHE/model/mrx-mask-int8.onnx"
MEDIA="$CACHE/media"
OUT="$CACHE/out"

bash "$REPO/spikes/mrx/prepare.sh"
for spec in 'clip1 clip1_speech_music' 'clip2 clip2_speech_silence_music' 'clip3 clip3_reels'; do
  read -r label file <<< "$spec"
  for provider in coreml cpu; do
    npm --prefix "$REPO/spikes/mrx" run run -- "$MODEL" "$MEDIA/$file.wav" "$OUT" "$label" "$provider" > "$OUT/$label-$provider-full.log" 2>&1
  done
done

for label in clip1 clip2 clip3; do
  case "$label" in
    clip1) file=clip1_speech_music;;
    clip2) file=clip2_speech_silence_music;;
    clip3) file=clip3_reels;;
  esac
  for provider in coreml cpu; do
    bash "$REPO/spikes/mrx/check-lengths.sh" "$MEDIA/$file.wav" "$OUT" "$label" "$provider"
  done
done

for provider in coreml cpu; do
  bash "$REPO/spikes/mrx/check-lengths.sh" "$MEDIA/fixture-5s.wav" "$OUT" fixture-5s "$provider"
done

"$CACHE/venv/bin/python" "$REPO/spikes/mrx/measure_quality.py"
"$CACHE/venv/bin/python" "$REPO/spikes/mrx/benchmark_pytorch.py" "$MEDIA/clip1_speech_music.wav"
