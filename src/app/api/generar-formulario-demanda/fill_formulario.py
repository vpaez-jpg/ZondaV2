#!/usr/bin/env python3
"""
fill_formulario.py
Recibe JSON por stdin con los datos del cliente y el tipo de formulario.
Devuelve el PDF completado por stdout (bytes).

Input JSON:
{
  "template": "/ruta/al/template.pdf",   # path absoluto al PDF plantilla
  "form_type": "mendoza" | "san_rafael",
  "nombre":    "GARCIA JUAN CARLOS",
  "tipo_doc":  "DNI: 12.345.678",        # solo mendoza
  "domicilio": "Av. San Martín 1234...", # solo mendoza
  "fecha":     "19/05/2026"              # solo san_rafael (DD/MM/AAAA)
}
"""
import sys
import json
from io import BytesIO
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas

# ── Coordenadas calibradas con pdfplumber ──────────────────────────────────────
#
# MENDOZA (596 × 842 pt) — Sección III "DATOS PERSONALES DEL ACTOR"
#   Row 1  Apellido y Nombre / Razón Social:   y pdfplumber 518.4-529.4
#   Row 2  Tipo y Nº de Documento / CUIT:      y pdfplumber 532.6-543.6
#   Row 3  Domicilio real:                     y pdfplumber 546.8-557.8
#   Columna valor comienza en x ≈ 240
#   Fórmula reportlab (y desde abajo): page_h - pdfplumber_y1 + 2
#
# SAN RAFAEL (595 × 842 pt) — Sección 4 "Actores o Peticionarios"
#   Header  y pdfplumber 388.1-400.1
#   Fila 1  Nombre/DNI  y pdfplumber 413.5-426.4
#   Fecha   y pdfplumber 740.8-752.8  x ≈ 64

MENDOZA_PAGE_W  = 596
MENDOZA_PAGE_H  = 842
SAN_RAFAEL_W    = 595
SAN_RAFAEL_H    = 842

def create_mendoza_overlay(nombre: str, tipo_doc: str, domicilio: str) -> BytesIO:
    packet = BytesIO()
    c = canvas.Canvas(packet, pagesize=(MENDOZA_PAGE_W, MENDOZA_PAGE_H))
    c.setFont("Helvetica", 9)
    c.setFillColorRGB(0, 0, 0)

    # Row 1 — Apellido y Nombre / Razón Social
    c.drawString(240, 315, nombre[:65])

    # Row 2 — Tipo y Nº de Documento / CUIT
    c.drawString(240, 301, tipo_doc[:50])

    # Row 3 — Domicilio real
    c.drawString(240, 287, domicilio[:70])

    c.save()
    packet.seek(0)
    return packet


def create_san_rafael_overlay(nombre: str, dni: str, fecha: str) -> BytesIO:
    packet = BytesIO()
    c = canvas.Canvas(packet, pagesize=(SAN_RAFAEL_W, SAN_RAFAEL_H))

    # ── Cubrir datos anteriores con rectángulo blanco ──
    c.setFillColorRGB(1, 1, 1)
    # Fila actores (reportlab bottom-up: page_h - pdfplumber_y1 = 842 - 426.4 = 415.6)
    c.rect(36, 414, 530, 14, fill=1, stroke=0)
    # Fecha (842 - 752.8 = 89.2)
    c.rect(64, 88, 130, 14, fill=1, stroke=0)

    # ── Escribir nuevos datos ──
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica", 9)

    # Nombre en columna "Apellido y Nombres o Razón Social"
    c.drawString(40, 419, nombre[:55])

    # DNI en columna "DNI / CUIT"
    c.drawString(435, 419, dni[:18])

    # Fecha debajo de la línea "___________________  Fecha"
    c.drawString(70, 93, fecha)

    c.save()
    packet.seek(0)
    return packet


def merge_overlay(template_path: str, overlay_buffer: BytesIO) -> bytes:
    reader  = PdfReader(template_path)
    overlay = PdfReader(overlay_buffer)
    writer  = PdfWriter()

    page = reader.pages[0]
    page.merge_page(overlay.pages[0])
    writer.add_page(page)

    # Preservar páginas adicionales del template sin modificar
    for i in range(1, len(reader.pages)):
        writer.add_page(reader.pages[i])

    out = BytesIO()
    writer.write(out)
    return out.getvalue()


def main():
    data = json.load(sys.stdin)

    template    = data["template"]
    form_type   = data["form_type"]   # "mendoza" | "san_rafael"
    nombre      = data.get("nombre",   "").upper()
    tipo_doc    = data.get("tipo_doc", "")
    domicilio   = data.get("domicilio", "")
    fecha       = data.get("fecha", "")

    if form_type == "mendoza":
        overlay = create_mendoza_overlay(nombre, tipo_doc, domicilio)
    elif form_type == "san_rafael":
        overlay = create_san_rafael_overlay(nombre, tipo_doc, fecha)
    else:
        sys.exit(f"form_type desconocido: {form_type}")

    pdf_bytes = merge_overlay(template, overlay)
    sys.stdout.buffer.write(pdf_bytes)


if __name__ == "__main__":
    main()
