"use client";

const DB_NAME = "dtsc-retail-offline-v1";
const DB_VERSION = 1;
const KEY_STORE = "keys";
const SNAPSHOT_STORE = "snapshots";
const QUEUE_STORE = "queue";

export type RetailOfflineQueueStatus = "PENDING_SYNC" | "SYNCED" | "CONFLICT" | "REJECTED";

export type RetailOfflineSnapshotEnvelope = {
  version: string;
  payloadHash: string;
  validUntil: string;
  policy: {
    saleEnabled: boolean;
    blockingReason: string | null;
    allowedTenderTypes: string[];
    blockedTenderTypes: string[];
    customerSelectionAllowed: boolean;
    couponAllowed: boolean;
    priceOverrideAllowed: boolean;
    promotionsAllowed: boolean;
    maxQueueBatch: number;
  };
  catalog: {
    total: number;
    returned: number;
    truncated: boolean;
    items: Array<Record<string, unknown>>;
  };
  [key: string]: unknown;
};

export type RetailOfflineQueueEntry<T = unknown> = {
  id: string;
  organizationId: string;
  operationUuid: string;
  snapshotVersion: string;
  siteId: string;
  warehouseId: string;
  status: RetailOfflineQueueStatus;
  createdAt: string;
  updatedAt: string;
  conflictCode: string | null;
  serverEntityId: string | null;
  payload: T;
};

type EncryptedValue = {
  iv: number[];
  ciphertext: ArrayBuffer;
};

type StoredSnapshot = {
  id: string;
  organizationId: string;
  version: string;
  validUntil: string;
  updatedAt: string;
  encrypted: EncryptedValue;
};

type StoredQueueEntry = Omit<RetailOfflineQueueEntry, "payload"> & { encrypted: EncryptedValue };

function assertBrowserCrypto() {
  if (typeof window === "undefined" || !window.indexedDB || !window.crypto?.subtle) {
    throw new Error("RETAIL_OFFLINE_BROWSER_UNSUPPORTED");
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("RETAIL_OFFLINE_IDB_REQUEST_FAILED"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("RETAIL_OFFLINE_IDB_TRANSACTION_FAILED"));
    transaction.onabort = () => reject(transaction.error || new Error("RETAIL_OFFLINE_IDB_TRANSACTION_ABORTED"));
  });
}

async function openRetailOfflineDb() {
  assertBrowserCrypto();
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE, { keyPath: "id" });
    if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE, { keyPath: "id" });
    if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
  };
  return requestResult(request);
}

async function getOrCreateOrganizationKey(db: IDBDatabase, organizationId: string): Promise<CryptoKey> {
  const transaction = db.transaction(KEY_STORE, "readonly");
  const existing = await requestResult(transaction.objectStore(KEY_STORE).get(organizationId) as IDBRequest<{ id: string; key: CryptoKey } | undefined>);
  await transactionDone(transaction);
  if (existing?.key) return existing.key;

  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const write = db.transaction(KEY_STORE, "readwrite");
  write.objectStore(KEY_STORE).put({ id: organizationId, key, createdAt: new Date().toISOString() });
  await transactionDone(write);
  return key;
}

async function encryptJson(key: CryptoKey, value: unknown): Promise<EncryptedValue> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { iv: Array.from(iv), ciphertext };
}

async function decryptJson<T>(key: CryptoKey, value: EncryptedValue): Promise<T> {
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(value.iv) }, key, value.ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

function snapshotKey(organizationId: string) {
  return `${organizationId}:latest`;
}

export async function saveRetailOfflineSnapshot(organizationId: string, snapshot: RetailOfflineSnapshotEnvelope) {
  const db = await openRetailOfflineDb();
  try {
    const key = await getOrCreateOrganizationKey(db, organizationId);
    const encrypted = await encryptJson(key, snapshot);
    const transaction = db.transaction(SNAPSHOT_STORE, "readwrite");
    const stored: StoredSnapshot = { id: snapshotKey(organizationId), organizationId, version: snapshot.version, validUntil: snapshot.validUntil, updatedAt: new Date().toISOString(), encrypted };
    transaction.objectStore(SNAPSHOT_STORE).put(stored);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function loadRetailOfflineSnapshot(organizationId: string): Promise<RetailOfflineSnapshotEnvelope | null> {
  const db = await openRetailOfflineDb();
  try {
    const key = await getOrCreateOrganizationKey(db, organizationId);
    const transaction = db.transaction(SNAPSHOT_STORE, "readonly");
    const stored = await requestResult(transaction.objectStore(SNAPSHOT_STORE).get(snapshotKey(organizationId)) as IDBRequest<StoredSnapshot | undefined>);
    await transactionDone(transaction);
    if (!stored) return null;
    return decryptJson<RetailOfflineSnapshotEnvelope>(key, stored.encrypted);
  } finally {
    db.close();
  }
}

export async function enqueueRetailOfflineSale<T>(args: { organizationId: string; snapshotVersion: string; siteId: string; warehouseId: string; payload: T; operationUuid?: string }) {
  const db = await openRetailOfflineDb();
  try {
    const key = await getOrCreateOrganizationKey(db, args.organizationId);
    const operationUuid = args.operationUuid || crypto.randomUUID();
    const now = new Date().toISOString();
    const encrypted = await encryptJson(key, args.payload);
    const stored: StoredQueueEntry = {
      id: `${args.organizationId}:${operationUuid}`,
      organizationId: args.organizationId,
      operationUuid,
      snapshotVersion: args.snapshotVersion,
      siteId: args.siteId,
      warehouseId: args.warehouseId,
      status: "PENDING_SYNC",
      createdAt: now,
      updatedAt: now,
      conflictCode: null,
      serverEntityId: null,
      encrypted,
    };
    const transaction = db.transaction(QUEUE_STORE, "readwrite");
    transaction.objectStore(QUEUE_STORE).put(stored);
    await transactionDone(transaction);
    return operationUuid;
  } finally {
    db.close();
  }
}

export async function listRetailOfflineQueue<T = unknown>(organizationId: string): Promise<Array<RetailOfflineQueueEntry<T>>> {
  const db = await openRetailOfflineDb();
  try {
    const key = await getOrCreateOrganizationKey(db, organizationId);
    const transaction = db.transaction(QUEUE_STORE, "readonly");
    const all = await requestResult(transaction.objectStore(QUEUE_STORE).getAll() as IDBRequest<StoredQueueEntry[]>);
    await transactionDone(transaction);
    const organizationRows = all.filter((row) => row.organizationId === organizationId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return Promise.all(organizationRows.map(async (row) => ({
      id: row.id,
      organizationId: row.organizationId,
      operationUuid: row.operationUuid,
      snapshotVersion: row.snapshotVersion,
      siteId: row.siteId,
      warehouseId: row.warehouseId,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      conflictCode: row.conflictCode,
      serverEntityId: row.serverEntityId,
      payload: await decryptJson<T>(key, row.encrypted),
    })));
  } finally {
    db.close();
  }
}

export async function updateRetailOfflineQueueResult(organizationId: string, operationUuid: string, result: { status: RetailOfflineQueueStatus; conflictCode?: string | null; serverEntityId?: string | null }) {
  const db = await openRetailOfflineDb();
  try {
    const id = `${organizationId}:${operationUuid}`;
    const transaction = db.transaction(QUEUE_STORE, "readwrite");
    const store = transaction.objectStore(QUEUE_STORE);
    const row = await requestResult(store.get(id) as IDBRequest<StoredQueueEntry | undefined>);
    if (row) store.put({ ...row, status: result.status, conflictCode: result.conflictCode ?? null, serverEntityId: result.serverEntityId ?? null, updatedAt: new Date().toISOString() });
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function clearRetailOfflineOrganization(organizationId: string) {
  const db = await openRetailOfflineDb();
  try {
    const transaction = db.transaction([SNAPSHOT_STORE, QUEUE_STORE, KEY_STORE], "readwrite");
    transaction.objectStore(SNAPSHOT_STORE).delete(snapshotKey(organizationId));
    transaction.objectStore(KEY_STORE).delete(organizationId);
    const queueStore = transaction.objectStore(QUEUE_STORE);
    const rows = await requestResult(queueStore.getAll() as IDBRequest<StoredQueueEntry[]>);
    for (const row of rows) if (row.organizationId === organizationId) queueStore.delete(row.id);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export function retailOfflineIsUsable(snapshot: RetailOfflineSnapshotEnvelope | null) {
  if (!snapshot || !snapshot.policy.saleEnabled) return false;
  const validUntil = new Date(snapshot.validUntil).getTime();
  return Number.isFinite(validUntil) && validUntil > Date.now();
}
