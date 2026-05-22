from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


SOURCE = Path("/Users/FuD/Downloads/703988428_17924823696346208_3521457976726114557_n.jpg")
OUT_DIR = Path(__file__).resolve().parents[1] / "extracted_components"


# Coordinates are (left, top, right, bottom) in the source image.
# Keep a little grey margin so the edge-connected background can be removed.
COMPONENTS = [
    ("01_girl_glasses", (135, 298, 268, 406)),
    ("02_girl_angry", (266, 292, 402, 418)),
    ("03_girl_full_body", (402, 276, 530, 406)),
    ("04_boy_face", (543, 300, 666, 407)),
    ("05_girl_star_eyes", (680, 286, 810, 414)),
    ("06_boy_sick", (815, 294, 945, 410)),
    ("07_boy_running", (138, 447, 253, 577)),
    ("08_boy_ghost", (267, 446, 370, 562)),
    ("09_pink_cat_sitting", (385, 449, 490, 578)),
    ("10_pink_cat_waving", (511, 451, 628, 578)),
    ("11_slime_stack", (653, 434, 779, 575)),
    ("12_white_monster", (788, 416, 954, 579)),
    ("13_lightbulb_bubble", (138, 634, 237, 744)),
    ("14_9999", (251, 611, 432, 677)),
    ("15_miss", (276, 687, 414, 749)),
    ("16_blue_hat_mushroom", (443, 610, 590, 758)),
    ("17_green_hat_mushroom", (609, 608, 763, 758)),
    ("18_orange_mushroom", (786, 614, 931, 755)),
    ("19_green_buddy", (137, 790, 260, 916)),
    ("20_pig", (274, 785, 410, 911)),
    ("21_boar", (408, 776, 562, 920)),
    ("22_red_snail", (563, 790, 664, 897)),
    ("23_blue_snail", (679, 791, 794, 897)),
    ("24_green_snake", (815, 786, 933, 909)),
    ("25_fish", (137, 952, 263, 1092)),
    ("26_ground_block", (279, 950, 414, 1080)),
    ("27_rope_platform", (424, 942, 550, 1090)),
    ("28_mushroom_grass", (568, 946, 691, 1076)),
    ("29_mushroom_house", (694, 943, 825, 1078)),
    ("30_red_leaf", (816, 936, 952, 1068)),
    ("31_coin", (139, 1128, 264, 1260)),
    ("32_red_potion", (278, 1122, 405, 1252)),
    ("33_blue_potion", (413, 1106, 558, 1258)),
    ("34_money_bag", (558, 1108, 706, 1256)),
    (
        "35_note_sparkles",
        [(700, 1120, 775, 1198), (701, 1192, 741, 1249), (772, 1123, 811, 1167)],
    ),
    ("36_scroll", (804, 1128, 946, 1260)),
]


def looks_like_panel_background(rgb: np.ndarray, edge_rgb: np.ndarray) -> np.ndarray:
    arr = rgb.astype(np.int16)
    mean = arr.mean(axis=2)

    # Grey panel and its diagonal hatch marks have near-equal RGB channels.
    # Avoid a broad saturation rule because several icons contain beige/grey fills.
    near_equal_channels = (
        (np.abs(arr[:, :, 0] - arr[:, :, 1]) <= 18)
        & (np.abs(arr[:, :, 1] - arr[:, :, 2]) <= 18)
        & (np.abs(arr[:, :, 0] - arr[:, :, 2]) <= 18)
    )
    grey_panel = near_equal_channels & (mean >= 78) & (mean <= 178)

    edge_distance = np.sqrt(((arr - edge_rgb.astype(np.int16)) ** 2).sum(axis=2))
    sampled_panel = (edge_distance <= 38) & (mean >= 70) & (mean <= 190)

    # A few crops can include very pale page/pink margins if the box is generous.
    pale_outer = (mean >= 205) & near_equal_channels

    return grey_panel | sampled_panel | pale_outer


def remove_edge_connected_background(crop: Image.Image) -> Image.Image:
    rgba = crop.convert("RGBA")
    rgb = np.array(rgba.convert("RGB"))
    h, w = rgb.shape[:2]
    edge_pixels = np.concatenate([rgb[0, :, :], rgb[-1, :, :], rgb[:, 0, :], rgb[:, -1, :]], axis=0)
    edge_rgb = np.median(edge_pixels, axis=0)
    candidate = looks_like_panel_background(rgb, edge_rgb)
    bg = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()

    def add_if_bg(x: int, y: int) -> None:
        if 0 <= x < w and 0 <= y < h and candidate[y, x] and not bg[y, x]:
            bg[y, x] = True
            q.append((x, y))

    for x in range(w):
        add_if_bg(x, 0)
        add_if_bg(x, h - 1)
    for y in range(h):
        add_if_bg(0, y)
        add_if_bg(w - 1, y)

    while q:
        x, y = q.popleft()
        add_if_bg(x + 1, y)
        add_if_bg(x - 1, y)
        add_if_bg(x, y + 1)
        add_if_bg(x, y - 1)

    out = np.array(rgba)
    out[bg, 3] = 0
    return Image.fromarray(out, "RGBA")


def trim_alpha(img: Image.Image, padding: int = 8) -> Image.Image:
    alpha = np.array(img.getchannel("A"))
    ys, xs = np.where(alpha > 0)
    if len(xs) == 0:
        return img

    left = max(int(xs.min()) - padding, 0)
    top = max(int(ys.min()) - padding, 0)
    right = min(int(xs.max()) + 1 + padding, img.width)
    bottom = min(int(ys.max()) + 1 + padding, img.height)
    return img.crop((left, top, right, bottom))


def extract_component(source: Image.Image, boxes) -> Image.Image:
    if isinstance(boxes, tuple):
        return trim_alpha(remove_edge_connected_background(source.crop(boxes)))

    left = min(box[0] for box in boxes)
    top = min(box[1] for box in boxes)
    right = max(box[2] for box in boxes)
    bottom = max(box[3] for box in boxes)
    canvas = Image.new("RGBA", (right - left, bottom - top), (0, 0, 0, 0))
    for box in boxes:
        cutout = remove_edge_connected_background(source.crop(box))
        canvas.alpha_composite(cutout, (box[0] - left, box[1] - top))
    return trim_alpha(canvas)


def keep_yellow_connected_parts(img: Image.Image, trim: bool = True) -> Image.Image:
    data = np.array(img.convert("RGBA"))
    alpha = data[:, :, 3] > 0
    yellow = alpha & (data[:, :, 0] > 170) & (data[:, :, 1] > 120) & (data[:, :, 2] < 120)
    h, w = alpha.shape
    visited = np.zeros((h, w), dtype=bool)
    keep = np.zeros((h, w), dtype=bool)

    for start_y, start_x in zip(*np.where(alpha & ~visited)):
        pixels = []
        has_yellow = False
        q = deque([(int(start_x), int(start_y))])
        visited[start_y, start_x] = True

        while q:
            x, y = q.popleft()
            pixels.append((x, y))
            has_yellow = has_yellow or bool(yellow[y, x])
            for nx in (x - 1, x, x + 1):
                for ny in (y - 1, y, y + 1):
                    if (
                        0 <= nx < w
                        and 0 <= ny < h
                        and not visited[ny, nx]
                        and alpha[ny, nx]
                    ):
                        visited[ny, nx] = True
                        q.append((nx, ny))

        if has_yellow:
            for x, y in pixels:
                keep[y, x] = True

    data[~keep, 3] = 0
    out = Image.fromarray(data, "RGBA")
    return trim_alpha(out) if trim else out


def extract_note_sparkles(source: Image.Image) -> Image.Image:
    note_box = (700, 1120, 775, 1198)
    sparkle_boxes = [(701, 1192, 741, 1249), (772, 1123, 811, 1167)]
    boxes = [note_box, *sparkle_boxes]
    left = min(box[0] for box in boxes)
    top = min(box[1] for box in boxes)
    right = max(box[2] for box in boxes)
    bottom = max(box[3] for box in boxes)
    canvas = Image.new("RGBA", (right - left, bottom - top), (0, 0, 0, 0))

    note = remove_edge_connected_background(source.crop(note_box))
    canvas.alpha_composite(note, (note_box[0] - left, note_box[1] - top))

    for box in sparkle_boxes:
        sparkle = remove_edge_connected_background(source.crop(box))
        sparkle = keep_yellow_connected_parts(sparkle, trim=False)
        canvas.alpha_composite(sparkle, (box[0] - left, box[1] - top))

    return trim_alpha(canvas)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old_file in OUT_DIR.glob("*.png"):
        old_file.unlink()
    source = Image.open(SOURCE).convert("RGB")

    for name, box in COMPONENTS:
        if name == "35_note_sparkles":
            cutout = extract_note_sparkles(source)
        else:
            cutout = extract_component(source, box)
        cutout.save(OUT_DIR / f"{name}.png")

    print(f"wrote {len(COMPONENTS)} files to {OUT_DIR}")


if __name__ == "__main__":
    main()
