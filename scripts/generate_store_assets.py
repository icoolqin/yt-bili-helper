#!/usr/bin/env python3
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math
import shutil

ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "assets" / "icons"
STORE_DIR = ROOT / "store-assets"
SHOT_DIR = STORE_DIR / "screenshots"
PROMO_DIR = STORE_DIR / "promotional"
SOURCE_DIR = STORE_DIR / "source"
ICON_MASTER = SOURCE_DIR / "icon-master.png"

FONT_CJK = "/System/Library/Fonts/Hiragino Sans GB.ttc"
FONT_UI = "/System/Library/Fonts/HelveticaNeue.ttc"
FONT_MONO = "/System/Library/Fonts/Menlo.ttc"


def font(size, bold=False, mono=False):
    path = FONT_MONO if mono else FONT_CJK
    try:
        return ImageFont.truetype(path, size, index=1 if bold else 0)
    except Exception:
        try:
            return ImageFont.truetype(FONT_UI, size)
        except Exception:
            return ImageFont.load_default()


def ensure_dirs():
    for directory in [ICON_DIR, SHOT_DIR, PROMO_DIR, SOURCE_DIR]:
        directory.mkdir(parents=True, exist_ok=True)


def rounded_gradient(size, radius, top, bottom):
    width, height = size
    base = Image.new("RGBA", size, (0, 0, 0, 0))
    grad = Image.new("RGBA", size, (0, 0, 0, 0))
    px = grad.load()
    for y in range(height):
        ratio = y / max(1, height - 1)
        color = tuple(int(top[i] * (1 - ratio) + bottom[i] * ratio) for i in range(3)) + (255,)
        for x in range(width):
            px[x, y] = color
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width, height), radius=radius, fill=255)
    base.alpha_composite(grad, (0, 0))
    base.putalpha(mask)
    return base


def draw_play_icon(draw, cx, cy, scale, fill):
    points = [
        (cx - 0.32 * scale, cy - 0.42 * scale),
        (cx - 0.32 * scale, cy + 0.42 * scale),
        (cx + 0.46 * scale, cy),
    ]
    draw.polygon(points, fill=fill)


def draw_bridge_mark(draw, origin, scale, stroke, accent):
    ox, oy = origin
    lw = max(3, int(scale * 0.08))
    left = (ox + 0.08 * scale, oy + 0.52 * scale)
    mid = (ox + 0.48 * scale, oy + 0.52 * scale)
    top = (ox + 0.82 * scale, oy + 0.26 * scale)
    bottom = (ox + 0.82 * scale, oy + 0.78 * scale)
    draw.line([left, mid, top], fill=stroke, width=lw, joint="curve")
    draw.line([mid, bottom], fill=stroke, width=lw, joint="curve")
    for point, color, r in [(left, stroke, 0.1), (mid, accent, 0.12), (top, stroke, 0.1), (bottom, stroke, 0.1)]:
        x, y = point
        rr = r * scale
        draw.ellipse((x - rr, y - rr, x + rr, y + rr), fill=color)


def load_icon_master():
    if not ICON_MASTER.exists():
        raise FileNotFoundError(f"Missing generated icon master: {ICON_MASTER}")
    image = Image.open(ICON_MASTER).convert("RGBA")
    width, height = image.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    return image.crop((left, top, left + side, top + side))


def make_icon(size):
    icon = load_icon_master().resize((size, size), Image.Resampling.LANCZOS)
    if size <= 32:
        icon = icon.filter(ImageFilter.UnsharpMask(radius=0.7, percent=130, threshold=2))
    return icon


def make_icons():
    for size in [16, 32, 48, 128]:
        icon = make_icon(size)
        icon.save(ICON_DIR / f"icon-{size}.png")
    shutil.copyfile(ICON_DIR / "icon-128.png", STORE_DIR / "icon-128.png")


def draw_text(draw, xy, text, fnt, fill, max_width=None, line_gap=6):
    x, y = xy
    if not max_width:
        draw.text((x, y), text, font=fnt, fill=fill)
        return y + draw.textbbox((x, y), text, font=fnt)[3] - y
    lines = []
    current = ""
    for char in text:
        candidate = current + char
        if draw.textbbox((0, 0), candidate, font=fnt)[2] <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = char
    if current:
        lines.append(current)
    for line in lines:
        draw.text((x, y), line, font=fnt, fill=fill)
        y += fnt.size + line_gap
    return y


def video_page_base():
    image = Image.new("RGB", (1280, 800), "#0f0f10")
    d = ImageDraw.Draw(image)
    d.rectangle((0, 0, 1280, 56), fill="#111315")
    d.rounded_rectangle((430, 12, 850, 42), radius=15, fill="#1b1d20", outline="#34373d")
    d.text((455, 18), "搜索", font=font(16), fill="#9aa0a6")
    d.ellipse((812, 20, 826, 34), outline="#f1f3f4", width=2)
    d.line((824, 32, 833, 40), fill="#f1f3f4", width=2)

    d.rounded_rectangle((26, 70, 832, 520), radius=10, fill="#191a1d")
    for i in range(9):
        x = 80 + i * 82
        y = 130 + int(38 * math.sin(i * 0.8))
        d.rounded_rectangle((x, y, x + 70, y + 46), radius=14, fill=(32 + i * 8, 44 + i * 4, 62 + i * 5))
    d.polygon([(376, 236), (376, 354), (492, 295)], fill="#f6f7f8")
    d.rectangle((26, 538, 832, 544), fill="#2a2c30")
    d.rectangle((26, 538, 245, 544), fill="#ff2851")
    d.text((26, 570), "示例视频标题：中文内容，也许在 B站有相近版本", font=font(25, bold=True), fill="#f8fafc")
    d.text((26, 608), "频道名 · 12 万次观看 · 刚刚发布", font=font(16), fill="#aeb4bd")

    x0 = 862
    for idx in range(5):
        y = 84 + idx * 132
        d.rounded_rectangle((x0, y, x0 + 214, y + 120), radius=8, fill="#1b1d21")
        d.rounded_rectangle((x0 + 14, y + 14, x0 + 154, y + 96), radius=6, fill="#283449")
        d.rectangle((x0 + 164, y + 16, x0 + 386, y + 32), fill="#f1f3f4")
        d.rectangle((x0 + 164, y + 42, x0 + 340, y + 54), fill="#7d8590")
        d.rectangle((x0 + 164, y + 66, x0 + 300, y + 78), fill="#5f6670")
    return image


def draw_helper_card(d, box, title, subtitle, state="match", related=False):
    x1, y1, x2, y2 = box
    d.rounded_rectangle(box, radius=10, fill="#202124", outline="#3b3d43")
    color = "#00aeec" if state == "match" else "#ffb020"
    d.rounded_rectangle((x1 + 14, y1 + 16, x1 + 20, y1 + 72), radius=3, fill=color)
    d.text((x1 + 32, y1 + 16), "B站同源助手", font=font(13), fill="#aeb4bd")
    d.text((x1 + 32, y1 + 36), title, font=font(21, bold=True), fill="#ffffff")
    d.text((x1 + 32, y1 + 65), subtitle, font=font(14), fill="#b8bec7")
    d.text((x2 - 52, y1 + 18), "收起", font=font(13, bold=True), fill="#b8bec7")

    if related:
        d.rounded_rectangle((x1 + 32, y1 + 94, x2 - 32, y1 + 164), radius=8, fill="#17191d", outline="#343842")
        d.rounded_rectangle((x1 + 44, y1 + 106, x1 + 134, y1 + 152), radius=6, fill="#304057")
        d.text((x1 + 148, y1 + 106), "2026台湾游记 EP1｜台北自由行", font=font(16, bold=True), fill="#f5f7fa")
        d.text((x1 + 148, y1 + 132), "可能相关 · 同系列线索", font=font(13), fill="#ffcf84")
        d.rounded_rectangle((x1 + 32, y1 + 178, x1 + 204, y1 + 214), radius=8, fill="#00aeec")
        d.text((x1 + 83, y1 + 187), "打开看看", font=font(15, bold=True), fill="#ffffff")
        d.rounded_rectangle((x1 + 216, y1 + 178, x2 - 32, y1 + 214), radius=8, fill="#0f3b4a", outline="#1f6d83")
        d.text((x1 + 285, y1 + 187), "去 B站搜", font=font(15, bold=True), fill="#b6efff")
    else:
        d.rounded_rectangle((x1 + 32, y1 + 94, x2 - 32, y1 + 182), radius=8, fill="#17191d", outline="#343842")
        d.rounded_rectangle((x1 + 44, y1 + 106, x1 + 158, y1 + 170), radius=6, fill="#304057")
        d.text((x1 + 174, y1 + 108), "同名视频 · 时长接近", font=font(17, bold=True), fill="#f5f7fa")
        d.text((x1 + 174, y1 + 137), "很像同一个", font=font(13, bold=True), fill="#a7e8fb")
        d.rounded_rectangle((x1 + 32, y1 + 196, x1 + 196, y1 + 232), radius=8, fill="#00aeec")
        d.text((x1 + 94, y1 + 205), "打开", font=font(15, bold=True), fill="#ffffff")
        d.rounded_rectangle((x1 + 206, y1 + 196, x2 - 32, y1 + 232), radius=8, fill="#0f3b4a", outline="#1f6d83")
        d.text((x1 + 267, y1 + 205), "点赞打开", font=font(15, bold=True), fill="#b6efff")
        d.text((x1 + 32, y1 + 246), "跳转前会暂停 YouTube；点赞打开会先赞原视频。", font=font(12), fill="#b8bec7")


def screenshot_found():
    image = video_page_base()
    d = ImageDraw.Draw(image)
    draw_helper_card(d, (858, 58, 1262, 358), "找到 B站版本", "标题、时长这些线索都对得上。")
    d.rounded_rectangle((858, 382, 1262, 418), radius=18, fill="#16181c")
    chips = ["全部", "来自频道", "相关", "最近上传"]
    x = 870
    for chip in chips:
        w = d.textbbox((0, 0), chip, font=font(14, bold=True))[2] + 30
        d.rounded_rectangle((x, 388, x + w, 414), radius=9, fill="#2a2d32")
        d.text((x + 15, 394), chip, font=font(14, bold=True), fill="#f3f4f6")
        x += w + 10
    image.save(SHOT_DIR / "01-youtube-sidebar-match.png")


def screenshot_related():
    image = video_page_base()
    d = ImageDraw.Draw(image)
    draw_helper_card(d, (858, 58, 1262, 296), "B站有相近内容", "像同一个系列，但集数不完全一致。", state="related", related=True)
    d.rounded_rectangle((858, 322, 1262, 362), radius=18, fill="#16181c")
    d.text((878, 331), "低置信不自动点赞，先打开看看更稳妥", font=font(16, bold=True), fill="#f2f4f7")
    image.save(SHOT_DIR / "02-youtube-sidebar-related.png")


def screenshot_settings():
    image = Image.new("RGB", (1280, 800), "#f6f8fb")
    d = ImageDraw.Draw(image)
    d.rounded_rectangle((80, 76, 1200, 724), radius=28, fill="#ffffff", outline="#e1e7ef")
    d.text((140, 130), "设置简单，默认就好用", font=font(40, bold=True), fill="#101828")
    d.text((140, 190), "打开视频页后自动查找；必要时再手动控制严格度。", font=font(22), fill="#667085")
    popup = (760, 150, 1112, 510)
    d.rounded_rectangle(popup, radius=14, fill="#ffffff", outline="#dfe5ee")
    d.text((790, 184), "B站同源助手", font=font(14), fill="#667085")
    d.text((790, 210), "在 YouTube 找 B站同源视频", font=font(20, bold=True), fill="#101828")
    for idx, (label, desc, on) in enumerate([
        ("自动查找", "打开视频页后自动搜索 B站候选。", True),
        ("匹配严格度", "稳妥 / 均衡 / 宽松。", True),
        ("打开前自动点赞", "去 B站前先赞当前视频。", False),
    ]):
        y = 270 + idx * 72
        d.text((790, y), label, font=font(16, bold=True), fill="#172033")
        d.text((790, y + 24), desc, font=font(13), fill="#667085")
        if idx == 1:
            d.rounded_rectangle((1015, y, 1084, y + 32), radius=8, fill="#f3f6fa", outline="#cfd7e3")
            d.text((1036, y + 7), "稳妥", font=font(13, bold=True), fill="#172033")
        else:
            fill = "#00aeec" if on else "#d0d5dd"
            d.rounded_rectangle((1040, y + 2, 1084, y + 26), radius=12, fill=fill)
            cx = 1072 if on else 1052
            d.ellipse((cx - 9, y + 5, cx + 9, y + 23), fill="#ffffff")
    for i, text in enumerate(["自动匹配候选", "跳转自动暂停", "结果只存在本机"]):
        y = 320 + i * 62
        d.ellipse((156, y, 178, y + 22), fill="#00aeec")
        d.text((200, y - 2), text, font=font(24, bold=True), fill="#172033")
    image.save(SHOT_DIR / "03-settings.png")


def promo_small():
    image = Image.new("RGB", (440, 280), "#101828")
    d = ImageDraw.Draw(image)
    for i in range(18):
        color = (0, 120 + i * 5, 180 + i * 2)
        d.ellipse((260 - i * 22, 48 - i * 8, 520 + i * 16, 306 + i * 18), outline=color, width=3)
    icon = make_icon(128)
    image.paste(icon, (156, 76), icon)
    d.rounded_rectangle((42, 92, 156, 164), radius=14, fill="#172033", outline="#3a4658")
    d.polygon([(86, 112), (86, 144), (118, 128)], fill="#ffffff")
    d.rounded_rectangle((284, 92, 398, 164), radius=14, fill="#172033", outline="#3a4658")
    draw_bridge_mark(d, (306, 108), 70, "#ffffff", "#ff7299")
    d.arc((114, 82, 326, 184), 190, 350, fill="#00aeec", width=5)
    image.save(PROMO_DIR / "small-promo-440x280.png")


def promo_marquee():
    image = Image.new("RGB", (1400, 560), "#0f172a")
    d = ImageDraw.Draw(image)
    for i in range(28):
        d.rounded_rectangle((760 - i * 15, 36 + i * 3, 1440 + i * 8, 566 + i * 12), radius=50, outline=(0, 126 + i * 3, 168 + i * 2), width=3)
    icon = make_icon(192)
    image.paste(icon, (112, 184), icon)
    d.rounded_rectangle((420, 112, 1180, 448), radius=30, fill="#171923", outline="#344054")
    d.rounded_rectangle((456, 154, 876, 398), radius=16, fill="#222938")
    d.polygon([(630, 236), (630, 316), (706, 276)], fill="#ffffff")
    d.rounded_rectangle((912, 156, 1144, 206), radius=12, fill="#00aeec")
    d.rounded_rectangle((912, 230, 1090, 256), radius=8, fill="#344054")
    d.rounded_rectangle((912, 276, 1128, 302), radius=8, fill="#344054")
    d.rounded_rectangle((912, 340, 1038, 380), radius=10, fill="#ff7299")
    image.save(PROMO_DIR / "marquee-1400x560.png")


def main():
    ensure_dirs()
    make_icons()
    screenshot_found()
    screenshot_related()
    screenshot_settings()
    promo_small()
    promo_marquee()


if __name__ == "__main__":
    main()
