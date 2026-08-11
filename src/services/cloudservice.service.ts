/** Cloud service operations API for admin module A17. */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  CloudAnalysis, CloudBudget, CloudOptions, CloudPricingRule, CloudService,
  CloudServicePlan, CloudServiceVendor, CloudStatistics, CloudSummary, CostAlert,
  ServiceUsage,
} from "@/interfaces/cloudservice";
import { api, download, toastSuccess } from "@/services/api-client";

export const getCloudVendors = (query?: ListQuery): Promise<Paginated<CloudServiceVendor>> => api.list("/api/cloud-vendors/get-vendors/", query);
export async function createCloudVendor(payload: Record<string, unknown>): Promise<CloudServiceVendor> { const row = await api.post<CloudServiceVendor>("/api/cloud-vendors/create-vendor/", payload); toastSuccess("adminCloudServiceManagement.toast.vendorSaved"); return row; }
export async function updateCloudVendor(id: string, payload: Record<string, unknown>): Promise<CloudServiceVendor> { const row = await api.patch<CloudServiceVendor>(`/api/cloud-vendors/update-vendor/${id}/`, payload); toastSuccess("adminCloudServiceManagement.toast.vendorSaved"); return row; }

export const getCloudServices = (query?: ListQuery): Promise<Paginated<CloudService>> => api.list("/api/cloud-services/get-services/", query);
export const getCloudService = (id: string): Promise<CloudService> => api.get(`/api/cloud-services/get-service/${id}/`);
export const getCloudSummary = (): Promise<CloudSummary> => api.get("/api/cloud-services/get-summary/");
export const getCloudOptions = (): Promise<CloudOptions> => api.get("/api/cloud-services/get-options/");
export async function createCloudService(payload: Record<string, unknown>): Promise<CloudService> { const row = await api.post<CloudService>("/api/cloud-services/create-service/", payload); toastSuccess("adminCloudServiceManagement.toast.serviceSaved"); return row; }
export async function updateCloudService(id: string, payload: Record<string, unknown>): Promise<CloudService> { const row = await api.patch<CloudService>(`/api/cloud-services/update-service/${id}/`, payload); toastSuccess("adminCloudServiceManagement.toast.serviceSaved"); return row; }
export async function setCloudServiceStatus(id: string, status: string, reason = ""): Promise<CloudService> { const row = await api.post<CloudService>(`/api/cloud-services/set-status/${id}/`, { status, reason }); toastSuccess("adminCloudServiceManagement.toast.serviceStatus"); return row; }

export const getCloudPlans = (query?: ListQuery): Promise<Paginated<CloudServicePlan>> => api.list("/api/cloud-plans/get-plans/", query);
export async function createCloudPlan(payload: Record<string, unknown>): Promise<CloudServicePlan> { const row = await api.post<CloudServicePlan>("/api/cloud-plans/create-plan/", payload); toastSuccess("adminCloudServiceManagement.toast.planSaved"); return row; }
export async function updateCloudPlan(id: string, payload: Record<string, unknown>): Promise<CloudServicePlan> { const row = await api.patch<CloudServicePlan>(`/api/cloud-plans/update-plan/${id}/`, payload); toastSuccess("adminCloudServiceManagement.toast.planSaved"); return row; }

export const getCloudPricingRules = (query?: ListQuery): Promise<Paginated<CloudPricingRule>> => api.list("/api/cloud-pricing-rules/get-rules/", query);
export async function createCloudPricingRule(payload: Record<string, unknown>): Promise<CloudPricingRule> { const row = await api.post<CloudPricingRule>("/api/cloud-pricing-rules/create-rule/", payload); toastSuccess("adminCloudServiceManagement.toast.ruleSaved"); return row; }
export async function updateCloudPricingRule(id: string, payload: Record<string, unknown>): Promise<CloudPricingRule> { const row = await api.patch<CloudPricingRule>(`/api/cloud-pricing-rules/update-rule/${id}/`, payload); toastSuccess("adminCloudServiceManagement.toast.ruleSaved"); return row; }

export const getCloudUsage = (query?: ListQuery): Promise<Paginated<ServiceUsage>> => api.list("/api/cloud-usage/get-usage/", query);
export const getCloudStatistics = (query?: ListQuery): Promise<CloudStatistics> => api.get("/api/cloud-usage/get-statistics/", query);
export async function recordCloudUsage(payload: Record<string, unknown>): Promise<ServiceUsage> { const row = await api.post<ServiceUsage>("/api/cloud-usage/record-usage/", payload); toastSuccess("adminCloudServiceManagement.toast.usageSaved"); return row; }

export const getCloudBudgets = (query?: ListQuery): Promise<Paginated<CloudBudget>> => api.list("/api/cloud-budgets/get-budgets/", query);
export async function createCloudBudget(payload: Record<string, unknown>): Promise<CloudBudget> { const row = await api.post<CloudBudget>("/api/cloud-budgets/create-budget/", payload); toastSuccess("adminCloudServiceManagement.toast.budgetSaved"); return row; }
export async function updateCloudBudget(id: string, payload: Record<string, unknown>): Promise<CloudBudget> { const row = await api.patch<CloudBudget>(`/api/cloud-budgets/update-budget/${id}/`, payload); toastSuccess("adminCloudServiceManagement.toast.budgetSaved"); return row; }

export const getCloudAlerts = (query?: ListQuery): Promise<Paginated<CostAlert>> => api.list("/api/cloud-alerts/get-alerts/", query);
export async function resolveCloudAlert(id: string, note = ""): Promise<CostAlert> { const row = await api.post<CostAlert>(`/api/cloud-alerts/resolve-alert/${id}/`, { note }); toastSuccess("adminCloudServiceManagement.toast.alertResolved"); return row; }

export const getCloudAnalysis = (query?: ListQuery): Promise<CloudAnalysis> => api.get("/api/cloud-analysis/get-analysis/", query);
export function exportCloudReport(dataset: string, format: "xlsx" | "pdf", columns: Array<{ key: string; label: string }>, title: string, filters?: Record<string, string>): Promise<void> { return download("/api/cloud-reports/export-report/", { method: "POST", body: { dataset, format, columns, title, ...filters }, fallbackFilename: `cloud-${dataset}.${format}` }); }
