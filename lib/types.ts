// Shared TypeScript types — mirror the Supabase tables.

export type UserRole =
  | "admin" | "country_manager" | "sales_director"
  | "regional_manager" | "district_manager"
  | "medical_rep_senior" | "medical_rep";

export interface Profile {
  id: string;
  full_name: string | null;
  full_name_ar: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  line_manager_id: string | null;
  branch_id: string | null;
  territory_id: string | null;
  product_line: string | null;
  is_active: boolean;
  tracking_consent_at: string | null;
  working_days: number[] | null;
  working_time_from: string | null;
  working_time_to: string | null;
  created_at: string;
  updated_at: string;
}

export type InstitutionType =
  | "private_clinic" | "polyclinic"
  | "hospital_govt" | "hospital_private" | "hospital_university" | "hospital_military"
  | "pharmacy_independent" | "pharmacy_chain"
  | "distributor" | "wholesaler" | "lab" | "warehouse";

export interface Institution {
  id: string;
  name: string;
  name_ar: string | null;
  type: InstitutionType;
  chain_id: string | null;
  latitude: number;
  longitude: number;
  geofence_radius_m: number;
  address: string | null;
  city: string | null;
  district: string | null;
  governorate: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type HCPSegment = "A" | "B" | "C" | "D" | "KOL";

export interface HCP {
  id: string;
  full_name: string;
  full_name_ar: string | null;
  title: string | null;
  specialty: string | null;
  sub_specialty: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  whatsapp: string | null;
  segment: HCPSegment | null;
  decile: number | null;
  is_kol: boolean;
  ai_score: number | null;
  ai_segment_recommendation: string | null;
  ai_notes: string | null;
  ai_updated_at: string | null;
  territory_id: string | null;
  assigned_rep_id: string | null;
  notes: string | null;
  tags: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductKeyMessage {
  title: string;
  message: string;
  evidence_url?: string;
  evidence_label?: string;
}

export interface Product {
  id: string;
  name: string;
  brand_name: string | null;
  generic_name: string | null;
  name_ar: string | null;
  category: "Rx" | "OTC" | "OTX" | "medical_device" | "consumable";
  therapy_area: string | null;
  dosage_form: string | null;
  strength: string | null;
  pack_size: string | null;
  list_price: number | null;
  currency: string | null;
  key_messages: ProductKeyMessage[] | null;
  sample_pack_size: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type VisitStatus = "planned" | "in_progress" | "completed" | "missed" | "cancelled" | "rejected_by_manager";
export type VisitType = "detailing" | "follow_up" | "sample_drop" | "order_visit" | "courtesy" | "launch" | "training";

export interface Visit {
  id: string;
  rep_id: string;
  hcp_id: string;
  institution_id: string;
  check_in_at: string | null;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_in_distance_m: number | null;
  check_in_within_geofence: boolean | null;
  check_in_selfie_url: string | null;
  check_out_at: string | null;
  duration_minutes: number | null;
  visit_type: VisitType | null;
  status: VisitStatus;
  products_detailed: string[] | null;
  doctor_attitude: string | null;
  doctor_feedback: string | null;
  objections: string | null;
  key_message_delivered: string | null;
  next_action: string | null;
  next_visit_date: string | null;
  ai_summary: string | null;
  ai_quality_score: number | null;
  ai_coaching_notes: string | null;
  manager_status: "pending" | "approved" | "flagged" | "rejected";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface NearestInstitution {
  id: string;
  name: string;
  type: InstitutionType;
  distance_m: number;
  geofence_radius_m: number;
  within_geofence: boolean;
  latitude: number;
  longitude: number;
  district: string | null;
}

export interface SampleInventory {
  id: string;
  rep_id: string;
  product_id: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  warehouse_issued_qty: number;
}

export interface SampleTransaction {
  id: string;
  transaction_type: "issued_to_rep" | "given_to_hcp" | "returned_to_warehouse" | "expired" | "damaged" | "lost";
  rep_id: string | null;
  hcp_id: string | null;
  product_id: string;
  batch_number: string | null;
  quantity: number;
  visit_id: string | null;
  hcp_signature_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface OrderItem {
  product_id: string;
  qty: number;
  unit_price: number;
  discount_pct: number;
  total: number;
}

export interface Order {
  id: string;
  order_number: string | null;
  institution_id: string;
  hcp_id: string | null;
  rep_id: string;
  visit_id: string | null;
  order_date: string;
  status: "draft" | "submitted" | "approved" | "dispatched" | "delivered" | "paid" | "cancelled" | "returned";
  items: OrderItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  rep_id: string;
  expense_date: string;
  category: "transport" | "fuel" | "meal" | "parking" | "toll" | "phone" | "accommodation" | "other";
  amount: number;
  currency: string;
  description: string | null;
  receipt_photo_url: string | null;
  status: "draft" | "submitted" | "approved" | "rejected" | "paid";
  rejection_reason: string | null;
  created_at: string;
}

export interface CallTarget {
  id: string;
  rep_id: string;
  month: string;
  calls_target: number;
  coverage_target: number;
  frequency_target: Record<string, number>;
  order_value_target: number;
}

export interface RepMonthlyPerformance {
  rep_id: string;
  full_name: string | null;
  role: UserRole;
  product_line: string | null;
  month: string;
  completed_calls: number;
  verified_calls: number;
  flagged_calls: number;
  unique_hcps: number;
  avg_quality: number;
  orders_taken: number;
  calls_target: number | null;
  coverage_target: number | null;
  calls_attainment_pct: number | null;
  coverage_attainment_pct: number | null;
}

export interface ComplianceAlert {
  id: string;
  rep_id: string;
  alert_type:
    | "check_in_outside_geofence" | "impossible_travel_speed"
    | "duplicate_visit" | "visit_too_short"
    | "no_movement_during_hours" | "sample_discrepancy"
    | "after_hours_check_in" | "off_territory";
  severity: "low" | "medium" | "high" | "critical";
  related_visit_id: string | null;
  evidence: Record<string, unknown> | null;
  status: "open" | "reviewing" | "resolved" | "false_positive";
  detected_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: "compliance_alert" | "task" | "reminder" | "approval_request" | "system" | "message";
  title: string;
  body: string | null;
  link_url: string | null;
  is_read: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface TourPlan {
  id: string;
  rep_id: string;
  plan_date: string;
  status: "draft" | "submitted" | "approved" | "rejected" | "executed";
  planned_hcps: string[] | null;
  estimated_distance_km: number | null;
  notes: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  manager_notes: string | null;
}
