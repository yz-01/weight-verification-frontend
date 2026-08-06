/** Subscription management service (Admin module 4). */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  ChangePlanPayload,
  CompanySubscription,
  ExtendSubscriptionPayload,
  SetSeatsPayload,
  SubscriptionPlan,
  SubscriptionPlanPayload,
  SubscriptionSummary,
} from "@/interfaces/subscription";
import type { ExportRequest } from "@/services/contractor.service";
import { api, download, toastSuccess } from "@/services/api-client";

export function getSubscriptionPlans(
  query?: ListQuery,
): Promise<Paginated<SubscriptionPlan>> {
  return api.list<SubscriptionPlan>("/api/subscription-plans/get_plans/", query);
}

export async function createSubscriptionPlan(
  payload: SubscriptionPlanPayload,
): Promise<SubscriptionPlan> {
  const plan = await api.post<SubscriptionPlan>(
    "/api/subscription-plans/create_plan/",
    payload,
  );
  toastSuccess("subscriptions.toast.planCreated");
  return plan;
}

export async function updateSubscriptionPlan(
  id: string,
  payload: Partial<SubscriptionPlanPayload>,
): Promise<SubscriptionPlan> {
  const plan = await api.patch<SubscriptionPlan>(
    `/api/subscription-plans/${id}/update_plan/`,
    payload,
  );
  toastSuccess("subscriptions.toast.planUpdated");
  return plan;
}

export function getSubscriptions(
  query?: ListQuery,
): Promise<Paginated<CompanySubscription>> {
  return api.list<CompanySubscription>(
    "/api/subscriptions/get_subscriptions/",
    query,
  );
}

export function getSubscription(id: string): Promise<CompanySubscription> {
  return api.get<CompanySubscription>(
    `/api/subscriptions/${id}/get_subscription/`,
  );
}

export function getSubscriptionSummary(): Promise<SubscriptionSummary> {
  return api.get<SubscriptionSummary>("/api/subscriptions/get_summary/");
}

export function getExpiringSubscriptions(
  days = 30,
): Promise<Paginated<CompanySubscription>> {
  return api.list<CompanySubscription>("/api/subscriptions/get_expiring/", {
    days,
    page_size: 100,
  });
}

export async function changePlan(
  id: string,
  payload: ChangePlanPayload,
): Promise<CompanySubscription> {
  const subscription = await api.post<CompanySubscription>(
    `/api/subscriptions/${id}/change_plan/`,
    payload,
  );
  toastSuccess("subscriptions.toast.planChanged");
  return subscription;
}

export async function extendSubscription(
  id: string,
  payload: ExtendSubscriptionPayload,
): Promise<CompanySubscription> {
  const subscription = await api.post<CompanySubscription>(
    `/api/subscriptions/${id}/extend/`,
    payload,
  );
  toastSuccess("subscriptions.toast.extended");
  return subscription;
}

export async function setSeats(
  id: string,
  payload: SetSeatsPayload,
): Promise<CompanySubscription> {
  const subscription = await api.post<CompanySubscription>(
    `/api/subscriptions/${id}/set_seats/`,
    payload,
  );
  toastSuccess("subscriptions.toast.seatsUpdated");
  return subscription;
}

export async function setSubscriptionPause(
  id: string,
  action: "PAUSE" | "RESUME",
  reason: string,
): Promise<CompanySubscription> {
  const subscription = await api.post<CompanySubscription>(
    `/api/subscriptions/${id}/set_pause/`,
    { action, reason },
  );
  toastSuccess(
    action === "PAUSE"
      ? "subscriptions.toast.paused"
      : "subscriptions.toast.resumed",
  );
  return subscription;
}

export async function terminateSubscription(
  id: string,
  reason: string,
): Promise<CompanySubscription> {
  const subscription = await api.post<CompanySubscription>(
    `/api/subscriptions/${id}/terminate/`,
    { reason },
  );
  toastSuccess("subscriptions.toast.terminated");
  return subscription;
}

export function exportSubscriptions(request: ExportRequest): Promise<void> {
  const { page, page_size, ...query } = request.query;
  void page;
  void page_size;
  return download("/api/subscriptions/export_subscriptions/", {
    method: "POST",
    query,
    body: {
      format: request.format,
      title: request.title,
      subtitle: request.subtitle ?? "",
      empty_label: request.emptyLabel ?? "",
      columns: request.columns,
    },
    fallbackFilename: `subscriptions.${request.format}`,
  });
}
