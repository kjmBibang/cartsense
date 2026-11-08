"""Command-line entry point for CartSense payload generation."""

import argparse
import json
from pathlib import Path

from .analysis import build_payload, load_orders


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a CartSense analysis payload from an order CSV.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--min-support", type=float, default=0.005)
    parser.add_argument("--min-confidence", type=float, default=0.2)
    parser.add_argument("--max-len", type=int, default=3)
    parser.add_argument("--evaluation-seed", type=int, default=42)
    parser.add_argument("--evaluation-ks", type=int, nargs="+", default=[1, 3, 5, 10])
    args = parser.parse_args()
    frame, quality = load_orders(args.input)
    payload = build_payload(
        frame,
        quality,
        min_support=args.min_support,
        min_confidence=args.min_confidence,
        max_len=args.max_len,
        evaluation_seed=args.evaluation_seed,
        evaluation_ks=tuple(args.evaluation_ks),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, allow_nan=False), encoding="utf-8")
    print(f"Generated {args.output} from {quality['validRows']} valid rows; skipped {quality['invalidRows']} rows.")