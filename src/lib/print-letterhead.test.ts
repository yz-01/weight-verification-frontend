import { describe, expect, it } from "vitest";

import { LETTERHEAD_PRINT_CSS, letterheadHtml, PLATFORM_TAG } from "@/lib/print-letterhead";

/**
 * 全系统公司表头规则 (client, 2026-10-10): a printed page is headed with the
 * client company's own name and logo and the project; the platform's name is
 * only the small tag in the top right corner, never in the header.
 */
describe("letterheadHtml", () => {
  const head = {
    company_name: "Mu Construction Sdn Bhd",
    company_logo_url: "https://cdn.example.com/company/logo/mu.png",
    project_code: "P-NORTH",
    project_name: "North Tower",
    platform_tag: PLATFORM_TAG,
  };

  it("heads the page with the company's name, logo and project", () => {
    const html = letterheadHtml(head, "Emergency site list");
    const header = html.slice(html.indexOf('<header class="letterhead">'));

    expect(header).toContain("Mu Construction Sdn Bhd");
    expect(header).toContain('<img src="https://cdn.example.com/company/logo/mu.png"');
    expect(header).toContain("P-NORTH - North Tower");
    expect(header).toContain("<h1>Emergency site list</h1>");
  });

  it("names the platform only in the corner tag, never in the header", () => {
    const html = letterheadHtml(head, "Emergency site list");
    const header = html.slice(html.indexOf('<header class="letterhead">'));

    expect(html).toContain(`<p class="platform-tag">${PLATFORM_TAG}</p>`);
    expect(header).not.toContain("MSE Trace");
    expect(LETTERHEAD_PRINT_CSS).toContain(".platform-tag{position:fixed;top:4px;right:8px");
  });

  it("keeps one company's header to itself", () => {
    const other = letterheadHtml({ ...head, company_name: "Green Scrap Bhd", company_logo_url: null }, "List");

    expect(other).toContain("Green Scrap Bhd");
    expect(other).not.toContain("Mu Construction");
    expect(other).not.toContain("<img");
  });

  it("escapes the words and drops a logo link that is not a web address", () => {
    const html = letterheadHtml(
      { ...head, company_name: "<b>A&B</b>", company_logo_url: "javascript:alert(1)" },
      "<script>",
    );

    expect(html).toContain("&#60;b&#62;A&#38;B&#60;/b&#62;");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script>");
  });

  it("still prints the tag and title when the list has no company", () => {
    const html = letterheadHtml(undefined, "List");

    expect(html).toContain(PLATFORM_TAG);
    expect(html).toContain("<h1>List</h1>");
    expect(html).not.toContain('class="company"');
  });
});
