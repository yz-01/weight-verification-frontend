import { fetchAsFile } from "@/services/api-client";

/**
 * A report export history row's stored file - the one generated at the time,
 * never rebuilt from today's data (报表导出历史 as an archive, 2026-10-10).
 *
 * To look at or print in the page: not noted as the report leaving again.
 */
export const previewArchivedReport = (id: string, fileName: string): Promise<File> =>
  fetchAsFile(`/api/report-exports/${id}/download_file/`, {
    query: { inline: "1" },
    fallbackFilename: fileName,
  });

/** The same stored file, to save or send: the server notes the download. */
export const archivedReportFile = (id: string, fileName: string): Promise<File> =>
  fetchAsFile(`/api/report-exports/${id}/download_file/`, {
    fallbackFilename: fileName,
  });
