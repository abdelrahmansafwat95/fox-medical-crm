"use client";

// Work done without signal is kept on the phone (IndexedDB) and replayed, in
// order, when the connection comes back. Reps lose signal inside hospitals,
// so every field action — check-in, manual visit, order, sample hand-over
// (with its signature), expense, detailing — goes through here.

import { openDB, type IDBPDatabase } from "idb";
import { supabase } from "./supabase";

interface QueuedRequest {
  id?: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  /** body is base64 of binary data (a signature image) */
  binary?: boolean;
  /** an RPC that answers 200 with {success:false} has still failed */
  checkSuccess?: boolean;
  /** what the rep did, for the "waiting to sync" list */
  label?: string;
  created_at: number;
  retries: number;
}
export interface FailedItem {
  id?: number;
  label: string;
  error: string;
  created_at: number;
}

const DB_NAME = "fox-medical-offline";
const STORE = "queued_requests";
const FAILED = "failed_requests";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        if (!db.objectStoreNames.contains(FAILED)) db.createObjectStore(FAILED, { keyPath: "id", autoIncrement: true });
      }
    });
  }
  return dbPromise;
}

const changed = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("foxmed:queue"));
};

const online = () => (typeof navigator === "undefined" ? true : navigator.onLine);

/** A failed fetch (no route to the server), as opposed to the server saying no. */
export function isNetworkError(e: unknown): boolean {
  const m = String((e as { message?: string })?.message ?? e ?? "");
  return !online() || /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(m);
}

/** Try a fetch — if offline or it fails, queue for later. */
export async function fetchOrQueue(
  url: string,
  init: RequestInit,
  label = "Check-in"
): Promise<{ ok: boolean; queued: boolean; data?: unknown }> {
  const item = { url, method: init.method ?? "POST", headers: (init.headers as Record<string, string>) ?? {}, body: typeof init.body === "string" ? init.body : "", label };
  if (online()) {
    try {
      const res = await fetch(url, init);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: true, queued: false, data };
      }
      throw new Error("server_error");
    } catch {
      await enqueue(item);
      return { ok: false, queued: true };
    }
  }
  await enqueue(item);
  return { ok: false, queued: true };
}

async function enqueue(r: Omit<QueuedRequest, "created_at" | "retries">) {
  const db = await getDB();
  await db.add(STORE, { ...r, created_at: Date.now(), retries: 0 } as QueuedRequest);
  changed();
}

async function restHeaders(extra: Record<string, string> = {}) {
  const { data } = await supabase.auth.getSession();
  return {
    apikey: SB_KEY,
    Authorization: `Bearer ${data.session?.access_token ?? SB_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}

export type OfflineResult = { ok: boolean; queued: boolean; error?: string; data?: unknown };

/** Insert a row now, or queue it when there is no connection. */
export async function offlineInsert(table: string, row: Record<string, unknown>, label: string): Promise<OfflineResult> {
  if (online()) {
    const { error } = await supabase.from(table).insert(row);
    if (!error) return { ok: true, queued: false };
    if (!isNetworkError(error)) return { ok: false, queued: false, error: error.message };
  }
  await enqueue({ url: `${SB_URL}/rest/v1/${table}`, method: "POST", headers: await restHeaders({ Prefer: "return=minimal" }), body: JSON.stringify(row), label });
  return { ok: false, queued: true };
}

/** Update rows matching `eq` now, or queue it. */
export async function offlineUpdate(table: string, eq: Record<string, string>, patch: Record<string, unknown>, label: string): Promise<OfflineResult> {
  if (online()) {
    let q = supabase.from(table).update(patch);
    for (const [k, v] of Object.entries(eq)) q = q.eq(k, v);
    const { error } = await q;
    if (!error) return { ok: true, queued: false };
    if (!isNetworkError(error)) return { ok: false, queued: false, error: error.message };
  }
  const filter = Object.entries(eq).map(([k, v]) => `${encodeURIComponent(k)}=eq.${encodeURIComponent(v)}`).join("&");
  await enqueue({ url: `${SB_URL}/rest/v1/${table}?${filter}`, method: "PATCH", headers: await restHeaders({ Prefer: "return=minimal" }), body: JSON.stringify(patch), label });
  return { ok: false, queued: true };
}

/** Call a database function now, or queue it. `checkSuccess`: it answers {success:false,error} on refusal. */
export async function offlineRpc(fn: string, args: Record<string, unknown>, label: string, checkSuccess = false): Promise<OfflineResult> {
  if (online()) {
    const { data, error } = await supabase.rpc(fn, args);
    if (!error) return { ok: true, queued: false, data };
    if (!isNetworkError(error)) return { ok: false, queued: false, error: error.message };
  }
  await enqueue({ url: `${SB_URL}/rest/v1/rpc/${fn}`, method: "POST", headers: await restHeaders(), body: JSON.stringify(args), checkSuccess, label });
  return { ok: false, queued: true };
}

/** Upload a file (a signature) now, or keep it on the phone and upload it on reconnect. */
export async function offlineUpload(bucket: string, path: string, blob: Blob, contentType: string, label: string): Promise<OfflineResult> {
  if (online()) {
    const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType });
    if (!error) return { ok: true, queued: false };
    if (!isNetworkError(error)) return { ok: false, queued: false, error: error.message };
  }
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...Array.from(buf.subarray(i, i + 0x8000)));
  await enqueue({
    url: `${SB_URL}/storage/v1/object/${bucket}/${path}`, method: "POST",
    headers: await restHeaders({ "Content-Type": contentType }), body: btoa(bin), binary: true, label
  });
  return { ok: false, queued: true };
}

let flushing: Promise<{ flushed: number; failed: number }> | null = null;

/** Replay all queued requests, oldest first. Call when the network comes back. */
export function flushQueue(): Promise<{ flushed: number; failed: number }> {
  if (!flushing) flushing = doFlush().finally(() => { flushing = null; changed(); });
  return flushing;
}

async function doFlush(): Promise<{ flushed: number; failed: number }> {
  const db = await getDB();
  const all = (await db.getAll(STORE)) as QueuedRequest[];
  let flushed = 0;
  let failed = 0;

  // The queued requests captured a bearer token that may have expired while
  // offline. Refresh it once and swap it into any Authorization header.
  const { data: sess } = await supabase.auth.getSession();
  const freshToken = sess.session?.access_token;

  for (const req of all) {
    try {
      const headers = { ...req.headers };
      if (freshToken && (headers.Authorization || headers.authorization)) {
        delete headers.authorization;
        headers.Authorization = `Bearer ${freshToken}`;
      }
      const body = req.binary ? Uint8Array.from(atob(req.body), (c) => c.charCodeAt(0)) : req.body;
      const res = await fetch(req.url, { method: req.method, headers, body });
      let refusal: string | null = null;
      if (res.ok && req.checkSuccess) {
        const j = (await res.clone().json().catch(() => null)) as { success?: boolean; error?: string } | null;
        if (j && j.success === false) refusal = j.error ?? "refused";
      }
      if (res.ok && !refusal) {
        if (req.id !== undefined) await db.delete(STORE, req.id);
        flushed++;
      } else if (refusal || (res.status >= 400 && res.status < 500 && res.status !== 401) || req.retries >= 5) {
        // The server said no (or kept failing): move it to the failed list so
        // the rep sees it, rather than retrying forever or dropping it silently.
        const text = refusal ?? (await res.text().catch(() => "")).slice(0, 300);
        await db.add(FAILED, { label: req.label ?? "Saved item", error: text || `HTTP ${res.status}`, created_at: req.created_at } as FailedItem);
        if (req.id !== undefined) await db.delete(STORE, req.id);
        failed++;
      } else {
        await db.put(STORE, { ...req, retries: req.retries + 1 });
        failed++;
        break; // keep the order: later items may depend on this one
      }
    } catch {
      failed++;
      break; // still offline
    }
  }
  return { flushed, failed };
}

export async function queueSize(): Promise<number> {
  const db = await getDB();
  return await db.count(STORE);
}

export async function queuedLabels(): Promise<string[]> {
  const db = await getDB();
  return ((await db.getAll(STORE)) as QueuedRequest[]).map((r) => r.label ?? "Saved item");
}

export async function failedItems(): Promise<FailedItem[]> {
  const db = await getDB();
  return (await db.getAll(FAILED)) as FailedItem[];
}

export async function clearFailed(): Promise<void> {
  const db = await getDB();
  await db.clear(FAILED);
  changed();
}
