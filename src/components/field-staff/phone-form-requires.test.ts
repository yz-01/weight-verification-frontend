import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * What each phone form will not submit without (JB152, 客户 11-10 第二批事项 1).
 *
 * The client, on the phone's 「材料退场 / 退回」 (图 14) with the material chosen
 * and 「还差这些没填：材料名称」 holding back 提交:
 *
 *   「下拉材料名称已有了，还要填写才能上传不合里，不填也能上传，必须能上传，因为
 *   后台可以改正。请开办团队查看所有手机端在修改」
 *
 * Every phone form was checked (`wt/review/jb152.md`). A name typed beside an
 * item already chosen, or words the office can put right later, no longer
 * hold the button; what the client set - the project, the material, the
 * quantity, photographs, signatures, GPS, D-280's plate and DO, JB149's
 * anomaly reason - still does. This pins each list, so the next field to be
 * made compulsory on a phone is a decision somebody has to write down here.
 *
 * Read from the source (there is no DOM in this runner); the red star beside
 * each field is `check-required-stars`' job (`npm run lint`).
 */

function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

/** The source of one top-level component, comments removed. */
function componentBody(file: string, name: string) {
  const code = read(file);
  const start = code.search(new RegExp(`^(?:export )?function ${name}\\b`, "m"));
  expect(start, `${name} in ${file}`).toBeGreaterThan(-1);
  const rest = code.slice(start + 1);
  const next = rest.search(/\n(?:export )?function [A-Z]/);
  const body = next === -1 ? code.slice(start) : code.slice(start, start + 1 + next);
  return body.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Text between balanced brackets starting at `start`. */
function balanced(source: string, start: number, open = "[", close = "]") {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === open) depth += 1;
    else if (source[i] === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return "";
}

/** The message key each `[value, t("key")]` pair of a requires list names. */
function keysOf(list: string) {
  const keys: string[] = [];
  const body = list.slice(1, -1);
  let i = 0;
  while (i < body.length) {
    if (body[i] !== "[") {
      i += 1;
      continue;
    }
    const pair = balanced(body, i);
    const named = [...pair.matchAll(/\w*\(\s*"([\w.]+)"/g)].map((match) => match[1]);
    if (named.length) keys.push(named[named.length - 1]);
    i += pair.length || 1;
  }
  return keys;
}

/** Every key the component's submit buttons demand, in order. */
function demanded(file: string, component: string) {
  const body = componentBody(file, component);
  const keys: string[] = [];
  for (const match of body.matchAll(/requires=\{\[/g)) {
    keys.push(...keysOf(balanced(body, (match.index ?? 0) + "requires={".length)));
  }
  return keys;
}

/** The attributes of the FieldWrapper labelled `key` in a component. */
function wrapper(file: string, component: string, key: string) {
  const body = componentBody(file, component);
  const at = body.indexOf(`<FieldWrapper label={t("${key}")}`);
  expect(at, `${component} has a field labelled ${key}`).toBeGreaterThan(-1);
  // Up to the tag's own `>`, not one inside an attribute's braces.
  let depth = 0;
  for (let i = at; i < body.length; i += 1) {
    if (body[i] === "{") depth += 1;
    else if (body[i] === "}") depth -= 1;
    else if (body[i] === ">" && depth === 0) return body.slice(at, i + 1);
  }
  return body.slice(at);
}

const RECORDS = "src/components/field-staff/field-records-panel.tsx";
const WORKSPACES = "src/components/contractor-ops/operations-workspaces.tsx";
const DISPOSAL = "src/components/contractor-ops/site-disposal-workspaces.tsx";
const SUNDRY = "src/components/field-staff/sundry-claim-capture.tsx";
const EXIT = "src/components/contractor-ops/equipment-exit.tsx";
const SAFETY = "src/components/site-operations/safety.tsx";
const GATE = "src/components/site-access/gate-records.tsx";
const HOURS = "src/components/equipment-hours/equipment-hours-capture.tsx";
const WORKSPACE = "src/components/field-staff/field-staff-workspace.tsx";
const TASKS = "src/components/field-staff/my-tasks-panel.tsx";
const PERMITS = "src/components/permits/permit-parts.tsx";
const REQUEST = "src/components/material-requests/request-form.tsx";
const RAIN = "src/components/field-staff/rainy-weather-capture.tsx";

describe("JB152: what each phone form still demands", () => {
  it.each([
    [
      "材料进场",
      RECORDS,
      "MaterialCapturePanel",
      [
        "material.project", "material.column", "material.quantity", "material.reject.reason",
        "material.vehicle", "material.doNo", "material.receiverSignature", "material.supplierSignature",
        "materialEvidence.title", "material.location",
      ],
    ],
    [
      "材料退场 / 退回",
      WORKSPACES,
      "OutgoingDialog",
      [
        "field.project", "outgoing.material", "field.unit", "outgoing.returnQuantity", "field.executor",
        "field.reason", "outgoing.evidence.title", "field.location",
      ],
    ],
    [
      "实际退场",
      WORKSPACES,
      "ExitForm",
      [
        "outgoing.processingPhotos", "outgoing.material", "outgoing.returnedQuantity",
        "outgoing.siteSignature", "outgoing.supplierSignature",
      ],
    ],
    ["环保材料出场", RECORDS, "WasteOutgoingCapturePanel", ["field.project", "field.category", "field.unit", "evidence.title", "field.location"]],
    ["顾问资料提交", RECORDS, "ConsultantCapturePanel", ["consultantCapture.project", "consultantCapture.photos", "consultantCapture.location"]],
    ["杂费报销", SUNDRY, "SundryClaimCapture", ["project", "amount", "attachments", "location"]],
    ["内部清运（每车）", DISPOSAL, "InternalDisposalWorkspace", ["field.weight"]],
    [
      "垃圾清运申请",
      DISPOSAL,
      "CreateDisposalDialog",
      ["field.project", "field.waste", "field.siteLocation", "field.photos", "field.gps", "field.plannedTrips"],
    ],
    ["报告异常", DISPOSAL, "AnomalyDialog", ["anomaly.trip", "anomaly.reason", "anomaly.photos", "field.gps"]],
    ["清运现场照片", DISPOSAL, "SiteEvidenceDialog", ["siteEvidence.photos", "field.gps"]],
    [
      "设备进场",
      WORKSPACES,
      "EquipmentEntryDialog",
      [
        "equipment.newMachineName", "field.photos", "field.deliveryNoteNo", "equipment.siteSignature",
        "equipment.supplierSignature", "field.location",
      ],
    ],
    ["设备退场申请", EXIT, "EquipmentExitApplyDialog", ["equipmentExit.reason", "equipmentExit.applyPhotos"]],
    [
      "设备实际退场",
      EXIT,
      "EquipmentExitHandoverForm",
      [
        "equipmentExit.scanMachine", "field.photos", "equipmentExit.vehiclePlate", "equipment.siteSignature",
        "equipment.supplierSignature", "field.location",
      ],
    ],
    ["设备操作员工时", HOURS, "EquipmentHoursCapture", ["phone.project", "phone.photo", "phone.signature", "phone.location"]],
    // JB192 (客户第 5 点: 「现场人员不需要手动填写时间或计算下雨时长」): nothing
    // to type - each step is one camera button, and the two photos are the
    // record. No GPS fix never holds it (a photo record, 11-09 item 6).
    ["Rainy Weather", RAIN, "RainyWeatherCapture", []],
    ["工程进度", WORKSPACES, "ProgressDialog", ["field.project", "field.phase", "field.photos", "field.location"]],
    ["整改提交", SAFETY, "SafetySubmitDialog", ["field.photo", "field.location", "field.workDone"]],
    ["考勤", WORKSPACE, "FieldAttendancePanel", ["attendance.selectProject", "attendance.takeSelfie", "attendance.getLocation"]],
    ["门岗拍照", GATE, "GatePhotoCapture", ["field.project", "field.photos", "field.project", "field.photos"]],
    ["我的任务", TASKS, "FieldTaskWork", ["photos", "note"]],
    ["施工准证申请", PERMITS, "PermitApplyForm", ["field.project", "field.files", "field.approver"]],
  ])("%s", (_name, file, component, keys) => {
    expect(demanded(file, component)).toEqual(keys);
  });

  it("the hazard report asks for its photo, project and GPS, and a deadline only with a rectifier", () => {
    // Its list is `...(fieldMode ? [phone pairs] : [office pairs])`, which
    // keysOf reads as one pair per branch - so read the phone branch itself.
    const body = componentBody(SAFETY, "SafetyCreateDialog");
    const at = body.indexOf("...(fieldMode");
    expect(at).toBeGreaterThan(-1);
    const phone = balanced(body, body.indexOf("[", at));
    expect(keysOf(phone)).toEqual(["safety.field.photo", "safety.field.project", "safety.field.location"]);
    expect(demanded(SAFETY, "SafetyCreateDialog")).toContain("safetyRectification.field.dueAt");
  });

  it("the MR asks for the material, its specification, quantity, unit and approver - not the typed words", () => {
    const body = componentBody(REQUEST, "MaterialRequestForm");
    const block = body.slice(body.indexOf("const requirements"), body.indexOf("const openCategoryManagement"));
    for (const key of ["field.project", "field.requestType", "field.material", "field.specification", "field.quantity", "field.unit", "field.assignedReviewer", "field.content"]) {
      expect(block, key).toContain(`t("${key}")`);
    }
    for (const key of ["field.materialName", "field.specificationName", "field.subject"]) {
      expect(block, key).not.toContain(`t("${key}")`);
    }
  });
});

describe("JB152: the fields let go wear no star and say the office fills them in", () => {
  it.each([
    [RECORDS, "MaterialCapturePanel", "material.otherName", "material.otherNameHint"],
    [WORKSPACES, "OutgoingDialog", "outgoing.materialName", "outgoing.materialNameHint"],
    [RECORDS, "WasteOutgoingCapturePanel", "field.otherName", "field.otherNameHint"],
    [RECORDS, "ConsultantCapturePanel", "consultantCapture.askFor", "consultantCapture.askForHint"],
    [SUNDRY, "SundryClaimCapture", "description", "descriptionHint"],
    [DISPOSAL, "InternalDisposalWorkspace", "field.doNo", "field.doNoHint"],
    [REQUEST, "MaterialRequestForm", "field.materialName", "form.otherMaterialHint"],
    [REQUEST, "MaterialRequestForm", "field.specificationName", "form.otherSpecHint"],
    [REQUEST, "MaterialRequestForm", "field.subject", "form.subjectHint"],
  ])("%s %s: %s", (file, component, key, hint) => {
    const attrs = wrapper(file, component, key);
    expect(attrs).not.toMatch(/\brequired\b/);
    expect(attrs).toContain(`hint={t("${hint}")}`);
  });

  it("the hints say it in the words the phone already uses, in all four languages", () => {
    const zh = JSON.parse(read("src/messages/zh.json"));
    const en = JSON.parse(read("src/messages/en.json"));
    const ms = JSON.parse(read("src/messages/ms.json"));
    const tw = JSON.parse(read("src/messages/zh-TW.json"));
    const at = (data: Record<string, unknown>, key: string) =>
      key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], data);
    for (const key of [
      "contractorOps.outgoing.materialNameHint",
      "fieldStaffPwa.material.otherNameHint",
      "wasteOutgoing.field.otherNameHint",
      "siteDisposal.internal.field.doNoHint",
      "materialRequest.form.otherMaterialHint",
    ]) {
      expect(at(zh, key), key).toMatch(/不知道可以不填，后台会补上/);
      expect(at(tw, key), key).toMatch(/不知道可以不填，後台會補上/);
      expect(at(en, key), key).toMatch(/the office will fill it in/);
      expect(at(ms, key), key).toMatch(/pejabat akan mengisinya/);
    }
  });
});
