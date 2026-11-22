import re
import io
import zipfile
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from PIL import Image, UnidentifiedImageError

from fpdf import FPDF
from docx import Document
from openpyxl import load_workbook
from pptx import Presentation

app = FastAPI()

SUPPORTED_EXTENSIONS = {
    ".txt", ".md", ".json", ".csv", ".docx", ".xlsx", ".pptx",
    ".png", ".jpg", ".jpeg",
}

def safe_filename(title: str) -> str:
    """Sanitasi nama file untuk semua platform."""
    base = re.sub(r"[^a-zA-Z0-9_-]", "_", title.strip())
    return f"{base or 'document'}.pdf"

def sanitize_text(txt: str) -> str:
    """fpdf2 hanya mendukung latin-1 secara default."""
    return txt.encode("latin-1", "replace").decode("latin-1")

def generate_pdf(title: str, content: str) -> bytes:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, txt=sanitize_text(title), ln=True, align="C")
    pdf.ln(10)
    pdf.set_font("Helvetica", size=12)
    pdf.multi_cell(0, 7, txt=sanitize_text(content))
    return bytes(pdf.output())

def generate_image_pdf(image_bytes: bytes) -> bytes:
    with Image.open(io.BytesIO(image_bytes)) as image:
        if image.format not in {"PNG", "JPEG"}:
            raise ValueError("Only PNG and JPEG images are supported.")
        orientation = "L" if image.width > image.height else "P"
        image.verify()

    pdf = FPDF(orientation=orientation, unit="mm", format="A4")
    pdf.set_auto_page_break(auto=False)
    pdf.add_page()
    pdf.image(
        io.BytesIO(image_bytes),
        x=0,
        y=0,
        w=pdf.w,
        h=pdf.h,
        keep_aspect_ratio=True,
    )
    return bytes(pdf.output())

def extract_office_text(extension: str, file_bytes: bytes) -> str:
    source = io.BytesIO(file_bytes)

    if extension == ".docx":
        document = Document(source)
        parts = [paragraph.text for paragraph in document.paragraphs if paragraph.text.strip()]
        for table in document.tables:
            parts.extend(
                "\t".join(cell.text for cell in row.cells)
                for row in table.rows
            )
        return "\n".join(parts)

    if extension == ".xlsx":
        workbook = load_workbook(source, read_only=True, data_only=False)
        parts = []
        try:
            for sheet in workbook.worksheets:
                parts.append(f"[{sheet.title}]")
                for row in sheet.iter_rows(values_only=True):
                    values = [str(value) if value is not None else "" for value in row]
                    if any(values):
                        parts.append("\t".join(values))
        finally:
            workbook.close()
        return "\n".join(parts)

    if extension == ".pptx":
        presentation = Presentation(source)
        parts = []
        for slide_number, slide in enumerate(presentation.slides, start=1):
            parts.append(f"[Slide {slide_number}]")
            for shape in slide.shapes:
                if shape.has_table:
                    parts.extend(
                        "\t".join(cell.text for cell in row.cells)
                        for row in shape.table.rows
                    )
                elif shape.has_text_frame and shape.text.strip():
                    parts.append(shape.text.strip())
        return "\n".join(parts)

    return file_bytes.decode("utf-8-sig", "replace")

@app.post("/api/generate-pdf")
async def convert_files(files: list[UploadFile] = File(...)):
    """Convert uploaded text, Office documents, or images to PDF."""
    if not files:
        raise HTTPException(status_code=422, detail="Pilih setidaknya satu file untuk dikonversi.")

    converted_files = []
    used_filenames = set()

    for file in files:
        original_filename = Path(file.filename or "document.txt").name
        extension = Path(original_filename).suffix.lower()
        if extension not in SUPPORTED_EXTENSIONS:
            raise HTTPException(
                status_code=415,
                detail=(
                    "Format file tidak didukung. Gunakan TXT, MD, JSON, CSV, "
                    "DOCX, XLSX, PPTX, PNG, JPG, atau JPEG."
                ),
            )

        title = Path(original_filename).stem or "document"
        file_bytes = await file.read()
        if extension in {".png", ".jpg", ".jpeg"}:
            try:
                pdf_bytes = generate_image_pdf(file_bytes)
            except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as error:
                raise HTTPException(
                    status_code=422,
                    detail=f"File {original_filename} bukan gambar PNG atau JPEG yang valid.",
                ) from error
        else:
            content = extract_office_text(extension, file_bytes)
            pdf_bytes = generate_pdf(title, content)
        output_filename = safe_filename(title)

        base_name = output_filename[:-4]
        suffix = 2
        while output_filename in used_filenames:
            output_filename = f"{base_name}_{suffix}.pdf"
            suffix += 1
        used_filenames.add(output_filename)
        converted_files.append((output_filename, pdf_bytes))

    if len(converted_files) == 1:
        filename, pdf_bytes = converted_files[0]
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for filename, pdf_bytes in converted_files:
            zip_file.writestr(filename, pdf_bytes)
    archive.seek(0)
    return StreamingResponse(
        archive,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="hasil-konversi.zip"'},
    )
