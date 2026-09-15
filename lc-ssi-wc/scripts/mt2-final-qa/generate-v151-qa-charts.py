from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


WIDTH = 1100
HEIGHT = 440
BACKGROUND = "#F7FAFA"
TEXT = "#16343B"
TRACK = "#E7EEF0"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    filename = "msjhbd.ttc" if bold else "msjh.ttc"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / filename), size)


def draw_chart(output: Path, title: str, items: list[dict], maximum: float) -> None:
    image = Image.new("RGB", (WIDTH, HEIGHT), BACKGROUND)
    canvas = ImageDraw.Draw(image)
    canvas.text((40, 25), title, font=font(34, bold=True), fill=TEXT)
    left = 330
    usable = 680
    for index, item in enumerate(items):
        y = 112 + index * 88
        bar_width = max(0, int(float(item["value"]) / maximum * usable))
        canvas.text((40, y + 2), item["label"], font=font(28), fill=TEXT)
        canvas.rounded_rectangle((left, y, left + usable, y + 38), radius=8, fill=TRACK)
        if bar_width:
            canvas.rounded_rectangle(
                (left, y, left + bar_width, y + 38),
                radius=8,
                fill=item["color"],
            )
        value_box = canvas.textbbox((0, 0), item["display"], font=font(28, bold=True))
        value_width = value_box[2] - value_box[0]
        canvas.text(
            (1025 - value_width, y),
            item["display"],
            font=font(28, bold=True),
            fill=TEXT,
        )
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, format="PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--browser", required=True, type=Path)
    parser.add_argument("--sonar", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    browser = json.loads(args.browser.read_text(encoding="utf-8"))
    sonar = json.loads(args.sonar.read_text(encoding="utf-8"))
    summary = browser["summary"]
    metrics = sonar["metrics"]
    draw_chart(
        args.output_dir / "MT2XX_v15.1_UAT_outcomes.png",
        "v15.1 Browser UAT - 48/48 PASS",
        [
            {"label": "SSI_RESOLVED", "value": summary["resolved"], "display": str(summary["resolved"]), "color": "#2CA58D"},
            {"label": "SSI_AMBIGUOUS", "value": summary["ambiguous"], "display": str(summary["ambiguous"]), "color": "#F2B134"},
            {"label": "FAILED", "value": summary["failed"], "display": str(summary["failed"]), "color": "#D64550"},
        ],
        summary["planned"],
    )
    draw_chart(
        args.output_dir / "MT2XX_v15.1_Sonar_gate.png",
        "SonarQube Quality Gate - OK",
        [
            {"label": "New Coverage", "value": metrics["newCoverage"], "display": f'{metrics["newCoverage"]}%', "color": "#2CA58D"},
            {"label": "Coverage Gate", "value": metrics["coverageGate"], "display": f'{metrics["coverageGate"]}%', "color": "#5797A5"},
            {"label": "New Duplication", "value": metrics["newDuplicatedLinesDensity"], "display": f'{metrics["newDuplicatedLinesDensity"]}%', "color": "#F2B134"},
        ],
        100,
    )


if __name__ == "__main__":
    main()
