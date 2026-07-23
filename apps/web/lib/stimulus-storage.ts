import "server-only";

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_BUCKET = "study-stimuli";

type StoredObject = { bytes: Uint8Array; contentType: string };

function engine(): "local" | "supabase" {
  const configured = process.env.STIMULUS_STORAGE_ENGINE;
  if (configured === "local" || configured === "supabase") return configured;
  if (configured) throw new Error('STIMULUS_STORAGE_ENGINE must be "local" or "supabase".');
  return process.env.VERCEL || process.env.NODE_ENV === "production" ? "supabase" : "local";
}

function localPath(key: string): string {
  const configuredRoot = process.env.STIMULUS_STORAGE_DIR;
  const root = configuredRoot
    ? path.resolve(/* turbopackIgnore: true */ configuredRoot)
    : path.join(process.cwd(), ".dev", "stimuli");
  const segments = key.split("/");
  if (segments.length < 3 || segments.some((segment) => !/^[a-zA-Z0-9._-]+$/.test(segment))) {
    throw new Error("Invalid stimulus storage key.");
  }
  const target = path.resolve(root, ...segments);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Invalid stimulus storage path.");
  return target;
}

function supabaseConfig(): { baseUrl: string; serviceKey: string; bucket: string } {
  const baseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl) throw new Error("SUPABASE_URL is required for stimulus storage.");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for stimulus storage.");
  return { baseUrl: baseUrl.replace(/\/$/, ""), serviceKey, bucket: process.env.STIMULUS_STORAGE_BUCKET || DEFAULT_BUCKET };
}

function objectUrl(config: ReturnType<typeof supabaseConfig>, key: string): string {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${config.baseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodedKey}`;
}

export async function putStimulusObject(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  if (engine() === "local") {
    const target = localPath(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
    return;
  }
  const config = supabaseConfig();
  const response = await fetch(objectUrl(config, key), {
    method: "POST",
    headers: {
      apikey: config.serviceKey,
      authorization: `Bearer ${config.serviceKey}`,
      "content-type": contentType,
      "x-upsert": "false",
    },
    body: Buffer.from(bytes),
  });
  if (!response.ok) throw new Error(`Stimulus storage upload failed (${response.status}).`);
}

export async function getStimulusObject(key: string, contentType: string): Promise<StoredObject> {
  if (engine() === "local") return { bytes: await readFile(localPath(key)), contentType };
  const config = supabaseConfig();
  const response = await fetch(objectUrl(config, key), {
    headers: { apikey: config.serviceKey, authorization: `Bearer ${config.serviceKey}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Stimulus storage read failed (${response.status}).`);
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || contentType,
  };
}

export async function deleteStimulusObject(key: string): Promise<void> {
  if (engine() === "local") {
    try { await unlink(localPath(key)); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return;
  }
  const config = supabaseConfig();
  const response = await fetch(objectUrl(config, key), {
    method: "DELETE",
    headers: { apikey: config.serviceKey, authorization: `Bearer ${config.serviceKey}` },
  });
  if (!response.ok && response.status !== 404) throw new Error(`Stimulus storage delete failed (${response.status}).`);
}

export async function deleteStimulusObjectWithRetry(key: string, attempts = 3): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await deleteStimulusObject(key);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Stimulus storage cleanup failed.");
}
