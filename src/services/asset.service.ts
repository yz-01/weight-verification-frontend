/** API contracts for the complete admin asset lifecycle. */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  Asset, AssetAssignment, AssetCategoryDefinition, AssetDisposal,
  AssetInstallation, AssetMaintenance, AssetMovement, AssetOptions,
  AssetPurchase, AssetReportSummary, AssetStock, AssetSummary,
  CreateAssetPayload, CreateMovementPayload,
} from "@/interfaces/asset";
import { api, download, toastSuccess } from "@/services/api-client";

export const getAssets = (query?: ListQuery): Promise<Paginated<Asset>> => api.list("/api/assets/get-assets/", query);
export const getAsset = (id: string): Promise<Asset> => api.get(`/api/assets/get-asset/${id}/`);
export const getAssetSummary = (): Promise<AssetSummary> => api.get("/api/assets/get-summary/");
export const getAssetStock = (): Promise<AssetStock[]> => api.get("/api/assets/get-stock/");
export const getAssetOptions = (): Promise<AssetOptions> => api.get("/api/assets/get-options/");
export async function createAsset(payload: CreateAssetPayload): Promise<Asset> { const row = await api.post<Asset>("/api/assets/create-asset/", payload); toastSuccess("adminAssetManagement.toast.assetCreated"); return row; }
export async function updateAsset(id: string, payload: Partial<CreateAssetPayload>): Promise<Asset> { const row = await api.patch<Asset>(`/api/assets/update-asset/${id}/`, payload); toastSuccess("adminAssetManagement.toast.assetUpdated"); return row; }
export async function setAssetActive(id: string, is_active: boolean, reason = ""): Promise<Asset> { const row = await api.post<Asset>(`/api/assets/set-active/${id}/`, { is_active, reason }); toastSuccess("adminAssetManagement.toast.assetStatus"); return row; }

export const getAssetCategories = (query?: ListQuery): Promise<Paginated<AssetCategoryDefinition>> => api.list("/api/asset-categories/get-categories/", query);
export async function createAssetCategory(payload: Record<string, unknown>): Promise<AssetCategoryDefinition> { const row = await api.post<AssetCategoryDefinition>("/api/asset-categories/create-category/", payload); toastSuccess("adminAssetManagement.toast.categorySaved"); return row; }
export async function updateAssetCategory(id: string, payload: Record<string, unknown>): Promise<AssetCategoryDefinition> { const row = await api.patch<AssetCategoryDefinition>(`/api/asset-categories/update-category/${id}/`, payload); toastSuccess("adminAssetManagement.toast.categorySaved"); return row; }
export async function deleteAssetCategory(id: string): Promise<void> { await api.delete(`/api/asset-categories/delete-category/${id}/`); toastSuccess("adminAssetManagement.toast.categoryRemoved"); }

export const getAssetPurchases = (query?: ListQuery): Promise<Paginated<AssetPurchase>> => api.list("/api/asset-purchases/get-purchases/", query);
export async function createAssetPurchase(payload: Record<string, unknown>): Promise<AssetPurchase> { const row = await api.post<AssetPurchase>("/api/asset-purchases/create-purchase/", payload); toastSuccess("adminAssetManagement.toast.purchaseSaved"); return row; }
export async function receiveAssetPurchase(id: string, payload: { received_quantity: number; received_on: string }): Promise<{ purchase: AssetPurchase; assets: Asset[] }> { const row = await api.post<{ purchase: AssetPurchase; assets: Asset[] }>(`/api/asset-purchases/receive-purchase/${id}/`, payload); toastSuccess("adminAssetManagement.toast.stockReceived"); return row; }

export const getAssetAssignments = (query?: ListQuery): Promise<Paginated<AssetAssignment>> => api.list("/api/asset-assignments/get-assignments/", query);
export async function createAssetAssignment(payload: Record<string, unknown>): Promise<AssetAssignment> { const row = await api.post<AssetAssignment>("/api/asset-assignments/create-assignment/", payload); toastSuccess("adminAssetManagement.toast.assetIssued"); return row; }
export async function returnAssetAssignment(id: string, payload: Record<string, unknown>): Promise<AssetAssignment> { const row = await api.post<AssetAssignment>(`/api/asset-assignments/return-assignment/${id}/`, payload); toastSuccess("adminAssetManagement.toast.assetReturned"); return row; }

export const getAssetInstallations = (query?: ListQuery): Promise<Paginated<AssetInstallation>> => api.list("/api/asset-installations/get-installations/", query);
export async function createAssetInstallation(payload: Record<string, unknown>): Promise<AssetInstallation> { const row = await api.post<AssetInstallation>("/api/asset-installations/create-installation/", payload); toastSuccess("adminAssetManagement.toast.installed"); return row; }
export async function transitionAssetInstallation(id: string, payload: Record<string, unknown>): Promise<AssetInstallation> { const row = await api.post<AssetInstallation>(`/api/asset-installations/transition-installation/${id}/`, payload); toastSuccess("adminAssetManagement.toast.installationStatus"); return row; }

export const getMovements = (query?: ListQuery): Promise<Paginated<AssetMovement>> => api.list("/api/asset-movements/get-movements/", query);
export async function createMovement(payload: CreateMovementPayload): Promise<AssetMovement> { const row = await api.post<AssetMovement>("/api/asset-movements/create-movement/", payload); toastSuccess("adminAssetManagement.toast.transferSaved"); return row; }

export const getAssetMaintenance = (query?: ListQuery): Promise<Paginated<AssetMaintenance>> => api.list("/api/asset-maintenance/get-maintenance/", query);
export const getUpcomingAssetMaintenance = (query?: ListQuery): Promise<Paginated<AssetMaintenance>> => api.list("/api/asset-maintenance/get-upcoming/", query);
export async function createAssetMaintenance(payload: Record<string, unknown>): Promise<AssetMaintenance> { const row = await api.post<AssetMaintenance>("/api/asset-maintenance/create-maintenance/", payload); toastSuccess("adminAssetManagement.toast.maintenanceSaved"); return row; }
export async function startAssetMaintenance(id: string): Promise<AssetMaintenance> { const row = await api.post<AssetMaintenance>(`/api/asset-maintenance/start-maintenance/${id}/`); toastSuccess("adminAssetManagement.toast.maintenanceStarted"); return row; }
export async function completeAssetMaintenance(id: string, payload: Record<string, unknown>): Promise<AssetMaintenance> { const row = await api.post<AssetMaintenance>(`/api/asset-maintenance/complete-maintenance/${id}/`, payload); toastSuccess("adminAssetManagement.toast.maintenanceCompleted"); return row; }

export const getAssetDisposals = (query?: ListQuery): Promise<Paginated<AssetDisposal>> => api.list("/api/asset-disposals/get-disposals/", query);
export async function createAssetDisposal(payload: Record<string, unknown>): Promise<AssetDisposal> { const row = await api.post<AssetDisposal>("/api/asset-disposals/create-disposal/", payload); toastSuccess("adminAssetManagement.toast.disposalRequested"); return row; }
export async function decideAssetDisposal(id: string, payload: Record<string, unknown>): Promise<AssetDisposal> { const row = await api.post<AssetDisposal>(`/api/asset-disposals/decide-disposal/${id}/`, payload); toastSuccess("adminAssetManagement.toast.disposalUpdated"); return row; }

export const getAssetReportSummary = (): Promise<AssetReportSummary> => api.get("/api/asset-reports/get-report-summary/");
export function exportAssetReport(dataset: string, format: "xlsx" | "pdf", columns: Array<{ key: string; label: string }>, title: string): Promise<void> {
  return download("/api/asset-reports/export-report/", { method: "POST", body: { dataset, format, columns, title }, fallbackFilename: `asset-${dataset}.${format}` });
}
