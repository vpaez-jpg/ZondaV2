#!/usr/bin/env python3
"""
generar_anexo.py
Crea un PDF unificado con portada "Anexo I" + todos los bonos de sueldo.

Input JSON por stdin:
{
  "files": ["/tmp/bono1.pdf", "/tmp/bono2.jpg", ...]
}

Output: PDF unificado por stdout (bytes).
Soporta: PDF, JPG, JPEG, PNG.
"""
import sys
import json
import os
from io import BytesIO
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from PIL import Image as PILImage

A4_W, A4_H = A4   # 595.27 x 841.89


def crear_portada_anexo() -> bytes:
    """Crea una página A4 con 'Anexo I' centrado en grande."""
    packet = BytesIO()
    c = canvas.Canvas(packet, pagesize=A4)
    c.setFont("Helvetica-Bold", 48)
    text = "Anexo I"
    tw = c.stringWidth(text, "Helvetica-Bold", 48)
    c.drawString((A4_W - tw) / 2, A4_H / 2, text)
    c.save()
    packet.seek(0)
    return packet.read()


def imagen_a_pdf(img_path: str) -> bytes:
    """Convierte JPG/PNG a un PDF de una sola página A4."""
    packet = BytesIO()
    c = canvas.Canvas(packet, pagesize=A4)
    img = PILImage.open(img_path)
    iw, ih = img.size
    # Escalar para que entre en A4 con margen
    margin = 40
    max_w  = A4_W - 2 * margin
    max_h  = A4_H - 2 * margin
    scale  = min(max_w / iw, max_h / ih, 1.0)
    draw_w = iw * scale
    draw_h = ih * scale
    x = (A4_W - draw_w) / 2
    y = (A4_H - draw_h) / 2
    c.drawImage(img_path, x, y, width=draw_w, height=draw_h)
    c.save()
    packet.seek(0)
    return packet.read()


def main():
    data  = json.load(sys.stdin)
    files = data.get("files", [])

    writer = PdfWriter()

    # 1) Portada "Anexo I"
    portada_bytes = crear_portada_anexo()
    portada_reader = PdfReader(BytesIO(portada_bytes))
    writer.add_page(portada_reader.pages[0])

    # 2) Cada bono
    for fpath in files:
        if not os.path.exists(fpath):
            continue
        ext = os.path.splitext(fpath)[1].lower()
        try:
            if ext == ".pdf":
                reader = PdfReader(fpath)
                for page in reader.pages:
                    writer.add_page(page)
            elif ext in (".jpg", ".jpeg", ".png"):
                pdf_bytes  = imagen_a_pdf(fpath)
                img_reader = PdfReader(BytesIO(pdf_bytes))
                writer.add_page(img_reader.pages[0])
            # otros formatos: ignorar
        except Exception as e:
            sys.stderr.write(f"Warning: no se pudo procesar {fpath}: {e}\n")

    out = BytesIO()
    writer.write(out)
    sys.stdout.buffer.write(out.getvalue())


if __name__ == "__main__":
    main()
