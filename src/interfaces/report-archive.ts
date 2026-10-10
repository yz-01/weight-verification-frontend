/**
 * What every report export history row says about its stored file
 * (报表导出历史 as an archive, 2026-10-10).
 *
 * The file itself is never linked: it is fetched through
 * `/api/report-exports/<id>/download_file/`, which checks who asks.
 */
export interface ArchivedReportFile {
  id: string;
  file_name: string;
  export_format: "PDF" | "EXCEL";
  /** False on rows generated before files were kept: nothing to open. */
  has_file: boolean;
  /** Bytes; 0 when no file was kept. */
  file_size: number;
  /** The SHA-256 recorded when the file was generated; checked on every open. */
  file_sha256: string;
}
