"use client";

import { openDB, type IDBPDatabase } from "idb";
import { supabase } from "./supabase";

interface QueuedRequest {
  id?: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  created_at: number;
  retries: number;
}

const DB_NAME = "fox-medical-offline";
const STORE = "queued_requests";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        }
      }
    });
  }
  return dbPromise;
}

/** Try a fetch — if offline or it fails, queue for later. */
export async function fetchOrQueue(
  url: string,
  init: RequestInit
): Promise<{ ok: boolean; queued: boolean; data?: unknown }> {
  const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;
  if (isOnline) {
    try {
      const res = await fetch(url, init);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: true, queued: false, data };
      }
      // Server error — queue it
      throw new Error("server_error");
    } catch {
      await enqueue(url, init);
      return { ok: false, queued: true };
    }
  } else {
    await enqueue(url, init);
    return { ok: false, queued: true };
  }
}

async function enqueue(url: string, init: RequestInit) {
  const db = await getDB();
  await db.add(STORE, {
    url,
    method: init.method ?? "POST",
    headers: (init.headers as Record<string, string>) ?? {},
    body: typeof init.body === "string" ? init.body : "",
    created_at: Date.now(),
    retries: 0
  } as QueuedRequest);
}

/** Replay all queued requests. Call when network comes back. */
export async function flushQueue(): Promise<{ flushed: number; failed: number }> {
  const db = await getDB();
  const all = (await db.getAll(STORE)) as QueuedRequest[];
  let flushed = 0;
  let failed = 0;

  // The queued requests captured a bearer token that may have expired while
  // offline. Refresh it once and swap it into any Authorization header so
  // replays don't 401 purely due to token expiry.
  const { data: sess } = await supabase.auth.getSession();
  const freshToken = sess.session?.access_token;

  for (const req of all) {
    try {
      const headers = { ...req.headers };
      if (freshToken && (headers.Authorization || headers.authorization)) {
        delete headers.authorization;
        headers.Authorization = `Bearer ${freshToken}`;
      }
      const res = await fetch(req.url, {
        method: req.method,
        headers,
        body: req.body
      });
      if (res.ok) {
        if (req.id !== undefined) await db.delete(STORE, req.id);
        flushed++;
      } else if (req.retries < 5) {
        await db.put(STORE, { ...req, retries: req.retries + 1 });
        failed++;
      } else {
        if (req.id !== undefined) await db.delete(STORE, req.id);
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { flushed, failed };
}

export async function queueSize(): Promise<number> {
  const db = await getDB();
  return await db.count(STORE);
}
