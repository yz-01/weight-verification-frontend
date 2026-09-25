import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every field form that shows the draft banner must actually save its fields.
 *
 * F-282: all nine field record modes are wrapped in `<FieldDraft>`, which
 * renders "草稿已保存" unconditionally, but only three of them called
 * `useDraftState`. The other six kept their values in plain `useState`, so a
 * worker who mis-tapped lost everything they had typed *while the banner told
 * them it was saved*. A banner that lies is worse than no banner, and it is
 * the exact "shell that looks finished" the customer keeps asking us to avoid.
 *
 * Why this is asserted per *function body* rather than per file: three of the
 * six forms live in one 3000-line module alongside office-only dialogs. A
 * file-level `toContain` would pass as soon as any one form in the file was
 * wired, which is how a six-form gap hides behind a one-form fix.
 *
 * This is a source-level guard and it is deliberately not the whole story: it
 * proves the hook is named in the right function, not that the value survives
 * a real page close. The runtime half is `e2e/field-draft.spec.ts`, which
 * types into the form, closes the page and reopens it. Both are required —
 * see the reasoning in `field-draft-integration.test.ts` for why a source
 * assertion alone was what let F-282 through in the first place.
 */

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

/**
 * Slice one component out of a module.
 *
 * Anchors on the declaration and stops at the next top-level `function` /
 * `export function`, which is the shape every module here uses. Throws rather
 * than returning an empty string when the anchor is gone: a renamed component
 * must fail loudly, not silently assert against nothing.
 */
function componentBody(file: string, name: string): string {
  const code = source(file);
  const start = code.search(new RegExp(`^(?:export )?function ${name}\\b`, "m"));
  if (start === -1) {
    throw new Error(`${name} not found in ${file} - was it renamed?`);
  }
  const rest = code.slice(start + 1);
  const end = rest.search(/^(?:export )?function \w/m);
  return end === -1 ? rest : rest.slice(0, end);
}

interface FormCase {
  /** Which record mode the worker opens on the phone. */
  mode: string;
  file: string;
  component: string;
  /** Exact `useDraftState` calls this form must make, one per saved field. */
  fields: string[];
}

const FORMS: FormCase[] = [
  {
    mode: "equipment",
    file: "src/components/contractor-ops/operations-workspaces.tsx",
    component: "MovementDialog",
    // Namespaced by `row.id`: this dialog opens per equipment row, while the
    // draft store is scoped per *task*. Without the suffix, typing against
    // excavator A and then opening excavator B would show A's numbers under
    // B's name - a draft that reports the wrong machine is worse than none.
    fields: [
      'useDraftState(`operator:${row.id}`',
      'useDraftState(`vehicle:${row.id}`',
      'useDraftState(`deliveryNote:${row.id}`',
      'useDraftState(`quantity:${row.id}`',
      'useDraftState<EquipmentUnit>(`unit:${row.id}`',
      'useDraftState(`notes:${row.id}`',
      'useDraftState<File[]>(`photos:${row.id}`',
      'useDraftState(`fieldEvidence:${row.id}`',
      'useDraftState<File | undefined>(`deliveryNotePhoto:${row.id}`',
    ],
  },
  {
    mode: "progress",
    file: "src/components/contractor-ops/operations-workspaces.tsx",
    component: "ProgressDialog",
    fields: [
      'useDraftState("project"',
      'useDraftState("phase"',
      'useDraftState("percent"',
      'useDraftState("description"',
      'useDraftState<File[]>("photos"',
      'useDraftState("fieldEvidence"',
    ],
  },
  {
    mode: "outgoing",
    file: "src/components/contractor-ops/operations-workspaces.tsx",
    component: "OutgoingDialog",
    fields: [
      'useDraftState("project"',
      'useDraftState("form"',
      'useDraftState("photos"',
    ],
  },
  {
    mode: "disposal",
    file: "src/components/contractor-ops/site-disposal-workspaces.tsx",
    component: "CreateDisposalDialog",
    fields: [
      'useDraftState("project"',
      'useDraftState("description"',
      'useDraftState("locationDescription"',
      'useDraftState("volume"',
      'useDraftState("weight"',
      'useDraftState("preferred"',
      'useDraftState("note"',
      'useDraftState<File[]>("photos"',
      'useDraftState("fieldEvidence"',
    ],
  },
  {
    mode: "waste",
    file: "src/components/field-staff/field-records-panel.tsx",
    component: "WasteOutgoingCapturePanel",
    fields: [
      'useDraftState("project"',
      'useDraftState("category"',
      'useDraftState("quantity"',
      'useDraftState("unit"',
      'useDraftState("note"',
      'useDraftState("evidence"',
    ],
  },
  {
    mode: "consultant",
    file: "src/components/field-staff/field-records-panel.tsx",
    component: "ConsultantCapturePanel",
    fields: [
      'useDraftState("project"',
      'useDraftState("evidence"',
      'useDraftState("category"',
      'useDraftState("note"',
    ],
  },
];

describe("every field form that shows the draft banner actually saves (F-282)", () => {
  for (const form of FORMS) {
    describe(`${form.mode} (${form.component})`, () => {
      for (const field of form.fields) {
        it(`saves ${field.replace(/^useDraftState(<.*?>)?\(/, "").replace(/[`"']/g, "")}`, () => {
          expect(componentBody(form.file, form.component)).toContain(field);
        });
      }

      it("clears the draft once the submission is accepted", () => {
        const body = componentBody(form.file, form.component);
        expect(body).toContain("const clearDraft = useClearDraft()");
        expect(body).toContain("clearDraft()");
      });
    });
  }

  it("imports the draft hooks in each module that uses them", () => {
    for (const file of new Set(FORMS.map((form) => form.file))) {
      expect(source(file)).toContain(
        'from "@/components/field-staff/field-draft"',
      );
    }
  });
});

/**
 * The waste form's collection address was removed, not forgotten (T-227).
 *
 * The customer moved the order address to the office: site staff no longer
 * type it, the server falls back to the project address, and the office can
 * name a gate when it raises the order. Nothing on the screen shows that this
 * was a decision, so without this guard the field comes back the first time
 * somebody reads the office form and thinks the phone should match it - and
 * two people typing the same address is the problem the removal solved.
 *
 * Asserted against the component body, not the file: `field-records-panel.tsx`
 * is one module holding several forms, and the address label is still legitimately
 * used by the office workspace in another file.
 */
describe("the field waste form does not ask for the collection address (D-224)", () => {
  /**
   * The customer's answer to #37, which is the opposite of what the phone was
   * briefly built to do: 「现场人员从手机端发起时**直接使用手机当前定位**并确认
   * 位置在项目范围内，**不需要再填具体门口或取货点**」. Typing an address is the
   * office's step, because the office is the party not standing on site.
   *
   * D-117 had already reached the same place from the other side - two people
   * typing the same address, and no way to tell a chosen address from an
   * inherited one. D-224 is the customer confirming it, so the absence now has
   * two independent reasons and this block guards both.
   *
   * Asserted against the component body rather than the file: this module
   * holds several forms, and the address label is legitimately used by the
   * office workspace elsewhere.
   */
  const code = () =>
    componentBody(
      "src/components/field-staff/field-records-panel.tsx",
      "WasteOutgoingCapturePanel",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");

  it("still finds the form, so these absences mean something", () => {
    expect(code()).toContain('useDraftState("category"');
  });

  it("has no address input", () => {
    // The closing bracket is part of the needle: `field.pickupAddressHint`
    // contains `field.pickupAddress`, so the looser check is satisfied by a
    // help line and would stay green with the input still on screen.
    expect(code()).not.toContain('t("field.pickupAddress")');
  });

  it("keeps no draft slot for one", () => {
    expect(code()).not.toContain("pickupAddress");
  });

  it("sends no address with the submission", () => {
    expect(code()).not.toContain("pickup_address");
  });
});

/**
 * The phone submits; it does not "upload" as a separate step (D-209).
 *
 * D-189 read the customer's 【上传】 as a general "submit an application"
 * entry that every module and the phone would carry. D-209 says that reading
 * was wrong: 「现场人员手机端**不要**独立的【上传】按钮。现场人员在原本的手机
 * 页面完成拍照、填资料后直接提交即可」, while 「后台材料收货详情页**保留**
 * 【上传文件】用于补充附件」.
 *
 * Both halves are asserted, because each one alone is satisfiable in a way
 * that breaks the other: strip every upload control and the office loses the
 * way it attaches a late document; add a generic upload button to the phone
 * and the worker has two paths to the same submission and no way to tell
 * which one the office is waiting on.
 */
describe("upload belongs to the office, submitting belongs to the phone (D-209)", () => {
  const FIELD_FORMS = [
    ["src/components/field-staff/field-records-panel.tsx", "WasteOutgoingCapturePanel"],
    ["src/components/field-staff/field-records-panel.tsx", "ConsultantCapturePanel"],
  ] as const;

  for (const [file, form] of FIELD_FORMS) {
    it(`${form} submits rather than offering an upload action`, () => {
      const body = componentBody(file, form);
      // Its own submit path. Each form labels the button differently - one
      // says 提交, another names the category's submission mode - so the
      // presence check is on the mutation rather than on a copy key that
      // would make this guard about wording instead of about behaviour.
      expect(body).toContain("save.mutate()");
      // And no generic upload entry beside it. `action.upload` is the office
      // control; a second path on the phone would leave the worker with two
      // ways to send the same thing and no way to tell which one the office
      // is waiting on.
      expect(body).not.toContain('action.upload');
    });
  }

  it("the office keeps its way of attaching a document afterwards", () => {
    // The other half of D-209, and the reason the assertions above are not
    // "remove every upload control": 「后台材料收货详情页**保留**【上传文件】
    // 用于补充附件」.
    expect(source("src/components/receipts/view-receipt.tsx")).toContain(
      "receipts.addPhoto.upload",
    );
  });
});

/**
 * A returned application is over; the phone offers nothing to press (D-227).
 *
 * 客户第 45 条：「被退回的申请**不需要【重新提交】按钮**。一旦退回这笔申请就结束，
 * 原申请、退回原因和沟通记录全部保留，不再修改原记录。要再申请就**新建一条、
 * 生成新的记录 ID**，原退回记录继续保留在历史里，不能被新申请覆盖。」
 *
 * Both halves are asserted. Without the first, a "resubmit" button comes back
 * the first time somebody reads the old task wording. Without the second, the
 * absence is indistinguishable from a screen that failed to load - and a
 * worker looking at a dead end with no explanation goes and asks somebody,
 * which is the cost the sentence exists to avoid.
 */
describe("a returned application is closed on the phone (D-227)", () => {
  const body = () =>
    source("src/components/field-staff/my-submissions.tsx");

  it("offers no resubmit action", () => {
    expect(body()).not.toContain("resubmit");
    expect(body()).not.toContain("Resubmit");
  });

  it("says so, rather than leaving an empty screen", () => {
    expect(body()).toContain("mySubmissions.returnedClosed");
  });
});
