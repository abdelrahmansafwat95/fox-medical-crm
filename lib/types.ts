// =====================================================================
// Shared TypeScript types — mirror the Supabase tables we built in
// 00..03 SQL files. Extend as new tables are added.
// =====================================================================

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

export interface Branch {
  id: string;
  name: string;
  name_ar: string | null;
  description: string | null;
  manager_id: string | null;
  city: string | null;
  governorate: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Territory {
  id: string;
  name: string;
  name_ar: string | null;
  type: "country" | "region" | "district" | "brick";
  parent_id: string | null;
  manager_id: string | null;
  governorate: string | null;
  cities: string[] | null;
  center_lat: number | null;
  center_lng: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type InstitutionType =
  | "private_clinic"
  | "polyclinic"
  | "hospital_govt"
  | "hospital_private"
  | "hospital_university"
  | "hospital_military"
  | "pharmacy_independent"
  | "pharmacy_chain"
  | "distributor"
  | "wholesaler"
  | "lab"
  | "warehouse";

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
  address_ar: string | null;
  city: string | null;
  district: string | null;
  governorate: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  working_days: number[] | null;
  opening_time: string | null;
  closing_time: string | null;
  bed_count: number | null;
  departments: string[] | null;
  tier: string | null;
  license_number: string | null;
  territory_id: string | null;
  photo_url: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type HCPSegment = "A" | "B" | "C" | "D" | "KOL";

export interface HCP {
  id: string;
  full_name: string;
  full_name_ar: string | null;
  title: string | null;
  gender: "male" | "female" | "other" | null;
  birthdate: string | null;
  photo_url: string | null;
  specialty: string | null;
  sub_specialty: string | null;
  qualification: string | null;
  license_number: string | null;
  license_expiry: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  whatsapp: string | null;
  preferred_language: "ar" | "en" | "both" | null;
  preferred_visit_day: number | null;
  preferred_visit_time: string | null;
  segment: HCPSegment | null;
  decile: number | null;
  prescribing_potential: number | null;
  is_kol: boolean;
  ai_score: number | null;
  ai_segment_recommendation: string | null;
  ai_notes: string | null;
  ai_recommended_products: string[] | null;
  ai_updated_at: string | null;
  territory_id: string | null;
  assigned_rep_id: string | null;
  secondary_rep_id: string | null;
  notes: string | null;
  tags: string[] | null;
  is_active: boolean;
  created_by: string | null;
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
  sku: string | null;
  category: "Rx" | "OTC" | "OTX" | "medical_device" | "consumable";
  therapy_area: string | null;
  product_line: string | null;
  dosage_form: string | null;
  strength: string | null;
  pack_size: string | null;
  atc_code: string | null;
  list_price: number | null;
  currency: string | null;
  key_messages: ProductKeyMessage[] | null;
  competitors: string[] | null;
  e_detailing_deck_url: string | null;
  sample_pack_size: string | null;
  launch_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
