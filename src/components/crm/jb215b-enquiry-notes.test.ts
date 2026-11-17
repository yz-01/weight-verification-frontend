/**
 * JB215B-10 (noticed in JB209, 「not done」): an enquiry's 跟进记录 read one
 * page - the server's first 25 notes - so an enquiry with more lost the rest
 * from the screen. It reads every page now, the way the pickers do since
 * JB209-14 (`readAllPages`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/services/api-client", async (original) => ({
  ...(await original<typeof import("@/services/api-client")>()),
  api,
}));

const { getEnquiryNotes } = await import("@/services/crm.service");
const { readAllPages } = await import("@/hooks/use-paged-list");

const note = (id: number) => ({ id: `n${id}`, note: `#${id}`, author_name: "A", created_at: "2026-11-17T00:00:00Z" });

describe("JB215B-10 an enquiry's notes", () => {
  it("are read page after page", async () => {
    api.list.mockImplementation(async (_url: string, query: { page: number; page_size: number }) => ({
      count: 130,
      page: query.page,
      page_size: query.page_size,
      total_pages: 2,
      results: query.page === 1 ? Array.from({ length: 100 }, (_, i) => note(i)) : Array.from({ length: 30 }, (_, i) => note(100 + i)),
    }));
    const all = await readAllPages((paging) => getEnquiryNotes("e-1", paging));
    expect(all.results).toHaveLength(130);
    expect(api.list).toHaveBeenCalledWith("/api/customer-enquiries/e-1/get_notes/", expect.objectContaining({ page: 2 }));
  });

  it("is how the enquiry's notes box asks for them", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/crm/customer-service-workspace.tsx"),
      "utf8",
    );
    expect(source).toContain("readAllPages((paging) => getEnquiryNotes(enquiry.id, paging))");
  });
});
