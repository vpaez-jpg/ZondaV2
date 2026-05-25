#!/usr/bin/env python3
"""
generar_reserva_pdf.py
Genera el PDF unificado de presentación de Reserva de Denominación SAS.

Uso:
  python3 generar_reserva_pdf.py <datos.json> <firma.png|""> <comprobante.pdf|""> <output.pdf>

Produce:
  Página 1: Formulario DPJ oficial completado con los datos del trámite
  Páginas 2+: Nota de Reserva de Denominación (con firma en última página)
  Últimas páginas: Comprobante de pago (si se provee)
"""

import sys
import json
import os
from io import BytesIO
from datetime import date

# ── Dependencias ───────────────────────────────────────────────
try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_JUSTIFY
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Image as RLImage, HRFlowable
    )
    from reportlab.pdfgen import canvas as rl_canvas
    from pypdf import PdfReader, PdfWriter
except ImportError as e:
    print(f"ERROR: Paquete Python faltante: {e}", file=sys.stderr)
    print("Instalá con: pip install reportlab pypdf Pillow", file=sys.stderr)
    sys.exit(1)

# ── Rutas ──────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FORMULARIO_PDF = os.path.join(SCRIPT_DIR, "formulario_dpj.pdf")

# ── Constantes fijas ───────────────────────────────────────────
AUTORIZADO   = ("Hugo Matias Bindelli DNI Nº 43.369.631, "
                "Valentin Nehuen Paez DNI Nº 42.749.912, "
                "Franco Sileoni D'angelo DNI Nº 42.266.242")
EMAIL_TEL    = "hbindelli@zondalegal.com  ·  261 249-5210"
DOM_ESTUDIO  = "Corredor del Oeste 7150, Edif. Avatar, Of. 10 B, Luján de Cuyo"
PRESENTANTE  = "HUGO MATIAS BINDELLI"

MESES = [
    'enero','febrero','marzo','abril','mayo','junio',
    'julio','agosto','septiembre','octubre','noviembre','diciembre',
]

W_PDF = 612.1   # ancho del formulario DPJ en pts
H_PDF = 1008.1  # alto del formulario DPJ en pts

# ── Helpers de datos ───────────────────────────────────────────
def fmt_capital(n: float) -> str:
    s = f"{n:,.0f}".replace(",", ".")
    return s

def fmt_dni(dni: str) -> str:
    digits = "".join(c for c in dni if c.isdigit())
    if len(digits) == 8:
        return f"{digits[:2]}.{digits[2:5]}.{digits[5:]}"
    return dni

def nacido_a(cuit: str) -> str:
    clean = "".join(c for c in str(cuit) if c.isdigit())
    return "nacida" if clean[:2] == "27" else "nacido"

def doc_string(dni: str, cuit: str, nacionalidad: str) -> str:
    if "argentin" in nacionalidad.lower() and dni:
        return f"DNI Nº {fmt_dni(dni)}, CUIT Nº {cuit}"
    return f"CDI {cuit}"

def calc_edad(fecha_iso: str, hoy: date) -> str:
    if not fecha_iso:
        return ""
    try:
        y, m, d = [int(x) for x in str(fecha_iso).split("-")]
        edad = hoy.year - y
        if (hoy.month, hoy.day) < (m, d):
            edad -= 1
        return str(edad)
    except Exception:
        return ""


# ══════════════════════════════════════════════════════════════
# PÁGINA 1 — Formulario DPJ oficial completado
# ══════════════════════════════════════════════════════════════
#
# Mapa de campos (extraído del formulario oficial):
#   untitled1  → TIPO DE TRÁMITE
#   untitled2  → DENOMINACIÓN SOCIAL
#   untitled3  → C.U.I.T. N°
#   untitled4  → DOMICILIO SOCIAL
#   untitled5  → ADMINISTRADORES
#   untitled6  → CAPITAL SOCIAL
#   untitled7  → DOCUMENTACIÓN ACOMPAÑADA (línea 1)
#   untitled8  → DOCUMENTACIÓN (línea 2)
#   untitled9  → DOCUMENTACIÓN (línea 3)
#   untitled10 → DOCUMENTACIÓN (línea 4 - vacía)
#   untitled11 → DOCUMENTACIÓN (línea 5 - vacía)
#   untitled12 → ESCRIBANO INTERVINIENTE
#   untitled13 → CONTADOR INTERVINIENTE
#   untitled14 → PROFESIONAL AUTORIZADO (inicio, campo corto en 1ra línea)
#   untitled15 → PROFESIONAL AUTORIZADO (continuación, línea completa)
#   untitled16 → E-MAIL y TELÉFONO
#   untitled17 → ÚLTIMO EJERCICIO CONTABLE
#   untitled18 → (línea extra — vacía)
#   untitled19 → POSEE SUMARIO
#   untitled20 → ACLARACIÓN Y D.N.I (debajo de firma)

def fill_formulario_dpj(datos: dict, firma_path: str) -> bytes:
    """Completa el formulario DPJ oficial con los datos del trámite."""

    # ── Extraer datos ────────────────────────────────────────
    denominaciones = datos.get("denominaciones", []) or []
    den1 = denominaciones[0] if denominaciones else ""
    den1_sas = den1 + " S.A.S."

    sede_social = str(datos.get("sede_social", "") or "-")
    capital_raw = float(datos.get("capital_social", 0) or 0)
    capital_fmt = f"$ {fmt_capital(capital_raw)}" if capital_raw else "-"

    admin_titular = datos.get("administrador_titular", {}) or {}
    admin_nombre  = str(admin_titular.get("nombre", "") or "-")

    # Split AUTORIZADO en dos partes para los dos campos del formulario
    # untitled14 es corto (~35 chars), untitled15 es línea completa
    split_idx = AUTORIZADO.find(",", 40)  # primera coma después de 40 chars
    if split_idx == -1:
        split_idx = 40
    autor_parte1 = AUTORIZADO[:split_idx].strip().rstrip(",")
    autor_parte2 = AUTORIZADO[split_idx:].strip().lstrip(",").strip()

    # ── Valores por campo ────────────────────────────────────
    field_values = {
        "untitled1":  "Reserva de denominación social",
        "untitled2":  den1_sas,
        "untitled3":  "-",
        "untitled4":  sede_social,
        "untitled5":  admin_nombre,
        "untitled6":  capital_fmt,
        "untitled7":  "1. Formulario de presentación",
        "untitled8":  "2. Nota de solicitud de reserva",
        "untitled9":  "3. Comprobante de pago Tasa 833",
        "untitled10": "",
        "untitled11": "",
        "untitled12": "-",
        "untitled13": "-",
        "untitled14": autor_parte1,
        "untitled15": autor_parte2,
        "untitled16": EMAIL_TEL,
        "untitled17": "-",
        "untitled18": "",
        "untitled19": "-",
        "untitled20": PRESENTANTE,
    }

    # ── Completar el formulario con pypdf ────────────────────
    reader = PdfReader(FORMULARIO_PDF)
    writer = PdfWriter()
    writer.append(reader)

    writer.update_page_form_field_values(
        writer.pages[0],
        field_values,
        auto_regenerate=False,
    )

    # ── Overlay: firma sobre el campo de firma ───────────────
    # Posición del campo untitled20 en coords PDF:
    # x: 445–587, y_bottom: 145, y_top: 177  (32 pts de alto)
    # Ponemos la firma un poco más arriba para que se vea bien
    if firma_path and os.path.exists(firma_path):
        overlay_buf = BytesIO()
        c = rl_canvas.Canvas(overlay_buf, pagesize=(W_PDF, H_PDF))

        sig_x = 440.0
        sig_y = 140.0   # y bottom en coords PDF
        sig_w = 150.0
        sig_h = 50.0    # un poco más alto que el campo para que se vea bien

        try:
            c.drawImage(
                firma_path, sig_x, sig_y,
                width=sig_w, height=sig_h,
                preserveAspectRatio=True, mask="auto"
            )
        except Exception:
            pass
        c.save()
        overlay_buf.seek(0)

        overlay_reader = PdfReader(overlay_buf)
        writer.pages[0].merge_page(overlay_reader.pages[0])

    # ── Serializar ───────────────────────────────────────────
    out = BytesIO()
    writer.write(out)
    return out.getvalue()


# ══════════════════════════════════════════════════════════════
# PÁGINAS 2+ — Nota de Reserva de Denominación
# ══════════════════════════════════════════════════════════════
def build_reserva_story(datos: dict, firma_path: str) -> list:
    """Construye la historia Platypus para la nota de reserva."""

    hoy = date.today()
    dia  = str(hoy.day).zfill(2)
    mes  = MESES[hoy.month - 1]
    anio = str(hoy.year)

    denominaciones = datos.get("denominaciones", []) or []
    den1 = denominaciones[0] if len(denominaciones) > 0 else "DENOMINACIÓN 1"
    den2 = denominaciones[1] if len(denominaciones) > 1 else "DENOMINACIÓN 2"
    den3 = denominaciones[2] if len(denominaciones) > 2 else "DENOMINACIÓN 3"

    # ── Procesar socios ─────────────────────────────────────
    raw_socios = datos.get("socios", []) or []
    capital_num = float(datos.get("capital_social", 0) or 0)
    socios = []
    for s in raw_socios:
        nombre       = str(s.get("nombre", "") or "")
        dni          = str(s.get("dni",    "") or "")
        cuit         = str(s.get("cuit",   "") or "")
        nac          = str(s.get("nacionalidad", "argentina") or "argentina")
        fecha_raw    = str(s.get("fecha_nacimiento", "") or "")
        fecha_fmt    = str(s.get("fecha_nacimiento_formateada") or fecha_raw)
        acciones_num = float(s.get("cantidad_acciones") or s.get("acciones_susc") or 0)
        total_acc    = capital_num / 100
        pct = f"{(acciones_num / total_acc * 100):.2f}%" if total_acc > 0 else "0%"
        socios.append({
            "nombre":          nombre,
            "doc_string":      doc_string(dni, cuit, nac),
            "edad":            calc_edad(fecha_raw, hoy),
            "nacido_a":        nacido_a(cuit),
            "nacionalidad":    nac,
            "fecha_nacimiento": fecha_fmt,
            "profesion":       str(s.get("profesion",    "") or ""),
            "estado_civil":    str(s.get("estado_civil", "") or ""),
            "domicilio":       str(s.get("domicilio",    "") or ""),
            "email":           str(s.get("email",        "") or ""),
            "porcentaje":      pct,
        })

    frase_socios = (
        "cuyo socio fundador será la siguiente persona"
        if len(socios) == 1
        else "cuyos socios fundadores serán las siguientes personas"
    )
    frase_saludo = "saluda" if len(socios) == 1 else "saludan"

    # ── Estilos ─────────────────────────────────────────────
    def sty(name, **kw) -> ParagraphStyle:
        base = dict(fontName='Helvetica', fontSize=10, leading=15,
                    spaceAfter=6, alignment=TA_JUSTIFY)
        base.update(kw)
        return ParagraphStyle(name, **base)

    normal = sty('n')
    right  = sty('r',  alignment=TA_RIGHT, spaceAfter=4)
    center = sty('c',  fontName='Helvetica-Bold', fontSize=12,
                       leading=18, spaceAfter=10, alignment=TA_CENTER)
    bold   = sty('b',  fontName='Helvetica-Bold')
    small  = sty('sm', fontSize=8.5, leading=12, spaceAfter=4)

    # ── Historia ─────────────────────────────────────────────
    story = []

    story.append(Paragraph(f"Mendoza, {dia} de {mes} de {anio}", right))
    story.append(Spacer(1, 0.35 * cm))

    story.append(Paragraph("RESERVA DE DENOMINACIÓN SOCIAL", center))
    story.append(HRFlowable(width="100%", thickness=0.5,
                             color=(0.08, 0.45, 0.25), spaceAfter=10))

    story.append(Paragraph("Señores", normal))
    story.append(Paragraph("<b>Dirección de Personas Jurídicas</b>", normal))
    story.append(Paragraph("S / D", normal))
    story.append(Spacer(1, 0.35 * cm))

    intro = (
        "De nuestra mayor consideración: Quienes suscriben se dirigen a Ud. a fin de "
        "solicitar la <b>RESERVA DE DENOMINACIÓN SOCIAL</b> para la sociedad a constituir, "
        f"{frase_socios}:"
    )
    story.append(Paragraph(intro, normal))
    story.append(Spacer(1, 0.25 * cm))

    for s in socios:
        bullet = (
            f"&bull;&nbsp; <b>{s['nombre']}</b>, {s['doc_string']}, "
            f"{s['edad']} años de edad, de nacionalidad {s['nacionalidad']}, "
            f"{s['nacido_a']} el {s['fecha_nacimiento']}, profesión: {s['profesion']}, "
            f"estado civil: {s['estado_civil']}, con domicilio en {s['domicilio']}, "
            f"constituyendo dirección electrónica: {s['email']}, "
            f"titular del {s['porcentaje']} del capital social."
        )
        story.append(Paragraph(bullet, normal))

    story.append(Spacer(1, 0.3 * cm))
    story.append(Paragraph(
        "Se propone la siguiente denominación social, con sus alternativas en caso de homonimia:",
        normal
    ))
    story.append(Spacer(1, 0.1 * cm))
    story.append(Paragraph(f"<b>1ra Opción:</b>&nbsp; {den1} S.A.S.", normal))
    story.append(Paragraph(f"<b>2da Opción:</b>&nbsp; {den2} S.A.S.", normal))
    story.append(Paragraph(f"<b>3ra Opción:</b>&nbsp; {den3} S.A.S.", normal))
    story.append(Spacer(1, 0.5 * cm))

    story.append(Paragraph(
        f"Sin otro particular, {frase_saludo} a Ud. atentamente.",
        normal
    ))
    story.append(Spacer(1, 1.2 * cm))

    # Firma en la nota
    if firma_path and os.path.exists(firma_path):
        try:
            img = RLImage(firma_path, width=4.2*cm, height=1.7*cm, hAlign='RIGHT')
            story.append(img)
        except Exception:
            story.append(Spacer(1, 1.8 * cm))
    else:
        story.append(Spacer(1, 1.8 * cm))

    story.append(HRFlowable(width="40%", thickness=0.5,
                             color=(0.7, 0.7, 0.7), hAlign='RIGHT', spaceAfter=4))

    name_sty = sty('ns', fontName='Helvetica-Bold', fontSize=8.5,
                   leading=12, spaceAfter=2, alignment=TA_RIGHT)
    addr_sty = sty('as', fontSize=7.5, leading=11, spaceAfter=2, alignment=TA_RIGHT)

    story.append(Paragraph(PRESENTANTE, name_sty))
    story.append(Paragraph(DOM_ESTUDIO, addr_sty))

    return story


def generate_reserva_pdf(datos: dict, firma_path: str) -> bytes:
    """Genera las páginas de la nota de reserva como bytes de PDF."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2.5*cm, rightMargin=2.5*cm,
        topMargin=2*cm, bottomMargin=2*cm,
        title="Reserva de Denominación Social"
    )
    story = build_reserva_story(datos, firma_path)
    doc.build(story)
    buf.seek(0)
    return buf.read()


# ══════════════════════════════════════════════════════════════
# MAIN — Unificación
# ══════════════════════════════════════════════════════════════
def main() -> None:
    if len(sys.argv) < 5:
        print("Uso: python3 generar_reserva_pdf.py <datos.json> <firma.png|''> <comprobante.pdf|''> <output.pdf>",
              file=sys.stderr)
        sys.exit(1)

    datos_path       = sys.argv[1]
    firma_path       = sys.argv[2].strip()
    comprobante_path = sys.argv[3].strip()
    output_path      = sys.argv[4]

    with open(datos_path, "r", encoding="utf-8") as f:
        datos = json.load(f)

    firma_ok       = bool(firma_path) and os.path.exists(firma_path)
    comprobante_ok = bool(comprobante_path) and os.path.exists(comprobante_path)

    # ── Página 1: Formulario DPJ oficial ────────────────────
    formulario_bytes = fill_formulario_dpj(datos, firma_path if firma_ok else "")

    # ── Páginas 2+: Nota de reserva ──────────────────────────
    reserva_bytes = generate_reserva_pdf(datos, firma_path if firma_ok else "")

    # ── Unificar ─────────────────────────────────────────────
    writer = PdfWriter()

    for page in PdfReader(BytesIO(formulario_bytes)).pages:
        writer.add_page(page)

    for page in PdfReader(BytesIO(reserva_bytes)).pages:
        writer.add_page(page)

    if comprobante_ok:
        for page in PdfReader(comprobante_path).pages:
            writer.add_page(page)

    with open(output_path, "wb") as f:
        writer.write(f)

    print(f"PDF generado: {output_path}")


if __name__ == "__main__":
    main()
