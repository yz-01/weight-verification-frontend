/** Customer service centre API (module 14). */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  CustomerEnquiry, CustomerFeedback, CustomerServiceRecord,
  CustomerServiceSummary, CustomerTraining, CustomerVisit,
  EnquiryStatus, TrainingStatus,
} from "@/interfaces/crm";
import { api, download, toastSuccess } from "@/services/api-client";

export interface EnquiryPayload {
  source: string; company_name: string; contact_person: string;
  contact_phone: string; contact_email: string; subject: string;
  message: string; requirements?: string; assigned_to?: string | null;
  follow_up_date?: string | null;
}
export interface TrainingPayload {
  company: string; type: string; title: string; description: string;
  scheduled_date: string; scheduled_time: string; duration_hours: string;
  location: string; meeting_link?: string; trainer?: string | null;
  attendee_count?: number; notes?: string;
}
export interface VisitPayload {
  company: string; type: string; visit_date: string; visit_time?: string | null;
  purpose: string; objectives: string; contact_met: string; summary?: string;
  action_items?: string; follow_up_required?: boolean; follow_up_date?: string | null;
  notes?: string;
}
export interface FeedbackPayload {
  company: string; category: string; title: string; description: string;
  priority: string;
}
export interface ServiceRecordPayload {
  company: string; type: string; service_date: string; contact_person: string;
  subject: string; description: string; resolution?: string;
  duration_hours?: string | null; requires_follow_up?: boolean;
  follow_up_date?: string | null; customer_satisfied?: boolean | null; notes?: string;
}

export const getEnquiries = (query?: ListQuery): Promise<Paginated<CustomerEnquiry>> => api.list("/api/customer-enquiries/get_enquiries/", query);
export async function createEnquiry(payload: EnquiryPayload) { const row = await api.post<CustomerEnquiry>("/api/customer-enquiries/create_enquiry/", payload); toastSuccess("crm.toast.enquiryCreated"); return row; }
export async function updateEnquiryStatus(id: string, status: EnquiryStatus, result: string, lostReason = "") { const row = await api.post<CustomerEnquiry>(`/api/customer-enquiries/${id}/update_status/`, { status, result, lost_reason: lostReason }); toastSuccess("crm.toast.statusUpdated"); return row; }

export const getTraining = (query?: ListQuery): Promise<Paginated<CustomerTraining>> => api.list("/api/customer-training/get_training/", query);
export async function createTraining(payload: TrainingPayload) { const row = await api.post<CustomerTraining>("/api/customer-training/create_training/", payload); toastSuccess("crm.toast.trainingCreated"); return row; }
export async function updateTrainingStatus(id: string, status: TrainingStatus, feedback = "") { const row = await api.post<CustomerTraining>(`/api/customer-training/${id}/update_status/`, { status, feedback }); toastSuccess("crm.toast.statusUpdated"); return row; }

export const getVisits = (query?: ListQuery): Promise<Paginated<CustomerVisit>> => api.list("/api/customer-visits/get_visits/", query);
export async function createVisit(payload: VisitPayload) { const row = await api.post<CustomerVisit>("/api/customer-visits/create_visit/", payload); toastSuccess("crm.toast.visitCreated"); return row; }

export const getFeedback = (query?: ListQuery): Promise<Paginated<CustomerFeedback>> => api.list("/api/customer-feedback/get_feedback/", query);
export async function createFeedback(payload: FeedbackPayload) { const row = await api.post<CustomerFeedback>("/api/customer-feedback/create_feedback/", payload); toastSuccess("crm.toast.feedbackCreated"); return row; }
export async function respondFeedback(id: string, response: string, markResolved: boolean) { const row = await api.post<CustomerFeedback>(`/api/customer-feedback/${id}/respond_feedback/`, { response, mark_resolved: markResolved }); toastSuccess("crm.toast.feedbackResponded"); return row; }

export const getServiceRecords = (query?: ListQuery): Promise<Paginated<CustomerServiceRecord>> => api.list("/api/customer-service-records/get_records/", query);
export async function createServiceRecord(payload: ServiceRecordPayload) { const row = await api.post<CustomerServiceRecord>("/api/customer-service-records/create_record/", payload); toastSuccess("crm.toast.serviceCreated"); return row; }

export const getCustomerServiceSummary = (): Promise<CustomerServiceSummary> => api.get("/api/customer-service-reports/get_summary/");
export function exportCustomerServiceReport(dataset: string, format: "pdf" | "xlsx", title: string, columns: Array<{ key: string; label: string }>) {
  return download("/api/customer-service-reports/export_report/", { method: "POST", body: { dataset, format, title, columns, empty_label: "" }, fallbackFilename: `customer-service-${dataset}.${format}` });
}
