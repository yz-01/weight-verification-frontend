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
    storageKey: "receipts.v5",
    file: "src/components/receipts/receipts.tsx",
    columns: {
      receipt_no: "recno",
      pack: "pack",
      business_at: "datetime",
      acceptance: "status",
      category_name: "text",
      material_name: "name",
      cover_photo: "thumb",
      quantity: "number",
      supplier_name: "text",
      manufacturer_name: "text",
      delivery_note_no: "short",
      vehicle_plate: "short",
      needs_action: "marker",
      actions: "actions",
    },
    hidden: ["category_name", "manufacturer_name", "vehicle_plate"],
  },
  /** 材料退场 */
  materialOutgoing: {
    storageKey: "material-outgoing.v3",
    file: "src/components/contractor-ops/office-module-lists.tsx",
    columns: {
      reference_no: "recno",
      pack: "pack",
      cover_photo: "thumb",
      status: "status",
      category_name: "text",
      captured_at: "datetime",
      material_name: "name",
      quantity: "number",
      supplier_name: "text",
      manufacturer_name: "text",
      executor_name: "person",
      project_name: "text",
      needs_action: "marker",
      actions: "actions",
    },
    hidden: ["category_name", "manufacturer_name", "project_name"],
  },
  /** MR 材料申请 */
  materialRequests: {
    storageKey: "material-requests.v6",
    file: "src/components/material-requests/material-requests-office.tsx",
    columns: {
      request_no: "recno",
      cover_photo: "thumb",
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
    hidden: ["category_code", "specification", "unit", "manufacturer_name", "view"],
  },
  /** 设备进退场 (图 1 of I39) */
  equipmentMovements: {
    storageKey: "equipment-movements.v2",
    file: "src/components/contractor-ops/office-module-lists.tsx",
    columns: {
      record_no: "recno",
      pack: "pack",
      occurred_at: "datetime",
      cover_photo: "thumb",
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
    hidden: ["delivery_note_no", "operator_name", "project_name"],
  },
  /** 设备清单 */
  equipmentRegister: {
    storageKey: "site-equipment-register",
    file: "src/components/contractor-ops/office-module-lists.tsx",
    columns: {
      qrSelect: "select",
      site_no: "short",
      code: "short",
      cover_photo: "thumb",
      name: "name",
      status: "status",
      category_name: "text",
      quantity_on_site: "number",
      project_name: "text",
      qr: "button",
      actions: "actions",
    },
    hidden: [],
  },
  /** 施工进度 */
  siteProgress: {
    storageKey: "site-progress.v2",
    file: "src/components/contractor-ops/office-module-lists.tsx",
    columns: {
      record_no: "recno",
      pack: "pack",
      captured_at: "datetime",
      cover_photo: "thumb",
      phase__name: "text",
      description: "name",
      percent_complete: "number",
      status: "status",
      submitted_by_name: "person",
      project_name: "text",
      actions: "actions",
    },
    hidden: ["project_name"],
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
    storageKey: "gate-records.photos.v1",
    file: "src/components/site-access/gate-records-office.tsx",
    columns: {
      incident_no: "recno",
      cover_photo: "thumb",
      project_name: "text",
      guard_name: "person",
      occurred_at: "datetime",
      single_pdf: "button",
      gps: "short",
      actions: "actions",
    },
    hidden: [],
  },
  /** 门岗记录 → 问题 */
  gateIssues: {
    storageKey: "gate-records.issues.v1",
    file: "src/components/site-access/gate-records-office.tsx",
    columns: {
      incident_no: "recno",
      cover_photo: "thumb",
      project_name: "text",
      guard_name: "person",
      occurred_at: "datetime",
      issue_note: "name",
      member_names: "text",
      issue_status: "status",
      closed: "person",
      actions: "actions",
    },
    hidden: [],
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
    storageKey: "site-disposals.v2",
    file: "src/components/contractor-ops/site-disposal-workspaces.tsx",
    columns: {
      reference_no: "recno",
      pack: "pack",
      cover_photo: "thumb",
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
    hidden: ["location_description", "vehicle_plates", "project_name"],
  },
  /** 环保材料出场 */
  wasteOutgoing: {
    storageKey: "waste-outgoing.v2",
    file: "src/components/contractor-ops/waste-outgoing-workspace.tsx",
    columns: {
      reference_no: "recno",
      pack: "pack",
      cover_photo: "thumb",
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
    hidden: ["project_name"],
  },
  /** 杂费报销 */
  sundryClaims: {
    storageKey: "sundry-claims.v3",
    file: "src/components/sundry-claims/sundry-claims-office.tsx",
    columns: {
      claim_no: "recno",
      pack: "pack",
      cover_photo: "thumb",
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
    hidden: ["project_name", "created_at"],
  },
} as const satisfies Record<string, ListFit>;

export type ListFitName = keyof typeof LIST_FITS;
