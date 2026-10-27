"""개발·빌드 전용 tokenizer 생성이다. 생성 파일과 Python 환경은 X31 캐시에 둔다."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

from transformers import AutoTokenizer
import tokenizers
import transformers


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models", type=Path, required=True)
    parser.add_argument("--results", type=Path, required=True)
    parser.add_argument("--model", action="append", help="지정한 모델만 변환한다. 생략하면 S1의 세 모델을 변환한다.")
    parser.add_argument("--tokenizer-only", action="store_true", help="대본 입력 파일 없이 빌드용 tokenizer를 만든다.")
    args = parser.parse_args()
    items = [] if args.tokenizer_only else json.loads((args.results / "items.json").read_text())
    names = args.model or [
        "Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16",
        "Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit",
        "Qwen3-TTS-12Hz-0.6B-CustomVoice-bf16",
    ]
    summary = []
    for name in names:
        folder = args.models / name
        config = json.loads((folder / "tokenizer_config.json").read_text())
        # 원래 config는 유지하고 save_pretrained 출력에서 JSON 하나만 쓴다.
        saved = args.results / name / "python-tokenizer-export"
        saved.mkdir(parents=True, exist_ok=True)
        tokenizer = AutoTokenizer.from_pretrained(folder, local_files_only=True, use_fast=True)
        assert tokenizer.is_fast
        tokenizer.save_pretrained(saved)
        generated = saved / "tokenizer.json"
        data = generated.read_bytes()
        serialized = json.loads(data)
        added = {str(token["id"]): token for token in serialized["added_tokens"]}
        special_cases = []
        for token_id, expected in config["added_tokens_decoder"].items():
            actual = added[token_id]
            assert all(actual[key] == value for key, value in expected.items()), token_id
            assert tokenizer.convert_tokens_to_ids(expected["content"]) == int(token_id)
            special_cases.append({"id": "special-" + token_id, "text": expected["content"]})
        tests = list(items)
        tests += [{"id": "chat-" + item["id"],
                   "text": "<|im_start|>assistant\n" + item["text"]
                           + "<|im_end|>\n<|im_start|>assistant\n"} for item in items]
        tests += special_cases
        tests += [
            {"id": "mixed", "text": "Sohee 한국어 12Hz, 0.6B와 1.7B! 123,456원 😄"},
            {"id": "whitespace", "text": "  앞 공백\n다음 줄\t탭과 끝 공백  "},
            {"id": "instruct", "text": "<|im_start|>user\n밝고 자연스럽게 말해 주세요.<|im_end|>\n"},
        ]
        cases = [{**item, "tokenIds": tokenizer.encode(item["text"], add_special_tokens=True)}
                 for item in tests]
        # 모델 폴더에 복사하는 파일은 tokenizer.json 하나다.
        shutil.copyfile(generated, folder / "tokenizer.json")
        reloaded = AutoTokenizer.from_pretrained(folder, local_files_only=True, use_fast=True)
        assert all(reloaded.encode(item["text"], add_special_tokens=True) == item["tokenIds"]
                   for item in cases)
        (args.results / name / "python-token-ids.json").write_text(
            json.dumps({"model": str(folder), "cases": cases}, ensure_ascii=False, indent=2) + "\n")
        summary.append({
            "model": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
            "addedTokensChecked": len(config["added_tokens_decoder"]),
            "allAddedTokensMatch": True, "cases": len(cases),
            "transformers": transformers.__version__, "tokenizers": tokenizers.__version__,
            "pythonTokenizer": type(tokenizer).__name__,
        })
    (args.results / "tokenizer-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
