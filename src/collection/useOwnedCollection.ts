import { useCallback, useEffect, useRef, useState } from "react";

const MAX_STORED_IDS = 20_000;
const MAX_STORAGE_LENGTH = 3 * 1024 * 1024;
const SAFE_COLLECTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const FORBIDDEN_COLLECTION_IDS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

function isSafeCollectionId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    SAFE_COLLECTION_ID_PATTERN.test(value) &&
    !FORBIDDEN_COLLECTION_IDS.has(value)
  );
}

function readOwnedIds(storageKey: string): Set<string> {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored && stored.length > MAX_STORAGE_LENGTH) {
      return new Set<string>();
    }
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }

    return new Set(
      parsed
        .filter(
          (value): value is string => isSafeCollectionId(value),
        )
        .slice(0, MAX_STORED_IDS),
    );
  } catch {
    return new Set<string>();
  }
}

function writeOwnedIds(storageKey: string, ownedIds: Set<string>): boolean {
  try {
    const safeIds = [...ownedIds]
      .filter(isSafeCollectionId)
      .slice(-MAX_STORED_IDS);
    window.localStorage.setItem(storageKey, JSON.stringify(safeIds));
    return true;
  } catch {
    return false;
  }
}

export function useOwnedCollection(storageKey: string) {
  const [ownedIds, setOwnedIds] = useState<Set<string>>(() =>
    readOwnedIds(storageKey),
  );
  const ownedIdsRef = useRef(ownedIds);
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    const storedIds = readOwnedIds(storageKey);
    ownedIdsRef.current = storedIds;
    setOwnedIds(storedIds);
    setStorageError(false);
  }, [storageKey]);

  useEffect(() => {
    const syncStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) {
        const storedIds = readOwnedIds(storageKey);
        ownedIdsRef.current = storedIds;
        setOwnedIds(storedIds);
        setStorageError(false);
      }
    };

    window.addEventListener("storage", syncStorage);
    return () => window.removeEventListener("storage", syncStorage);
  }, [storageKey]);

  const toggleOwned = useCallback(
    (id: string) => {
      if (!isSafeCollectionId(id)) return;
      const next = new Set(ownedIdsRef.current);
      if (next.has(id)) next.delete(id);
      else {
        if (next.size >= MAX_STORED_IDS) return;
        next.add(id);
      }

      ownedIdsRef.current = next;
      setOwnedIds(next);
      setStorageError(!writeOwnedIds(storageKey, next));
    },
    [storageKey],
  );

  return { ownedIds, storageError, toggleOwned };
}
