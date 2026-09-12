import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

const DETAIL = "src/components/consultant-workflow/application-detail.tsx";

/**
 * A client reported that the remarks a consultant types into the application
 * form never appear again in the back office. The field was stored, serialized,
 * and printed onto the PDF the whole time — only the detail page never rendered
 * it, so the one place a reviewer actually looks was the one place it was
 * missing. These assertions pin the render down, because nothing else in the
 * chain would go red if it disappeared again.
 */
describe("consultant application detail renders remarks", () => {
  it("shows application.remarks as a read-only field", () => {
    const code = source(DETAIL);
    expect(code).toContain(
      '<ReadField label={t("field.remarks")} value={application.remarks}',
    );
  });

  it("keeps remarks in the site section next to the description it belongs with", () => {
    const code = source(DETAIL);
    const description = code.indexOf('label={t("field.description")}');
    const remarks = code.indexOf('label={t("field.remarks")}');
    const nextSection = code.indexOf('t("detail.section.evidence")');
    expect(description).toBeGreaterThan(-1);
    expect(remarks).toBeGreaterThan(description);
    expect(remarks).toBeLessThan(nextSection);
  });

  it("gives remarks the full-width class the other long-text field uses", () => {
    const code = source(DETAIL);
    const remarks = code.indexOf('label={t("field.remarks")}');
    const lineEnd = code.indexOf("\n", remarks);
    expect(code.slice(remarks, lineEnd)).toContain('className="sm:col-span-2"');
  });

  it("does not disturb the per-action approval remarks, which are a different thing", () => {
    const code = source(DETAIL);
    expect(code).toContain("{entry.remarks && <p className=\"mt-2 text-sm\">{entry.remarks}</p>}");
  });

  it("has the field.remarks label in all four catalogues", () => {
    for (const locale of ["en", "zh", "zh-TW", "ms"]) {
      const messages = JSON.parse(source(`src/messages/${locale}.json`));
      const label = messages.consultantWorkflow?.field?.remarks;
      expect(typeof label, `${locale} consultantWorkflow.field.remarks`).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
