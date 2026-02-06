// src/lib/jsonPath.ts
export function getByPath(obj: any, path: string) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

export function setByPath(obj: any, path: string, value: any) {
  const keys = path.split('.');
  const root = structuredClone(obj ?? {});
  let cur: any = root;

  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }

  cur[keys[keys.length - 1]] = value;
  return root;
}
