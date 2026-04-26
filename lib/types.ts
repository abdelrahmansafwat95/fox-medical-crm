// Shared TypeScript types — mirror the Supabase tables.

export type UserRole =
  | "admin"
  | "country_manager"
  | "sales_director"
  | "regional_manager"
  | "district_manager"
  | "medical_rep_senior"
  | "medical_rep";

export interface Profile {
  id: string;
  full_name: string | null;
  full_name_ar: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  employee_id: string | null;
  hire_date: string | null;
  role: UserRole;
  line_manager_id: string | null;
  branch_id: string | null;
  territory_id: string | null;
  product_line: string | null;
  is_active: boolean;
  tracking_consent_at: string | null;
  tracking_consent_version: string | null;
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
  bed_count: number | null;
  tier: string | null;
  territory_id: string | null;
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
  prescribing_potential: number | null;
  is_kol: boolean;
  ai_score: number | null;
  ai_segment_recommendation: string | null;
  ai_notes: string | null;
  ai_updated_at: string | null;
  territory_id: string | null;
  assigned_rep_id: string | null;
  secondary_rep_id: string | null;
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
  manager_notes: string | null;
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
