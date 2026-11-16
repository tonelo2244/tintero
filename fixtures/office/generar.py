"""
Genera el corpus de archivos de Office de fixtures/office/.

Los archivos los escriben programas ajenos a Tintero (python-docx, openpyxl, python-pptx y
LibreOffice), así los tests comprueban cómo leemos lo que producen otros, no solo lo que
escribimos nosotros. Para regenerarlos:

    pip install python-docx openpyxl python-pptx
    python3 fixtures/office/generar.py

Hace falta LibreOffice (`soffice`) para las variantes "libreoffice-*".
"""

import shutil
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_COLOR_INDEX
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from openpyxl import Workbook
from openpyxl.formatting.rule import CellIsRule, ColorScaleRule, FormulaRule
from openpyxl.styles import Alignment, Font, PatternFill
from pptx import Presentation
from pptx.dml.color import RGBColor as PptxRGB
from pptx.enum.shapes import MSO_SHAPE
from pptx.util import Inches, Pt as PptxPt

HERE = Path(__file__).resolve().parent


def add_field(paragraph, instruction):
    """Campo de Word en su forma larga (fldChar begin/separate/end), la que usa Word."""
    def char(kind):
        run = paragraph.add_run()
        element = OxmlElement("w:fldChar")
        element.set(qn("w:fldCharType"), kind)
        run._r.append(element)

    char("begin")
    run = paragraph.add_run()
    text = OxmlElement("w:instrText")
    text.set(qn("xml:space"), "preserve")
    text.text = f" {instruction} "
    run._r.append(text)
    char("separate")
    paragraph.add_run("1")
    char("end")


def word_document(path):
    document = Document()
    section = document.sections[0]
    header = section.header.paragraphs[0]
    header.text = "Informe trimestral"
    header.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    footer.add_run("Página ")
    add_field(footer, "PAGE")
    footer.add_run(" de ")
    add_field(footer, "NUMPAGES")

    document.add_heading("Resultados", level=1)
    centered = document.add_paragraph("Texto centrado")
    centered.alignment = WD_ALIGN_PARAGRAPH.CENTER
    justified = document.add_paragraph("Texto justificado con varias palabras")
    justified.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

    mixed = document.add_paragraph("Normal, ")
    big = mixed.add_run("Arial 16 rojo")
    big.font.name = "Arial"
    big.font.size = Pt(16)
    big.font.color.rgb = RGBColor(0xC0, 0x39, 0x2B)
    mixed.add_run(" y ")
    marked = mixed.add_run("resaltado")
    marked.font.highlight_color = WD_COLOR_INDEX.YELLOW

    commented = document.add_paragraph("La cifra de ")
    target = commented.add_run("ventas")
    commented.add_run(" subió.")
    document.add_comment(target, text="¿De dónde sale este dato?", author="Ana", initials="A")

    right = document.add_paragraph("Firma")
    right.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    document.core_properties.created = datetime(2026, 11, 15)
    document.save(path)


def excel_workbook(path):
    book = Workbook()
    sheet = book.active
    sheet.title = "Ventas"
    sheet["A1"] = "Ventas por mes"
    sheet["A1"].font = Font(name="Georgia", size=16, bold=True)
    sheet.merge_cells("A1:C1")
    sheet.row_dimensions[1].height = 30
    sheet.append(["Mes", "Importe", "Nota"])
    for month, amount in [("Enero", 120), ("Febrero", 80), ("Marzo", 150)]:
        sheet.append([month, amount, "Texto largo que necesita varias líneas"])
    for row in range(3, 6):
        sheet.cell(row=row, column=3).alignment = Alignment(wrap_text=True)
    sheet.freeze_panes = "A3"
    sheet.conditional_formatting.add(
        "B3:B5",
        CellIsRule(operator="greaterThan", formula=["100"], fill=PatternFill("solid", start_color="FFC6EFCE"),
                   font=Font(bold=True, color="FF006100")),
    )
    sheet.conditional_formatting.add(
        "B3:B5", ColorScaleRule(start_type="min", start_color="FFFFFFFF", end_type="max", end_color="FF63BE7B")
    )
    # Una regla que Tintero no tiene: debe avisar, no fallar.
    sheet.conditional_formatting.add("A3:A5", FormulaRule(formula=["ISBLANK(A3)"], fill=PatternFill("solid", start_color="FFFFC7CE")))
    book.save(path)


def powerpoint_presentation(path):
    presentation = Presentation()
    slide = presentation.slides.add_slide(presentation.slide_layouts[5])  # Solo título
    slide.shapes.title.text = "Resumen"
    background = slide.background.fill
    background.solid()
    background.fore_color.rgb = PptxRGB(0x1F, 0x2A, 0x44)

    rotated = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(1), Inches(2), Inches(2), Inches(1))
    rotated.rotation = 30
    rotated.text_frame.text = "Girado"

    rows, cols = 3, 2
    table = slide.shapes.add_table(rows, cols, Inches(4.5), Inches(2), Inches(4), Inches(1.5)).table
    for row, values in enumerate([("Producto", "Precio"), ("Café", "1,50 €"), ("Té", "2,25 €")]):
        for col, value in enumerate(values):
            table.cell(row, col).text = value
    table.cell(0, 0).text_frame.paragraphs[0].runs[0].font.size = PptxPt(18)

    plain = presentation.slides.add_slide(presentation.slide_layouts[1])  # Título y contenido
    plain.shapes.title.text = "Segunda"
    plain.placeholders[1].text = "Con el fondo del patrón"
    presentation.save(path)


def word_page_layout(path):
    """Fase 12: carta apaisada con márgenes propios, salto de página y sangrías."""
    document = Document()
    section = document.sections[0]
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width, section.page_height = Cm(27.94), Cm(21.59)
    section.top_margin = section.bottom_margin = Cm(2)
    section.left_margin, section.right_margin = Cm(3), Cm(1.5)

    document.add_paragraph("Primera hoja")
    indented = document.add_paragraph("Sangría izquierda y primera línea")
    indented.paragraph_format.left_indent = Cm(2)
    indented.paragraph_format.first_line_indent = Cm(1)
    hanging = document.add_paragraph("Sangría francesa")
    hanging.paragraph_format.left_indent = Cm(1.27)
    hanging.paragraph_format.first_line_indent = Cm(-1.27)
    document.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
    document.add_paragraph("Segunda hoja")
    document.save(path)


def libreoffice_copy(source, target, extension):
    """Abre el archivo con LibreOffice y lo vuelve a guardar: otro programa, otro XML."""
    with tempfile.TemporaryDirectory() as folder:
        subprocess.run(
            ["soffice", "--headless", "--convert-to", extension, "--outdir", folder, str(source)],
            check=True,
            capture_output=True,
        )
        shutil.move(Path(folder) / f"{source.stem}.{extension}", target)


if __name__ == "__main__":
    word_document(HERE / "word-formato-directo.docx")
    word_page_layout(HERE / "word-pagina.docx")
    excel_workbook(HERE / "excel-formato.xlsx")
    powerpoint_presentation(HERE / "powerpoint-tema.pptx")
    libreoffice_copy(HERE / "word-formato-directo.docx", HERE / "libreoffice-formato-directo.docx", "docx")
    libreoffice_copy(HERE / "word-pagina.docx", HERE / "libreoffice-pagina.docx", "docx")
    libreoffice_copy(HERE / "excel-formato.xlsx", HERE / "libreoffice-formato.xlsx", "xlsx")
    libreoffice_copy(HERE / "powerpoint-tema.pptx", HERE / "libreoffice-tema.pptx", "pptx")
    print("Corpus regenerado en", HERE)
