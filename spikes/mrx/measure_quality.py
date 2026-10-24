"""Compute stem RMS dBFS over the timestamped shared clip regions."""
from pathlib import Path
import json
import math
import soundfile as sf
import numpy as np

CACHE = Path('/Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx')
OUT = CACHE / 'out'
REGIONS = {
    'clip1': {'speech': [(6.0, 32.6)], 'musicOnly': [(32.6, 34.9), (35.2, 49.9), (50.5, 60.0)]},
    'clip2': {
        'speech': [(1.0, 9.1), (17.1, 23.4), (31.9, 38.5)],
        'musicOnly': [(23.9, 26.8), (27.1, 31.9)],
        'silence': [(9.1, 17.1), (38.5, 60.0)],
    },
}


def rms_db(data):
    rms = float(np.sqrt(np.mean(np.square(data, dtype=np.float64))))
    return 20 * math.log10(max(rms, 1e-12))


def segment(data, sample_rate, intervals):
    parts = [data[int(a * sample_rate):int(b * sample_rate)] for a, b in intervals]
    return np.concatenate(parts, axis=0)


def main():
    rows = {}
    for clip, regions in REGIONS.items():
        for provider in ['coreml', 'cpu']:
            stems = {}
            for stem in ['voice', 'bg']:
                data, rate = sf.read(OUT / f'{clip}-{provider}-{stem}.wav', dtype='float32', always_2d=True)
                stems[stem] = data
            for region, intervals in regions.items():
                voice_db = rms_db(segment(stems['voice'], rate, intervals))
                bg_db = rms_db(segment(stems['bg'], rate, intervals))
                rows[f'{clip}.{provider}.{region}'] = {
                    'voiceRmsDbfs': voice_db,
                    'bgRmsDbfs': bg_db,
                    'voiceMinusBgDb': voice_db - bg_db,
                }
    path = OUT / 'quality-rms.json'
    path.write_text(json.dumps(rows, indent=2))
    print(json.dumps(rows, indent=2))


if __name__ == '__main__':
    main()
