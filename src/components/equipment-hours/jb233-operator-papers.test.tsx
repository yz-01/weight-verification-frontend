/**
 * 操作人员资料 (JB233, 客户 11-20 事项 5, 图5、图6).
 *
 * 「目前列表只需要显示操作人员姓名，不必展开全部个人资料。点击操作人员姓名后，弹出
 * 完整资料……证件过期应有明显提示。」 The list cell is the name and an expiry tag;
 * the window shows the CIDB card, the licence and each competency certificate
 * with its validity, a red banner when one ran out, and 编辑资料 only for those
 * who manage the equipment; the office's 填写 form picks a registered operator.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { EquipmentHoursSession, OperatorPapers } from "@/interfaces/equipment-hours";
import messages from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
const auth = vi.hoisted(() => ({ manage: true }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u1", company_preferences: { date_format: "DD/MM/YYYY", time_format: "24H" } },
    can: (code: string) => (code === "equipment.manage" ? auth.manage : true),
  }),
}));

const { OperatorNameCell, OperatorProfileWindow, operatorPapersKey, papersTargetOf } = await import(
  "@/components/equipment-hours/operator-profile-window"
);
const { OperatorDialog, operatorPayload, registeredOperatorLabel } = await import(
  "@/components/equipment-hours/equipment-session-operator"
);

const words = messages.equipmentHours;
const papersWords = words.papers;

function render(node: React.ReactNode, seed: (client: QueryClient) => void = () => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed(client);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function papers(overrides: Partial<OperatorPapers> = {}): OperatorPapers {
  return {
    id: "p1",
    kind: "link",
    link: "l1",
    user: null,
    name: "Roslan bin Amat",
    company_name: "best concrete supply",
    project_name: "PUTRA_MAS",
    is_active: true,
    phone: "+60123456789",
    cidb_no: "5332389",
    cidb_expires_on: "2027-06-30",
    cidb_expiry: "ok",
    licence_no: "D 1234567",
    licence_class: "B2 D E",
    licence_expires_on: "2026-12-01",
    licence_expiry: "expiring",
    certificates: [
      {
        id: "c1",
        category: "MACHINE_COMPETENCY",
        title: "挖土机",
        number: "JKKP-778",
        issued_on: null,
        expires_on: "2026-11-14",
        expiry: "expired",
        files: [
          {
            id: "f1",
            section: "CERTIFICATE",
            certificate: "c1",
            original_name: "excavator.pdf",
            content_type: "application/pdf",
            preview_type: "application/pdf",
            byte_size: 1000,
            is_image: false,
            url: "https://api.test/media/excavator.pdf",
            uploaded_at: "2026-11-20T01:00:00Z",
            uploaded_by_name: "mike",
          },
        ],
      },
      {
        id: "c2",
        category: "OTHER",
        title: "Safety passport",
        number: "",
        issued_on: null,
        expires_on: null,
        expiry: "none",
        files: [],
      },
    ],
    cidb_files: [
      {
        id: "f2",
        section: "CIDB",
        certificate: null,
        original_name: "cidb.jpg",
        content_type: "image/jpeg",
        preview_type: "image/jpeg",
        byte_size: 1000,
        is_image: true,
        url: "https://api.test/media/cidb.jpg",
        uploaded_at: "2026-11-20T01:00:00Z",
        uploaded_by_name: "mike",
      },
    ],
    licence_files: [],
    expiry: "expired",
    can_edit: true,
    ...overrides,
  };
}

function window(data: OperatorPapers) {
  return render(<OperatorProfileWindow profile="p1" onClose={() => {}} />, (client) =>
    client.setQueryData(operatorPapersKey({ profile: "p1" }), data),
  );
}

describe("the 操作人员 cell of the list", () => {
  it("is only the name, a button that opens the papers, with a red 证件过期 when one ran out", () => {
    const html = render(
      <OperatorNameCell name="Roslan bin Amat" expiry="expired" canFill onOpen={() => {}} onFill={() => {}} />,
    );
    expect(html).toContain(">Roslan bin Amat</button>");
    expect(html).toContain(papersWords.tagExpired);
    expect(html).not.toContain("5332389");
  });

  it("says 即将到期 within 30 days and nothing when the papers are fine", () => {
    expect(
      render(<OperatorNameCell name="asa" expiry="expiring" canFill onOpen={() => {}} onFill={() => {}} />),
    ).toContain(papersWords.tagExpiring);
    const fine = render(<OperatorNameCell name="asa" expiry="ok" canFill onOpen={() => {}} onFill={() => {}} />);
    expect(fine).not.toContain(papersWords.tagExpired);
    expect(fine).not.toContain(papersWords.tagExpiring);
  });

  it("keeps 填写 for an empty row, for the office only", () => {
    expect(render(<OperatorNameCell name="" expiry="none" canFill onOpen={() => {}} onFill={() => {}} />)).toContain(
      words.operator.fill,
    );
    expect(
      render(<OperatorNameCell name="" expiry="none" canFill={false} onOpen={() => {}} onFill={() => {}} />),
    ).not.toContain(words.operator.fill);
  });

  it("opens the operator's papers, or only the typed words for somebody not registered", () => {
    expect(papersTargetOf({ operator_profile_id: "p1", operator_name: "Roslan" })).toEqual({ profile: "p1" });
    expect(papersTargetOf({ operator_profile_id: null, operator_name: "asa", cidb_no: "233234" })).toEqual({
      typed: { name: "asa", cidb: "233234" },
    });
  });
});

describe("the 操作人员资料 window", () => {
  it("shows every section the client listed, with the validity in words", () => {
    auth.manage = true;
    const html = window(papers());
    for (const label of [
      papersWords.cidbSection,
      papersWords.licenceSection,
      papersWords.certSection,
      papersWords.filesSection,
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Roslan bin Amat");
    expect(html).toContain(papersWords.fromLink);
    expect(html).toContain("5332389");
    expect(html).toContain("D 1234567");
    expect(html).toContain("B2 D E");
    expect(html).toContain("JKKP-778");
    expect(html).toContain(papersWords.catMACHINE_COMPETENCY);
    expect(html).toContain(papersWords.expiredOn.replace("{date}", "14/11/2026"));
    expect(html).toContain(papersWords.expiresOn.replace("{date}", "01/12/2026"));
    expect(html).toContain(papersWords.validTo.replace("{date}", "30/06/2027"));
    expect(html).toContain(papersWords.noDate);
    // The files: a photo's picture, a PDF's tile.
    expect(html).toContain("https://api.test/media/cidb.jpg");
    expect(html).toContain("excavator.pdf");
  });

  it("puts a red banner on top when a paper has expired", () => {
    expect(window(papers())).toContain(papersWords.expiredBanner);
    const fine = window(
      papers({
        expiry: "ok",
        licence_expiry: "ok",
        certificates: [],
      }),
    );
    expect(fine).not.toContain(papersWords.expiredBanner);
  });

  it("offers 编辑资料 only to those who manage the equipment", () => {
    expect(window(papers({ can_edit: true }))).toContain(papersWords.edit);
    auth.manage = false;
    expect(window(papers({ can_edit: false, phone: null }))).not.toContain(papersWords.edit);
    auth.manage = true;
  });

  it("for a typed name says he is not registered and offers to register him", () => {
    const html = render(
      <OperatorProfileWindow typed={{ name: "asa", cidb: "233234" }} onClose={() => {}} onRegister={() => {}} />,
    );
    expect(html).toContain("asa");
    expect(html).toContain("233234");
    expect(html).toContain(papersWords.notRegistered);
    expect(html).toContain(papersWords.register);
    auth.manage = false;
    const reader = render(
      <OperatorProfileWindow typed={{ name: "asa", cidb: "" }} onClose={() => {}} onRegister={() => {}} />,
    );
    expect(reader).toContain(papersWords.notRegistered);
    expect(reader).not.toContain(papersWords.register);
    auth.manage = true;
  });
});

describe("the office's 填写 form picks a registered operator", () => {
  const session = {
    key: "log-a",
    project: "proj-1",
    equipment_name: "Excavator",
    equipment_code: "EQ0001",
    site_no: "EQ0001",
    work_date: "2026-11-11",
    operator_name: "",
    cidb_no: "",
    operator_profile_id: null,
  } as unknown as EquipmentHoursSession;

  it("sends the picked operator's papers with the words", () => {
    expect(operatorPayload(session, " Roslan bin Amat ", " 5332389 ", false, "p1")).toEqual({
      session: "log-a",
      operator_name: "Roslan bin Amat",
      cidb_no: "5332389",
      apply_to_day: false,
      profile: "p1",
    });
    expect(operatorPayload(session, "asa", "", false)).not.toHaveProperty("profile");
  });

  it("lists each operator with his CIDB and company", () => {
    expect(registeredOperatorLabel({ name: "Muthu", cidb_no: "C-1", company_name: "Muthu Transport" })).toBe(
      "Muthu · CIDB C-1 · Muthu Transport",
    );
    expect(registeredOperatorLabel({ name: "ahmad", cidb_no: "", company_name: "" })).toBe("ahmad");
  });

  it("shows 选择已登记的操作人员 above the name, typing still allowed", () => {
    const html = render(<OperatorDialog session={session} onClose={() => {}} />, (client) =>
      client.setQueryData(
        ["equipment-operators", "list", "proj-1"],
        [{ id: "p1", kind: "link", name: "Roslan bin Amat", cidb_no: "5332389", company_name: "", expiry: "expired" }],
      ),
    );
    expect(html).toContain(papersWords.pick);
    expect(html).toContain(papersWords.pickHelp);
    expect(html.indexOf(papersWords.pick)).toBeLessThan(html.indexOf(words.operator.name));
    expect(html).toContain(words.operator.name);
  });
});
