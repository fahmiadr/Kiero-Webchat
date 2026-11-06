import { useEffect, useState } from 'react';

const registry = new WeakMap();

export const acquireBlobUrl = (blob) => {
  if (!blob) return null;
  let entry = registry.get(blob);
  if (!entry) {
    entry = {
      url: URL.createObjectURL(blob),
      refCount: 0,
    };
    registry.set(blob, entry);
  }
  entry.refCount++;
  if (entry.timeoutId) {
    clearTimeout(entry.timeoutId);
    entry.timeoutId = undefined;
  }
  return entry.url;
};

export const releaseBlobUrl = (blob) => {
  if (!blob) return;
  const entry = registry.get(blob);
  if (!entry) return;

  entry.refCount--;
  if (entry.refCount <= 0) {
    entry.timeoutId = window.setTimeout(() => {
      if (entry.refCount <= 0) {
        URL.revokeObjectURL(entry.url);
        registry.delete(blob);
      }
    }, 500);
  }
};

export const useObjectUrl = (blob) => {
  const [objectUrl, setObjectUrl] = useState(null);

  useEffect(() => {
    if (!blob) {
      setObjectUrl(null);
      return;
    }
    const url = acquireBlobUrl(blob);
    setObjectUrl(url);
    return () => {
      releaseBlobUrl(blob);
    };
  }, [blob]);

  return objectUrl;
};
