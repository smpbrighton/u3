#!/bin/bash
set -euo pipefail
MEDIA=/Volumes/X31/workspace/smp_workspace/u3-spike-media
CACHE=/Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx
for name in clip1_speech_music clip2_speech_silence_music clip3_reels; do
  ffmpeg -hide_banner -y -i "$MEDIA/$name.mp4" -t 60 -vn -ac 2 -ar 44100 -c:a pcm_f32le "$CACHE/media/$name.wav"
done
# 5-second model fixture from shared clip 1.
ffmpeg -hide_banner -y -i "$CACHE/media/clip1_speech_music.wav" -t 5 -c:a pcm_f32le "$CACHE/media/fixture-5s.wav"
