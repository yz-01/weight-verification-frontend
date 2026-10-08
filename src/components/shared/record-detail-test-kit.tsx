/**
 * What a test needs to render one module's record detail in its popup (E8).
 *
 * The runner has no DOM, so a Radix dialog - which mounts into a portal
 * after the first paint - renders nothing under `renderToStaticMarkup`.
 * A test therefore swaps the dialog primitives for plain elements, with
 *
 *     vi.mock("@/components/ui/dialog", () => inlineDialogModule());
 *
 * and renders through `renderDetail`, which provides the query cache (seeded
 * by the test), the messages and the time zone the real screens read.
 *
 * Test-only: imported by `*.test.tsx` files and nothing else.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";

import { TooltipProvider } from "@/components/ui/tooltip";
import messages from "@/messages/zh.json";

type Props = { children?: React.ReactNode } & Record<string, unknown>;

/** Strip the props a plain element would print as nonsense attributes. */
function plain(props: Props) {
  const rest: Record<string, unknown> = { ...props };
  for (const key of ["children", "asChild", "onOpenChange", "open"]) delete rest[key];
  return { children: props.children, rest: rest as React.HTMLAttributes<HTMLElement> };
}

function InlineDialog(props: Props) {
  return <div data-dialog>{plain(props).children}</div>;
}

function InlineDiv(props: Props) {
  const { children, rest } = plain(props);
  return <div {...rest}>{children}</div>;
}

function InlineTitle(props: Props) {
  const { children, rest } = plain(props);
  return <h2 {...rest}>{children}</h2>;
}

function InlineText(props: Props) {
  const { children, rest } = plain(props);
  return <p {...rest}>{children}</p>;
}

/** `@/components/ui/dialog`, drawn in place instead of in a portal. */
export function inlineDialogModule() {
  return {
    Dialog: InlineDialog,
    DialogContent: InlineDiv,
    DialogHeader: InlineDiv,
    DialogFooter: InlineDiv,
    DialogTitle: InlineTitle,
    DialogDescription: InlineText,
    DialogClose: InlineDiv,
    DialogTrigger: InlineDiv,
    DialogPortal: InlineDiv,
    DialogOverlay: InlineDiv,
  };
}

/** A recorder with a number and a face, as the server sends one (E8). */
export const RECORDER = {
  created_by_name: "Ah Seng",
  created_by_phone: "+60 12-345 6789",
  created_by_avatar: "https://cdn.example/avatars/ah-seng.jpg",
} as const;

/** The `tel:` link the recorder's number becomes. */
export const RECORDER_TEL = 'href="tel:+60123456789"';

export function renderDetail(
  node: React.ReactNode,
  seed: (client: QueryClient) => void = () => {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  seed(client);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/**
 * The popup frame and the recorder block, in the order the canvas has them:
 * the dialog's header, then the shell, with 记录人 and its tap-to-call link.
 */
export function expectRecordPopup(
  html: string,
  expect: (value: unknown) => { toContain: (s: string) => void; toMatch: (r: RegExp) => void },
) {
  expect(html).toContain('data-record-detail="dialog"');
  expect(html).toContain("data-record-detail-header");
  expect(html).toContain("data-shell-recorder");
  expect(html).toContain(RECORDER.created_by_name);
  expect(html).toContain(RECORDER_TEL);
}
