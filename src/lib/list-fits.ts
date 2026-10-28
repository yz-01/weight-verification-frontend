import type { ListFit } from "@/lib/table-fit";

/**
 * Every back-office business list on the shared table, as the 1366 px fit
 * check sees it (I39, ID80). Each list reads its `storageKey` and `hidden`
 * from here, so what the test measures is what the page draws.
 *
 * `hidden` are the less used columns a list could not fit; they stay one
 * click away under 「字段」. The record number and the pinned 「查看 / 更改」
 * are never among them. A list whose defaults changed got a new storage key
 * version, so a column choice saved before does not keep them from applying.
 *
 * `needs_action` (「待处理」), `pack` (「已打包」) and `actions` are the
 * columns the shared frame adds; they are counted because they take room.
 */
export const LIST_FITS = {
  /** 材料进场 */
  materialReceipts: {
    // `.v6`: 规格 between 材料 and 照片 (J2-1).
    // J34-2 (Lucas 10-21): four 64 px photos a row; supplier_name, pack under 「字段」 for them.
    storageKey: "receipts.v7",
    file: "src/components/receipts/receipts.tsx",
    columns: {
      receipt_no: "recno",
      pack: "pack",
      business_at: "datetime",
      acceptance: "status",
      category_name: "text",
      material_name: "name",
      material_specification: "short",
      cover_photo: "strip",
      quantity: "number",
      supplier_name: "text",
      manufacturer_name: "text",
      delivery_note_no: "short",
      vehicle_plate: "short",
      needs_action: "marker",
      actions: "actions",
    },
    hidden: ["category_name", "manufacturer_name", "vehicle_plate", "delivery_note_no", "supplier_name", "pack"],
    phoneCard: { title: ["receipt_no", "material_name", "acceptance"], detail: ["business_at", "quantity", "supplier_name"], photo: "cover_photo" },
  },
  /** 材料退场 */
  materialOutgoing: {
    // `.v4`: 规格 after 材料 (J2-2).
    // J34-2 (Lucas 10-21): four 64 px photos a row; supplier_name, pack under 「字段」 for them.
    storageKey: "material-outgoing.v5",
    file: "src/components/contractor-ops/office-module-lists.tsx",
    columns: {
      reference_no: "recno",
      pack: "pack",
      cover_photo: "strip",
      status: "status",
      category_name: "text",
      captured_at: "datetime",
      material_name: "name",
      material_specification: "short",
      quantity: "number",
      supplier_name: "text",
      manufacturer_name: "text",
      executor_name: "person",
      project_name: "text",
      needs_action: "marker",
      actions: "actions",
    },
    hidden: ["category_name", "manufacturer_name", "project_name", "executor_name", "supplier_name", "pack"],
    phoneCard: { title: ["reference_no", "material_name", "status"], detail: ["captured_at", "quantity", "supplier_name"], photo: "cover_photo" },
  },
  /** MR 材料申请 */
  materialRequests: {
    // J34-2 (Lucas 10-21): four 64 px photos a row; supplier_name, submitted_by_name under 「字段」 for them.
    storageKey: "material-requests.v7",
    file: "src/components/material-requests/material-requests-office.tsx",
    columns: {
      request_no: "recno",
      cover_photo: "strip",
      request_kind: "badge",
      material_name: "name",
      category_code: "short",
      specification: "text",
      quantity: "number",
      unit: "short",
      manufacturer_name: "text",
      supplier_name: "text",
      submitted_by_name: "person",
      created_at: "datetime",
      status: "status",
      view: "button",
      needs_action: "marker",
      actions: "actions",
    },
    // 材料编号 and the spec now read under the material, the unit beside
    // the quantity; 「查看」 is the pinned eye at the row's end as well.
    hidden: ["category_code", "specification", "unit", "manufacturer_name", "view", "supplier_name", "submitted_by_name"],
    phoneCard: { title: ["request_no", "material_name", "status"], detail: ["created_at", "quantity", "submitted_by_name"], photo: "cover_photo" },
  },
  /** 设备进退场 (图 1 of I39) */
  equipmentMovements: {
    // `.v3`: the photo strip (J34-2); 方向 and 供应商 under 「字段」 for it -
    // the EI / EO number and the status words already say which way.
    // J34-2 (Lucas 10-21): four 64 px photos a row; pack under 「字段」 for them.
    storageKey: "equipment-movements.v4",
    file: "src/components/contractor-ops/office-module-lists.tsx",
    columns: {
      record_no: "recno",
      pack: "pack",
      occurred_at: "datetime",
      cover_photo: "strip",
      direction: "badge",
      status: "status",
      equipment: "name",
      quantity: "number",
      supplier_name: "text",
      delivery_note_no: "short",
      operator_name: "person",
      project_name: "text",
      needs_action: "marker",
      actions: "actions",
    },
    hidden: ["direction", "supplier_name", "delivery_note_no", "operator_name", "project_name", "pack"],
    phoneCard: { title: ["record_no", "equipment", "status"], detail: ["occurred_at", "quantity", "project_name"], photo: "cover_photo" },
  },
  /** 设备清单 */
  equipmentRegister: {
    // J34-2 (Lucas 10-21): four 64 px photos a row; project_name, code under 「字段」 for them.
    storageKey: "site-equipment-register.v2",
    file: "src/components/contractor-ops/office-module-lists.tsx",
    columns: {
      qrSelect: "select",
      site_no: "short",
      code: "short",
      cover_photo: "strip",
      name: "name",
      status: "status",
      category_name: "text",
      quantity_on_site: "number",
      project_name: "text",
      qr: "button",
      actions: "actions",
    },
    hidden: ["project_name", "code"],
    phoneCard: { title: ["site_no", "name", "status"], detail: ["category_name", "quantity_on_site", "project_name"], photo: "cover_photo" },
  },
  /** 施工进度 */
  siteProgress: {
    // J34-2 (Lucas 10-21): four 64 px photos a row; description, submitted_by_name under 「字段」 for them.
    storageKey: "site-progress.v3",
    file: "src/components/contractor-ops/office-module-lists.tsx",
    columns: {
      record_no: "recno",
      pack: "pack",
      captured_at: "datetime",
      cover_photo: "strip",
      phase__name: "text",
      description: "name",
      percent_complete: "number",
      status: "status",
      submitted_by_name: "person",
      project_name: "text",
      actions: "actions",
    },
    hidden: ["project_name", "description", "submitted_by_name"],
    phoneCard: { title: ["record_no", "phase__name", "status"], detail: ["captured_at", "percent_complete", "submitted_by_name"], photo: "cover_photo" },
  },
  /** 隐患整改 → 整改记录 */
  hazards: {
    storageKey: "trace-safety",
    file: "src/components/site-operations/safety.tsx",
    columns: {
      // 编号 / 日期 (I2): the number with the date under it.
      occurred_at: "recno",
      pack: "pack",
      title: "name",
      project_name: "text",
      category_name: "text",
      responsible_person_name: "person",
      status: "status",
      evidence: "thumb",
      needs_action: "marker",
      actions: "actions",
    },
    hidden: [],
  },
  /** 施工准证 */
  permits: {
    storageKey: "permits.v1",
    file: "src/components/permits/permits-office.tsx",
    columns: {
      incident_no: "recno",
      pack: "pack",
      project_name: "text",
      files: "thumb",
      applicant_name: "person",
      occurred_at: "datetime",
      approver_name: "person",
      status: "status",
      verified_at: "datetime",
      needs_action: "marker",
      actions: "actions",
    },
    hidden: [],
  },
  /** 门岗记录 → 照片 */
  gatePhotos: {
    // One row per upload, six photos, no GPS / PDF column (JB35). Nothing
    // newly hidden, so the key stays (I39 rule 6).
    storageKey: "gate-records.photos.v1",
    file: "src/components/site-access/gate-records-office.tsx",
    columns: {
      incident_no: "recno",
      cover_photo: "wideStrip",
      project_name: "text",
      guard_name: "person",
      occurred_at: "datetime",
      actions: "actions",
    },
    hidden: [],
    phoneCard: { title: ["incident_no", "project_name"], detail: ["occurred_at", "guard_name"], photo: "cover_photo" },
  },
  /** 门岗记录 → 问题 */
  gateIssues: {
    // J34-2 (Lucas 10-21): four 64 px photos a row; member_names, guard_name under 「字段」 for them.
    storageKey: "gate-records.issues.v2",
    file: "src/components/site-access/gate-records-office.tsx",
    columns: {
      incident_no: "recno",
      cover_photo: "strip",
      project_name: "text",
      guard_name: "person",
      occurred_at: "datetime",
      issue_note: "name",
      member_names: "text",
      issue_status: "status",
      closed: "person",
      actions: "actions",
    },
    hidden: ["member_names", "guard_name"],
    phoneCard: { title: ["incident_no", "issue_note", "issue_status"], detail: ["occurred_at", "project_name"], photo: "cover_photo" },
  },
  /** 访客记录 */
  visitors: {
    storageKey: "visitor-records.v2",
    file: "src/components/site-access/visitor-records.tsx",
    columns: {
      occurred_at: "datetime",
      direction: "badge",
      photo_thumbnail: "thumb",
      subject_name: "name",
      host_name: "person",
      confirmed_by_name: "person",
      entry_at: "datetime",
      exit_at: "datetime",
      phone: "short",
      vehicle_plate: "short",
      purpose: "text",
      pass_no: "short",
      project_name: "text",
      approved_by_name: "person",
      scanned_by_name: "person",
      actions: "actions",
    },
    hidden: ["phone", "pass_no", "project_name", "approved_by_name", "scanned_by_name"],
  },
  /** 人员名单 */
  siteWorkers: {
    storageKey: "site-workers.roster",
    file: "src/components/site-workers/site-workers.tsx",
    columns: {
      name: "name",
      phone: "short",
      passport_no: "short",
      cidb_no: "short",
      company_name: "text",
      project_name: "text",
      status: "status",
      last_position_at: "datetime",
      view: "button",
    },
    hidden: [],
  },
  /** 人员名单 → 进出记录 */
  siteWorkerVisits: {
    storageKey: "site-workers.visits",
    file: "src/components/site-workers/site-workers.tsx",
    columns: {
      worker_name: "name",
      phone: "short",
      cidb_no: "short",
      company_name: "text",
      project_name: "text",
      entered_at: "datetime",
      exited_at: "datetime",
      view: "button",
    },
    hidden: [],
  },
  /** 工地清运 */
  siteDisposals: {
    // J34-2 (Lucas 10-21): four 64 px photos a row; waste_description, supplier under 「字段」 for them.
    storageKey: "site-disposals.v3",
    file: "src/components/contractor-ops/site-disposal-workspaces.tsx",
    columns: {
      reference_no: "recno",
      pack: "pack",
      cover_photo: "strip",
      status: "status",
      trips: "number",
      waste_description: "name",
      location_description: "text",
      preferred_at: "datetime",
      requested_by_name: "person",
      supplier: "text",
      vehicle_plates: "short",
      project_name: "text",
      needs_action: "marker",
      actions: "actions",
    },
    hidden: ["location_description", "vehicle_plates", "project_name", "waste_description", "supplier"],
    phoneCard: { title: ["reference_no", "waste_description", "status"], detail: ["preferred_at", "trips", "requested_by_name"], photo: "cover_photo" },
  },
  /** 环保材料出场 */
  wasteOutgoing: {
    // J34-2 (Lucas 10-21): four 64 px photos a row; recycler_name, pack under 「字段」 for them.
    storageKey: "waste-outgoing.v3",
    file: "src/components/contractor-ops/waste-outgoing-workspace.tsx",
    columns: {
      reference_no: "recno",
      pack: "pack",
      cover_photo: "strip",
      status: "status",
      category_name: "text",
      captured_at: "datetime",
      quantity: "number",
      recycler_name: "text",
      dispatch_no: "short",
      project_name: "text",
      needs_action: "marker",
      actions: "actions",
    },
    hidden: ["project_name", "recycler_name", "pack"],
    phoneCard: { title: ["reference_no", "category_name", "status"], detail: ["captured_at", "quantity", "recycler_name"], photo: "cover_photo" },
  },
  /** 杂费报销 */
  sundryClaims: {
    // J34-2 (Lucas 10-21): four 64 px photos a row; description, submit_to under 「字段」 for them.
    storageKey: "sundry-claims.v4",
    file: "src/components/sundry-claims/sundry-claims-office.tsx",
    columns: {
      claim_no: "recno",
      pack: "pack",
      cover_photo: "strip",
      state: "status",
      amount: "number",
      captured_at: "datetime",
      description: "name",
      submit_to: "person",
      submitted_by_name: "person",
      created_at: "datetime",
      project_name: "text",
      needs_action: "marker",
      actions: "actions",
    },
    hidden: ["project_name", "created_at", "description", "submit_to"],
    phoneCard: { title: ["claim_no", "description", "state"], detail: ["captured_at", "amount", "submitted_by_name"], photo: "cover_photo" },
  },
} as const satisfies Record<string, ListFit>;

export type ListFitName = keyof typeof LIST_FITS;
