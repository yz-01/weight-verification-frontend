/**
 * J34-10 (Lucas 10-20): a list's files are pictures - a photograph, a PDF's
 * first page, a Word file's preview, else the file's type - never their names.
 */
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import messages from "@/messages/zh.json";

const { FileThumbs, pictureByName, stampedPicture } = await import("@/components/shared/file-thumbs");

function render(files: Parameters<typeof FileThumbs>[0]["files"]) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      <FileThumbs files={files} />
    </NextIntlClientProvider>,
  );
}

describe("a row's files as pictures (J34-10)", () => {
  it("draws a picture where there is one and the type where there is not", () => {
    const html = render([
      { id: "1", name: "17922223678605.jpg", thumbnail_url: "https://cdn.example/t1.webp" },
      { id: "2", name: "ptw.pdf", thumbnail_url: "https://cdn.example/page1.webp" },
      { id: "3", name: "ptw-lifting.docx", thumbnail_url: null },
    ]);
    expect(html.match(/data-file-thumb="picture"/g)).toHaveLength(2);
    expect(html.match(/data-file-thumb="icon"/g)).toHaveLength(1);
    expect(html).toContain("DOCX");
    // The name is the tooltip and the label, never the text of the row.
    expect(html).not.toContain(">17922223678605.jpg<");
    expect(html).toContain('title="17922223678605.jpg"');
  });

  it("shows three and 「+N」 for more than four", () => {
    const html = render(
      Array.from({ length: 6 }, (_, index) => ({ id: `${index}`, name: `f${index}.pdf`, thumbnail_url: null })),
    );
    expect(html.match(/data-file-thumb=/g)).toHaveLength(3);
    expect(html).toContain("+3");
  });

  it("says nothing for no files", () => {
    expect(render([])).toContain("—");
  });
});

describe("a record's files as pictures everywhere (J34-11)", () => {
  function renderAll(files: Parameters<typeof FileThumbs>[0]["files"]) {
    return renderToStaticMarkup(
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <FileThumbs all files={files} />
      </NextIntlClientProvider>,
    );
  }

  it("shows every file in a detail, none behind 「+N」", () => {
    const html = renderAll(
      Array.from({ length: 6 }, (_, index) => ({ id: `${index}`, name: `f${index}.pdf`, thumbnail_url: null })),
    );
    expect(html.match(/data-file-thumb=/g)).toHaveLength(6);
    expect(html).not.toContain("+");
  });

  it("opens a file from its picture - a link, or a button for a preview", () => {
    const html = renderAll([
      { id: "a", name: "slip.jpg", thumbnail_url: "https://cdn.example/slip.jpg", href: "https://cdn.example/slip.jpg" },
      { id: "b", name: "quote.xlsx", onOpen: () => {} },
    ]);
    expect(html.match(/data-file-open/g)).toHaveLength(2);
    expect(html).toContain('href="https://cdn.example/slip.jpg"');
    expect(html).toContain('type="button"');
  });

  it("uses a photograph's stamped copy, and a name only says photograph by its ending", () => {
    expect(stampedPicture("image/jpeg", "https://cdn.example/stamped.jpg")).toBe("https://cdn.example/stamped.jpg");
    expect(stampedPicture("image/jpeg", null)).toBeNull();
    expect(stampedPicture("application/pdf", "https://cdn.example/x.pdf")).toBeNull();
    expect(pictureByName("site.PNG", "https://cdn.example/site.png")).toBe("https://cdn.example/site.png");
    expect(pictureByName("ptw.pdf", "https://cdn.example/ptw.pdf")).toBeNull();
  });
});
