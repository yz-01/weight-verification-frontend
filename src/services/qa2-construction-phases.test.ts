/**
 * QA2 (JB271 walk): a project with 135 施工分类 offered only the first 100 in
 * 确认进度's 「关联现场进度」 filter, the 施工分类 tab and the pickers - the
 * server caps a page at 100 - so the newest 施工分类 could not be chosen.
 * Asked for more than one page, every page is read now.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const list = vi.fn();
vi.mock("@/services/api-client", () => ({
  api: { list: (...args: unknown[]) => list(...args) },
  download: vi.fn(),
  fetchAsFile: vi.fn(),
  fetchObjectUrl: vi.fn(),
  toastSuccess: vi.fn(),
}));

import { getConstructionPhases } from "@/services/contractor-ops.service";

const page = (n: number, of: number, size: number) => ({
  count: 135,
  total_pages: of,
  current_page: n,
  results: Array.from({ length: size }, (_, i) => ({ id: `p${n}-${i}` })),
});

describe("QA2 getConstructionPhases reads every page when asked for more than 100", () => {
  beforeEach(() => list.mockReset());

  it("135 施工分类 with page_size 200: both pages", async () => {
    list.mockImplementation((...args: unknown[]) => { const query = (args[1] ?? {}) as { page?: number }; return (
      Promise.resolve(query.page === 1 ? page(1, 2, 100) : page(2, 2, 35))); },
    );
    const result = await getConstructionPhases({ project: "x", page_size: 200 });
    expect(result.results).toHaveLength(135);
    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls[1][1]).toMatchObject({ project: "x", page: 2, page_size: 100 });
  });

  it("one page asked for: one call, as before", async () => {
    list.mockResolvedValue(page(1, 2, 20));
    await getConstructionPhases({ project: "x", page: 1, page_size: 20 });
    expect(list).toHaveBeenCalledTimes(1);
  });
});
