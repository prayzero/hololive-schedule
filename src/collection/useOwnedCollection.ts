import { useCallback, useEffect, useRef, useState } from "react";

const MAX_STORED_IDS = 20_000;
const MAX_ID_LENGTH = 240;

function readOwnedIds(storageKey: string): Set<string> {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const stored = window.localStorage.getItem(storageKey);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }

    return new Set(
      parsed
        .filter(
          (value): value is string =>
            typeof value === "string" &&
            value.length > 0 &&
            value.length <= MAX_ID_LENGTH,
        )
        .slice(0, MAX_STORED_IDS),
    );
  } catch {
    return new Set<string>();
  }
}

function writeOwnedIds(storageKey: string, ownedIds: Set<string>): boolean {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...ownedIds]));
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
      const next = new Set(ownedIdsRef.current);
      if (next.has(id)) next.delete(id);
      else next.add(id);

      ownedIdsRef.current = next;
      setOwnedIds(next);
      setStorageError(!writeOwnedIds(storageKey, next));
    },
    [storageKey],
  );

  return { ownedIds, storageError, toggleOwned };
}
