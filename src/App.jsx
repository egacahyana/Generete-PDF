import { useState } from "react";
import pdfLogo from "./asset/logoPdf.png";

const ACCEPTED_TYPES = ".txt,.md,.json,.csv,.docx,.xlsx,.pptx,.png,.jpg,.jpeg";

export default function App() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFilesChange = (event) => {
    setError("");
    setFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const removeFile = (fileIndex) => {
    setFiles((currentFiles) => currentFiles.filter((_, index) => index !== fileIndex));
    setError("");
  };

  const convertFile = async () => {
    if (files.length === 0) {
      setError("Pilih satu atau beberapa file yang ingin dikonversi.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));

      const response = await fetch("/api/generate-pdf", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const responseText = await response.text();
        let message = `Konversi gagal (HTTP ${response.status}).`;
        if (responseText) {
          try {
            const result = JSON.parse(responseText);
            message = result.detail || message;
          } catch (parseError) {
            if (!(parseError instanceof SyntaxError)) {
              throw parseError;
            }
          }
        }
        throw new Error(message);
      }

      const pdf = await response.blob();
      const url = window.URL.createObjectURL(pdf);
      const link = document.createElement("a");
      const disposition = response.headers.get("Content-Disposition");
      const filename = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
      const fallbackName =
        files.length === 1
          ? `${files[0].name.replace(/\.[^.]+$/, "")}.pdf`
          : "hasil-konversi.zip";

      link.href = url;
      link.download = filename || fallbackName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (conversionError) {
      setError(
        conversionError.message || "Terjadi kesalahan saat mengonversi file.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <section className="converter" aria-labelledby="page-title">
        <div className="brand-mark" aria-label="Logo PDF">
          <img src={pdfLogo} alt="Logo PDF" />
        </div>
        <p className="eyebrow">KONVERSI FILE</p>
        <h1 id="page-title">Ubah file menjadi PDF</h1>
        <p className="intro">
          Unggah satu atau beberapa file teks, Office, atau gambar. Setiap file
          akan dikonversi menjadi PDF.
        </p>

        <label
          className={`upload-area${files.length ? " has-file" : ""}`}
          htmlFor="file-input"
        >
          <span className="upload-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 15V4m0 0L8 8m4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="upload-title">
            {files.length === 0
              ? "Pilih file untuk diunggah"
              : files.length === 1
                ? files[0].name
                : `${files.length} file dipilih`}
          </span>
          <span className="upload-hint">
            {files.length
              ? "Klik untuk mengubah pilihan file"
              : "Klik untuk memilih satu atau beberapa file"}
          </span>
          <input
            id="file-input"
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            onChange={handleFilesChange}
            disabled={loading}
          />
        </label>

        {files.length > 0 && (
          <ul className="selected-files" aria-label="File yang dipilih">
            {files.map((file, index) => (
              <li
                className="selected-file"
                key={`${file.name}-${file.lastModified}-${index}`}
              >
                <span className="selected-file-name" title={file.name}>
                  {file.name}
                </span>
                <button
                  className="remove-file-button"
                  type="button"
                  aria-label={`Hapus ${file.name} dari pilihan`}
                  title={`Hapus ${file.name}`}
                  onClick={() => removeFile(index)}
                  disabled={loading}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="file-types">
          Format yang didukung: TXT, MD, JSON, CSV, DOCX, XLSX, PPTX, PNG, JPG, JPEG
        </p>
        {files.length > 1 && (
          <p className="selection-note">
            Hasil konversi akan diunduh sebagai satu file ZIP.
          </p>
        )}

        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}

        <button
          className="convert-button"
          onClick={convertFile}
          disabled={!files.length || loading}
        >
          {loading ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Mengonversi...
            </>
          ) : files.length > 1 ? (
            `Konversi ${files.length} file ke PDF`
          ) : (
            "Konversi ke PDF"
          )}
        </button>
        <p className="privacy-note">File Anda diproses hanya untuk konversi.</p>
        <p className="creator-credit">
          by <span>ega fckr</span>
        </p>
      </section>
    </main>
  );
}
