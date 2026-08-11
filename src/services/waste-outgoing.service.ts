import type { ListQuery } from "@/interfaces/api";
import type {
  RecyclerOption,
  WasteCategory,
  WasteOutgoingOptions,
  WasteOutgoingRecord,
  WasteOutgoingTotals,
  WasteTracking,
} from "@/interfaces/waste-outgoing";
import { api, toastSuccess } from "@/services/api-client";

export const getWasteCategories = (query: ListQuery = {}) =>
  api.list<WasteCategory>("/api/waste-categories/get_categories/", query);

/** Categories plus the unit list, for the record form's pickers. */
export const getWasteOutgoingOptions = () =>
  api.get<WasteOutgoingOptions>("/api/waste-categories/get_options/");

export const createWasteCategory = async (payload: {
  code: string;
  name: string;
  dispatch_type: string;
  description?: string;
  sort_order?: number;
}) => {
  const row = await api.post<WasteCategory>(
    "/api/waste-categories/create_category/",
    payload,
  );
  toastSuccess("wasteOutgoing.toast.categorySaved");
  return row;
};

export const updateWasteCategory = async (
  id: string,
  payload: Partial<{
    name: string;
    dispatch_type: string;
    description: string;
    sort_order: number;
    is_active: boolean;
  }>,
) => {
  const row = await api.patch<WasteCategory>(
    `/api/waste-categories/${id}/update_category/`,
    payload,
  );
  toastSuccess("wasteOutgoing.toast.categorySaved");
  return row;
};

/** 8.2.12-B: query by date, project, recycler, category and status. */
export const getWasteOutgoingRecords = (query: ListQuery = {}) =>
  api.list<WasteOutgoingRecord>("/api/waste-outgoing/get_records/", query);

export const getWasteOutgoingRecord = (id: string) =>
  api.get<WasteOutgoingRecord>(`/api/waste-outgoing/${id}/get_record/`);

export const getWasteOutgoingTotals = (project?: string) =>
  api.get<WasteOutgoingTotals>(
    "/api/waste-outgoing/get_totals/",
    project ? ({ project } as ListQuery) : undefined,
  );

export const getWasteTracking = (id: string) =>
  api.get<WasteTracking>(`/api/waste-outgoing/${id}/get_tracking/`);

/**
 * 8.2.1: record waste leaving site.
 *
 * Multipart because the photographs are the substance of the record, not an
 * attachment to it: the server refuses a collection request that has none.
 * `client_event_id` makes the upload idempotent, so a phone that retries on a
 * flaky site connection does not file the same waste twice.
 */
export async function createWasteOutgoingRecord(input: {
  project: string;
  category: string;
  quantity?: string;
  unit?: string;
  note?: string;
  latitude?: string;
  longitude?: string;
  device_id?: string;
  client_event_id?: string;
  photos: File[];
}): Promise<WasteOutgoingRecord> {
  const data = new FormData();
  data.append("project", input.project);
  data.append("category", input.category);
  for (const key of [
    "quantity",
    "unit",
    "note",
    "latitude",
    "longitude",
    "device_id",
    "client_event_id",
  ] as const) {
    const value = input[key];
    if (value) data.append(key, value);
  }
  for (const file of input.photos) data.append("photos", file);
  const row = await api.post<WasteOutgoingRecord>(
    "/api/waste-outgoing/create_record/",
    data,
  );
  toastSuccess("wasteOutgoing.toast.recorded");
  return row;
}

export async function addWasteOutgoingPhotos(
  id: string,
  photos: File[],
  caption = "",
): Promise<WasteOutgoingRecord> {
  const data = new FormData();
  for (const file of photos) data.append("photos", file);
  if (caption) data.append("caption", caption);
  const row = await api.post<WasteOutgoingRecord>(
    `/api/waste-outgoing/${id}/add_photos/`,
    data,
  );
  toastSuccess("wasteOutgoing.toast.photosAdded");
  return row;
}

/**
 * 8.2.2: raise the collection request.
 *
 * The site contact and GPS are bound by the server from the project, so this
 * sends nothing unless the clerk deliberately overrides them.
 */
export async function submitWasteCollectionRequest(
  id: string,
  overrides: { site_contact_name?: string; site_contact_phone?: string } = {},
): Promise<WasteOutgoingRecord> {
  const row = await api.post<WasteOutgoingRecord>(
    `/api/waste-outgoing/${id}/submit_request/`,
    overrides,
  );
  toastSuccess("wasteOutgoing.toast.submitted");
  return row;
}

/** Only the recyclers this project is actually bound to. */
export const getRecyclerOptions = (id: string) =>
  api.get<{ rows: RecyclerOption[]; total: number }>(
    `/api/waste-outgoing/${id}/get_recycler_options/`,
  );

/** 8.2.2 steps 2-4: pick the bound recycler, raise the order, send it. */
export async function assignWasteRecycler(
  id: string,
  payload: {
    recycler: string;
    estimated_weight_kg?: string;
    description?: string;
  },
): Promise<WasteOutgoingRecord> {
  const row = await api.post<WasteOutgoingRecord>(
    `/api/waste-outgoing/${id}/assign_recycler/`,
    payload,
  );
  toastSuccess("wasteOutgoing.toast.ordered");
  return row;
}

export async function confirmWasteCollectionPlan(
  dispatchId: string,
  input: { confirmedCollectionAt: string; note?: string },
): Promise<void> {
  await api.post(
    `/api/dispatches/${dispatchId}/confirm_collection_plan/`,
    {
      confirmed_collection_at: input.confirmedCollectionAt,
      confirmed_collection_note: input.note ?? "",
    },
  );
  toastSuccess("wasteOutgoing.toast.scheduleConfirmed");
}

export async function cancelWasteOutgoingRecord(
  id: string,
  reason: string,
): Promise<WasteOutgoingRecord> {
  const row = await api.post<WasteOutgoingRecord>(
    `/api/waste-outgoing/${id}/cancel_record/`,
    { reason },
  );
  toastSuccess("wasteOutgoing.toast.cancelled");
  return row;
}
