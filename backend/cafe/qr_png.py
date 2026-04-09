import io

import qrcode


def qr_png_bytes(text: str, box_size: int = 8, border: int = 2) -> bytes:
    qr = qrcode.QRCode(version=1, box_size=box_size, border=border)
    qr.add_data(text)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
