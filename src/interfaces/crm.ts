/** Customer service centre (module 14) interfaces. */

export type EnquiryStatus = "NEW" | "CONTACTED" | "IN_PROGRESS" | "QUOTED" | "WON" | "LOST" | "CANCELLED";
export type TrainingStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";

export interface CustomerEnquiry {
  id: string; enquiry_code: string; status: EnquiryStatus; source: string;
  company_name: string; contact_person: string; contact_phone: string;
  contact_email: string; subject: string; message: string; requirements: string;
  assigned_to: string | null; assigned_to_name: string | null;
  follow_up_date: string | null; last_contacted: string | null;
  converted_to_company: string | null; converted_company_name: string | null;
  won_on: string | null; lost_reason: string; notes: string;
  created_at: string; updated_at: string;
}

export interface CustomerTraining {
  id: string; training_code: string; company: string; company_code: string;
  company_name: string; type: string; status: TrainingStatus; title: string;
  description: string; scheduled_date: string; scheduled_time: string;
  duration_hours: string; location: string; meeting_link: string;
  trainer: string | null; trainer_name: string | null; attendee_count: number;
  completed_on: string | null; feedback: string; notes: string; created_at: string;
}

export interface CustomerVisit {
  id: string; visit_code: string; company: string; company_code: string;
  company_name: string; type: string; visit_date: string; visit_time: string | null;
  purpose: string; objectives: string; visited_by: string | null;
  visited_by_name: string | null; contact_met: string; summary: string;
  action_items: string; follow_up_required: boolean; follow_up_date: string | null;
  notes: string; created_at: string;
}

export interface CustomerFeedback {
  id: string; feedback_code: string; company: string; company_code: string;
  company_name: string; category: string; title: string; description: string;
  submitted_by_name: string | null; priority: string; response: string;
  responded_by_name: string | null; responded_at: string | null;
  is_resolved: boolean; resolved_at: string | null; created_at: string;
}

export interface CustomerServiceRecord {
  id: string; service_code: string; company: string; company_code: string;
  company_name: string; type: string; service_date: string; contact_person: string;
  handled_by_name: string | null; subject: string; description: string;
  resolution: string; duration_hours: string | null; requires_follow_up: boolean;
  follow_up_date: string | null; customer_satisfied: boolean | null;
  notes: string; created_at: string;
}

export interface CustomerServiceSummary {
  customers: number; enquiries: number; training: number; visits: number;
  feedback: number; service_records: number; completion_rate: number;
  issue_categories: Record<string, number>;
}
