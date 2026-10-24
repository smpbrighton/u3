#!/bin/bash
set -euo pipefail
input=$1
output_dir=$2
label=$3
provider=$4
input_duration=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$input")
for stem in voice bg; do
  output="$output_dir/$label-$provider-$stem.wav"
  output_duration=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$output")
  awk -v a="$input_duration" -v b="$output_duration" 'BEGIN {d=a-b; if(d<0)d=-d; if(d>1/44100) exit 1}' || {
    echo "length mismatch: $stem input=$input_duration output=$output_duration" >&2
    exit 1
  }
done
echo "lengths match within one sample: $label ($provider)"
