import React, { createContext, useContext, useState, useEffect } from 'react';
import type { PermissionConfig } from '../utils/permissionCheck';
import { DEFAULT_PERMISSIONS, PERMISSION_STORAGE_KEY } from '../utils/permissionCheck';

const PermissionsContext = createContext<{
  permissions: PermissionConfig;
  setPermissions: React.Dispatch<React.SetStateAction<PermissionConfig>>;
}>({ permissions: DEFAULT_PERMISSIONS, setPermissions: () => {} });

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const [permissions, setPermissions] = useState<PermissionConfig>(() => {
    try {
      const raw = localStorage.getItem(PERMISSION_STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        return {
          ...DEFAULT_PERMISSIONS,
          ...data,
        };
      }
    } catch {}
    return DEFAULT_PERMISSIONS;
  });

  useEffect(() => {
    localStorage.setItem(PERMISSION_STORAGE_KEY, JSON.stringify(permissions));
  }, [permissions]);

  useEffect(() => {
    const api = (window as any)?.electronAPI;
    if (!api?.getAgentPermissions) return;
    let mounted = true;
    api.getAgentPermissions()
      .then((res: any) => {
        if (!mounted || !res?.success || !res?.data) return;
        setPermissions((prev) => ({
          ...prev,
          ...res.data,
        }));
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  return (
    <PermissionsContext.Provider value={{ permissions, setPermissions }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
