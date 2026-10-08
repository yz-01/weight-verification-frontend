/**
 * Audit M2 (2026-10-08): a failed background refetch must not wipe an open
 * edit form.
 *
 * The office lists now refetch on focus and on a one-minute safety poll. When
 * one of those refetches fails (a Wi-Fi blip, a 5xx while the API restarts),
 * TanStack Query keeps the record (`data`) and sets `isError`. The edit
 * loaders used to answer `isError` with the 「加载失败」 card, which unmounted
 * the form and threw away whatever had been typed. Only a record that never
 * arrived (`isLoadingError`) may show the card.
 *
 * Rendered to static markup - the runner has no DOM.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import messages from "@/messages/zh.json";

vi.mock("@/components/users/create-user", () => ({
  CreateUser: ({ user }: { user: { email: string } }) => <form data-testid="user-form">{user.email}</form>,
}));
vi.mock("@/services/users.service", () => ({
  getUser: vi.fn(() => Promise.reject(new Error("network"))),
}));

const { EditUser } = await import("@/components/users/edit-user");

const KEY = ["users", "detail", "42"];

/** A cache holding the given state for the record, with nothing refetching on mount. */
function clientWith(state: { data?: unknown; error: Error }) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retryOnMount: false, retry: false } },
  });
  if (state.data !== undefined) client.setQueryData(KEY, state.data);
  const query = client.getQueryCache().build(client, { queryKey: KEY });
  query.setState({
    status: "error",
    error: state.error,
    errorUpdateCount: 1,
    fetchFailureCount: 1,
    fetchFailureReason: state.error,
  });
  return client;
}

function render(client: QueryClient) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <EditUser id="42" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("EditUser loader (M2)", () => {
  it("keeps the open form when a background refetch fails", () => {
    const client = clientWith({ data: { id: "42", email: "ah.meng@site.test" }, error: new Error("network") });
    const state = client.getQueryState(KEY);
    // The state a failed refetch leaves behind: the record and the error together.
    expect(state?.status).toBe("error");
    expect(state?.data).toBeDefined();

    const html = render(client);
    expect(html).toContain('data-testid="user-form"');
    expect(html).toContain("ah.meng@site.test");
    expect(html).not.toContain(messages.errors.notFound);
  });

  it("still says the record could not be loaded when it never arrived", () => {
    const html = render(clientWith({ error: new Error("network") }));
    expect(html).not.toContain('data-testid="user-form"');
    expect(html).toContain(messages.errors.notFound);
  });
});
