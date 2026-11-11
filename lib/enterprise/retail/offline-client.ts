"use client";

const DB_NAME = "dtsc-retail-offline-v1";
const DB_VERSION = 1;
const KEY_STORE = "keys";
const SNAPSHOT_STORE = "snapshots";
const QUEUE_STORE = "queue";

export type RetailOfflineQueueStatus = "PENDING_SYNC" | "SYNCED" | "CONFLICT" | "REJECTED";

export type RetailOfflineSnapshotCatalogItem = {
  catalogItemId: string;
  inventoryItemId: string | null;
  code: string;
  sku: string | null;
  name: string;
  currencyCode: string;
  unitPrice: string | null;
  serviceUnitPrice: string | null;
  customerUnitDiscountAmount: string | null;
  serviceUnitDiscountAmount: string | null;
  taxRate: string | null;
  taxIncluded: boolean;
  unitTaxAmount: string | null;
  unitLineTotal: string | null;
  trackInventory: boolean;
  quantityAvailable: string;
  offlineEligible: boolean;
  [key: string]: unknown;
};

export type RetailOfflineSnapshotEnvelope = {
  version: string;
  payloadHash: string;
  validUntil: string;
  policy: {
    saleEnabled: boolean;
    /** Finance draft mode never confirms a tender or posts stock/accounting offline. */
    draftOnly?: boolean;
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
    items: RetailOfflineSnapshotCatalogItem[];
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
  ownerScope?: string;
  version: string;
  validUntil: string;
  updatedAt: string;
  encrypted: EncryptedValue;
};

type StoredQueueEntry = Omit<RetailOfflineQueueEntry, "payload"> & { encrypted: EncryptedValue; ownerScope?: string };

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

async function getOrCreateOrganizationKey(db: IDBDatabase, ownerScope: string): Promise<CryptoKey> {
  async function readExisting(): Promise<CryptoKey | null> {
    const transaction = db.transaction(KEY_STORE, "readonly");
    const done = transactionDone(transaction);
    const row = await requestResult(transaction.objectStore(KEY_STORE).get(ownerScope) as IDBRequest<{ id: string; key: CryptoKey } | undefined>);
    await done;
    return row?.key || null;
  }
  const existing = await readExisting();
  if (existing) return existing;

  const candidate = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  try {
    const transaction = db.transaction(KEY_STORE, "readwrite");
    const done = transactionDone(transaction);
    // add() is deliberate: put() could silently overwrite the key created
    // concurrently in another tab and make its encrypted queue unreadable.
    transaction.objectStore(KEY_STORE).add({ id: ownerScope, key: candidate, createdAt: new Date().toISOString() });
    await done;
    return candidate;
  } catch (error) {
    const raced = await readExisting();
    if (raced) return raced;
    throw error;
  }
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

// IndexedDB itself is private to this browser profile and origin.
// Never use localStorage for financial payloads or local keys. Within that
// browser, isolate all offline records and CryptoKeys by company and actor.
// Older company-only records stay untouched and cannot be adopted by a
// different user without a separately audited recovery workflow.
function offlineLocalScope(organizationId: string, actorUserId: string) {
  if (!organizationId || !actorUserId.trim()) throw new Error("RETAIL_OFFLINE_ACTOR_SCOPE_REQUIRED");
  return `${organizationId}:user:${actorUserId}`;
}

function snapshotKey(scope: string) {
  return `${scope}:latest`;
}

export async function saveRetailOfflineSnapshot(organizationId: string, snapshot: RetailOfflineSnapshotEnvelope, actorUserId: string) {
  const db = await openRetailOfflineDb();
  try {
    const ownerScope = offlineLocalScope(organizationId, actorUserId);
    const key = await getOrCreateOrganizationKey(db, ownerScope);
    const encrypted = await encryptJson(key, snapshot);
    const transaction = db.transaction(SNAPSHOT_STORE, "readwrite");
    const done = transactionDone(transaction);
    const stored: StoredSnapshot = { id: snapshotKey(ownerScope), organizationId, ownerScope, version: snapshot.version, validUntil: snapshot.validUntil, updatedAt: new Date().toISOString(), encrypted };
    transaction.objectStore(SNAPSHOT_STORE).put(stored);
    await done;
  } finally {
    db.close();
  }
}

export async function loadRetailOfflineSnapshot(organizationId: string, actorUserId: string): Promise<RetailOfflineSnapshotEnvelope | null> {
  const db = await openRetailOfflineDb();
  try {
    const ownerScope = offlineLocalScope(organizationId, actorUserId);
    const key = await getOrCreateOrganizationKey(db, ownerScope);
    const transaction = db.transaction(SNAPSHOT_STORE, "readonly");
    const done = transactionDone(transaction);
    const stored = await requestResult(transaction.objectStore(SNAPSHOT_STORE).get(snapshotKey(ownerScope)) as IDBRequest<StoredSnapshot | undefined>);
    await done;
    if (!stored) return null;
    return decryptJson<RetailOfflineSnapshotEnvelope>(key, stored.encrypted);
  } finally {
    db.close();
  }
}

export async function enqueueRetailOfflineSale<T>(args: { organizationId: string; actorUserId: string; snapshotVersion: string; siteId: string; warehouseId: string; payload: T; operationUuid?: string }) {
  const db = await openRetailOfflineDb();
  try {
    const ownerScope = offlineLocalScope(args.organizationId, args.actorUserId);
    const key = await getOrCreateOrganizationKey(db, ownerScope);
    const operationUuid = args.operationUuid || crypto.randomUUID();
    const now = new Date().toISOString();
    const encrypted = await encryptJson(key, args.payload);
    const stored: StoredQueueEntry = {
      id: `${ownerScope}:${operationUuid}`,
      ownerScope,
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
    const done = transactionDone(transaction);
    transaction.objectStore(QUEUE_STORE).put(stored);
    await done;
    return operationUuid;
  } finally {
    db.close();
  }
}

export async function listRetailOfflineQueue<T = unknown>(organizationId: string, actorUserId: string): Promise<Array<RetailOfflineQueueEntry<T>>> {
  const db = await openRetailOfflineDb();
  try {
    const ownerScope = offlineLocalScope(organizationId, actorUserId);
    const key = await getOrCreateOrganizationKey(db, ownerScope);
    const transaction = db.transaction(QUEUE_STORE, "readonly");
    const done = transactionDone(transaction);
    const all = await requestResult(transaction.objectStore(QUEUE_STORE).getAll() as IDBRequest<StoredQueueEntry[]>);
    await done;
    const organizationRows = all.filter((row) => row.organizationId === organizationId && (row.ownerScope || organizationId) === ownerScope).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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

export async function updateRetailOfflineQueueResult(organizationId: string, operationUuid: string, result: { status: RetailOfflineQueueStatus; conflictCode?: string | null; serverEntityId?: string | null }, actorUserId: string) {
  const db = await openRetailOfflineDb();
  try {
    const id = `${offlineLocalScope(organizationId, actorUserId)}:${operationUuid}`;
    const transaction = db.transaction(QUEUE_STORE, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(QUEUE_STORE);
    const row = await requestResult(store.get(id) as IDBRequest<StoredQueueEntry | undefined>);
    if (row) store.put({ ...row, status: result.status, conflictCode: result.conflictCode ?? null, serverEntityId: result.serverEntityId ?? null, updatedAt: new Date().toISOString() });
    await done;
  } finally {
    db.close();
  }
}

export async function clearRetailOfflineOrganization(organizationId: string, actorUserId: string) {
  const db = await openRetailOfflineDb();
  try {
    const ownerScope = offlineLocalScope(organizationId, actorUserId);
    // The queue is checked and deleted under ONE readwrite transaction. This
    // stops another tab from inserting an unresolved draft between the check
    // and deletion, which could otherwise destroy pending Finance work.
    const transaction = db.transaction([SNAPSHOT_STORE, QUEUE_STORE, KEY_STORE], "readwrite");
    const done = transactionDone(transaction);
    const queueStore = transaction.objectStore(QUEUE_STORE);
    const rows = await requestResult(queueStore.getAll() as IDBRequest<StoredQueueEntry[]>);
    const owned = rows.filter((row) => row.organizationId === organizationId && (row.ownerScope || organizationId) === ownerScope);
    if (owned.some((row) => row.status !== "SYNCED")) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("RETAIL_OFFLINE_UNRESOLVED_LOCAL_OPERATIONS");
    }
    for (const row of owned) queueStore.delete(row.id);
    transaction.objectStore(SNAPSHOT_STORE).delete(snapshotKey(ownerScope));
    transaction.objectStore(KEY_STORE).delete(ownerScope);
    await done;
  } finally {
    db.close();
  }
}

export function retailOfflineIsUsable(snapshot: RetailOfflineSnapshotEnvelope | null) {
  if (!snapshot || !snapshot.policy.saleEnabled) return false;
  const validUntil = new Date(snapshot.validUntil).getTime();
  return Number.isFinite(validUntil) && validUntil > Date.now();
}
