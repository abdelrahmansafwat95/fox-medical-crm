import { supabase } from "./supabase";

/** Seed a realistic starter dataset (institutions, HCPs, products, and a
 *  handful of completed visits) so a fresh instance isn't a wall of empty
 *  screens. Admin-only in practice (RLS lets admins insert into all of these).
 *  Not idempotent — running twice adds another batch. */
export async function seedDemoData(): Promise<{
  institutions: number;
  hcps: number;
  products: number;
  visits: number;
}> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) throw new Error("Not authenticated.");

  // ── Institutions (real Cairo/Giza coordinates) ──
  const instSeed = [
    { name: "Maadi Polyclinic", type: "polyclinic", latitude: 29.9602, longitude: 31.2569, city: "Cairo", district: "Maadi" },
    { name: "Cleopatra Hospital", type: "hospital_private", latitude: 30.0626, longitude: 31.33, city: "Cairo", district: "Heliopolis" },
    { name: "Dar Al Fouad Hospital", type: "hospital_private", latitude: 29.9749, longitude: 30.949, city: "Giza", district: "6th of October" },
    { name: "El Ezaby Pharmacy — Nasr City", type: "pharmacy_chain", latitude: 30.0511, longitude: 31.3656, city: "Cairo", district: "Nasr City" },
    { name: "Kasr El Aini Hospital", type: "hospital_university", latitude: 30.0308, longitude: 31.2295, city: "Cairo", district: "Downtown" },
    { name: "As-Salam International", type: "hospital_private", latitude: 29.999, longitude: 31.268, city: "Cairo", district: "Maadi" },
    { name: "Heliopolis Clinic", type: "private_clinic", latitude: 30.088, longitude: 31.32, city: "Cairo", district: "Heliopolis" },
    { name: "Zayed Specialized Hospital", type: "hospital_govt", latitude: 30.018, longitude: 30.976, city: "Giza", district: "Sheikh Zayed" }
  ].map((i) => ({ ...i, geofence_radius_m: 120, is_active: true }));

  const { data: insts, error: instErr } = await supabase.from("institutions").insert(instSeed).select("id");
  if (instErr) throw new Error("institutions: " + instErr.message);
  const instIds = (insts ?? []).map((r) => r.id as string);

  // ── HCPs (assigned to the seeding admin so they're visible everywhere) ──
  const specialties = ["Cardiology", "Endocrinology", "Internal Medicine", "Pediatrics", "Pulmonology", "Gastroenterology", "Neurology", "Orthopedics", "Dermatology", "General Practice"];
  const firstNames = ["Ahmed", "Mohamed", "Sara", "Mostafa", "Hoda", "Khaled", "Nour", "Tarek", "Yasmin", "Omar", "Laila", "Hassan", "Mariam", "Amr", "Dina", "Sherif", "Rana", "Ali", "Mona", "Karim"];
  const lastNames = ["Hassan", "Ibrahim", "Mahmoud", "Fahmy", "Saleh", "Zaki", "Nabil", "Fouad"];
  const hcpSeed = Array.from({ length: 20 }, (_, i) => ({
    full_name: `Dr. ${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`,
    specialty: specialties[i % specialties.length],
    segment: ["A", "B", "C", "D"][i % 4],
    is_active: true,
    assigned_rep_id: uid
  }));
  const { data: hcps, error: hcpErr } = await supabase.from("hcps").insert(hcpSeed).select("id");
  if (hcpErr) throw new Error("hcps: " + hcpErr.message);
  const hcpIds = (hcps ?? []).map((r) => r.id as string);

  // ── Products ──
  const prodSeed = [
    { name: "Cardia 5mg", brand_name: "Cardia", generic_name: "amlodipine", category: "Rx", therapy_area: "Cardiovascular", list_price: 85 },
    { name: "Cardia 10mg", brand_name: "Cardia", generic_name: "amlodipine", category: "Rx", therapy_area: "Cardiovascular", list_price: 120 },
    { name: "Glucova 1g", brand_name: "Glucova", generic_name: "metformin", category: "Rx", therapy_area: "Diabetes", list_price: 95 },
    { name: "Respira 200", brand_name: "Respira", generic_name: "budesonide", category: "Rx", therapy_area: "Respiratory", list_price: 210 },
    { name: "Gastro Relief", brand_name: "Gastro", generic_name: "omeprazole", category: "OTC", therapy_area: "Gastro", list_price: 60 },
    { name: "NeuroCalm", brand_name: "NeuroCalm", generic_name: "pregabalin", category: "Rx", therapy_area: "Neurology", list_price: 180 },
    { name: "OsteoMax", brand_name: "OsteoMax", generic_name: "alendronate", category: "Rx", therapy_area: "Orthopedics", list_price: 140 },
    { name: "DermaSoothe", brand_name: "DermaSoothe", generic_name: "hydrocortisone", category: "OTC", therapy_area: "Dermatology", list_price: 45 }
  ].map((p) => ({ ...p, currency: "EGP", is_active: true }));
  const { data: prods, error: prodErr } = await supabase.from("products").insert(prodSeed).select("id");
  if (prodErr) throw new Error("products: " + prodErr.message);

  // ── A handful of completed visits over the past 10 days ──
  let visitCount = 0;
  if (instIds.length && hcpIds.length) {
    const visitSeed = Array.from({ length: 24 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (i % 10));
      d.setHours(9 + (i % 7), (i * 13) % 60, 0, 0);
      return {
        rep_id: uid,
        hcp_id: hcpIds[i % hcpIds.length],
        institution_id: instIds[i % instIds.length],
        visit_type: "detailing",
        status: "completed",
        check_in_at: d.toISOString(),
        check_in_within_geofence: true,
        manager_status: "approved"
      };
    });
    const { data: vis, error: visErr } = await supabase.from("visits").insert(visitSeed).select("id");
    if (!visErr) visitCount = (vis ?? []).length;
  }

  return {
    institutions: instIds.length,
    hcps: hcpIds.length,
    products: (prods ?? []).length,
    visits: visitCount
  };
}
