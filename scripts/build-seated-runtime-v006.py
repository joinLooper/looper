from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
V005 = ROOT / "apps/web/public/runtime-assets/v005"
V006 = ROOT / "apps/web/public/runtime-assets/v006"


SEATS = {
    "furn_leaf_cushion": {
        "source": V005 / "exports/furn_leaf_cushion_v001_runtime.png",
        "front_cut_y": 650,
    },
    "furn_second_cushion": {
        "source": V005 / "exports/furn_second_cushion_v001_runtime.png",
        "front_cut_y": 680,
    },
}


def build_seat_layers() -> None:
    seat_dir = V006 / "seats"
    seat_dir.mkdir(parents=True, exist_ok=True)

    for seat_id, spec in SEATS.items():
        source = Path(spec["source"])
        cushion = Image.open(source).convert("RGBA")
        cut_y = int(spec["front_cut_y"])

        shutil.copyfile(source, seat_dir / f"{seat_id}_back.png")

        front_mask = Image.new("L", cushion.size, 0)
        ImageDraw.Draw(front_mask).rectangle(
            (0, cut_y, cushion.width, cushion.height),
            fill=255,
        )
        front_mask = front_mask.filter(ImageFilter.GaussianBlur(1.2))

        front = cushion.copy()
        front.putalpha(
            ImageChops.multiply(cushion.getchannel("A"), front_mask),
        )
        front.save(seat_dir / f"{seat_id}_front_rim.png", format="PNG")


if __name__ == "__main__":
    build_seat_layers()
