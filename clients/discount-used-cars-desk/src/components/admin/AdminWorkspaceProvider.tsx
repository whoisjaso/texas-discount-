"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ADMIN_WORKSPACE_COOKIE,
  ADMIN_WORKSPACE_STORAGE_KEY,
  WORKSPACE_DASHBOARDS,
  cleanAdminPath,
  getCanonicalWorkspaceRoute,
  getWorkspaceFromPath,
  isAdminWorkspace,
  SOLE_ADMIN_WORKSPACE,
  type AdminWorkspace,
} from "@/lib/admin/workspace";

interface AdminWorkspaceContextValue {
  selectedWorkspace: AdminWorkspace | null;
  activeWorkspace: AdminWorkspace | null;
  ready: boolean;
  selectWorkspace: (workspace: AdminWorkspace) => void;
  clearWorkspace: () => void;
}

const AdminWorkspaceContext = createContext<AdminWorkspaceContextValue | null>(null);

function readWorkspaceCookie(): AdminWorkspace | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${ADMIN_WORKSPACE_COOKIE}=`));
  const value = match ? decodeURIComponent(match.split("=")[1] ?? "") : null;
  return isAdminWorkspace(value) ? value : null;
}

function writeWorkspaceCookie(workspace: AdminWorkspace): void {
  document.cookie = `${ADMIN_WORKSPACE_COOKIE}=${workspace}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
}

export function AdminWorkspaceProvider({
  children,
  routeWorkspace = null,
}: {
  children: ReactNode;
  routeWorkspace?: AdminWorkspace | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedWorkspace, setSelectedWorkspace] = useState<AdminWorkspace | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? window.localStorage.getItem(ADMIN_WORKSPACE_STORAGE_KEY)
        : null;
    const workspace =
      routeWorkspace ??
      (isAdminWorkspace(stored) ? stored : readWorkspaceCookie()) ??
      SOLE_ADMIN_WORKSPACE;
    if (workspace && typeof window !== "undefined") {
      window.localStorage.setItem(ADMIN_WORKSPACE_STORAGE_KEY, workspace);
      writeWorkspaceCookie(workspace);
    }
    queueMicrotask(() => {
      setSelectedWorkspace(workspace);
      setReady(true);
    });
  }, [routeWorkspace]);

  const selectWorkspace = useCallback(
    (workspace: AdminWorkspace) => {
      setSelectedWorkspace(workspace);
      window.localStorage.setItem(ADMIN_WORKSPACE_STORAGE_KEY, workspace);
      writeWorkspaceCookie(workspace);
      router.push(WORKSPACE_DASHBOARDS[workspace]);
    },
    [router],
  );

  const clearWorkspace = useCallback(() => {
    setSelectedWorkspace(null);
    window.localStorage.removeItem(ADMIN_WORKSPACE_STORAGE_KEY);
    document.cookie = `${ADMIN_WORKSPACE_COOKIE}=; path=/; max-age=0; samesite=lax`;
    router.push("/admin");
  }, [router]);

  useEffect(() => {
    if (!ready) return;

    const cleanPath = cleanAdminPath(pathname);
    if (
      cleanPath === "/admin" ||
      cleanPath === "/admin/login" ||
      cleanPath === "/admin/signup" ||
      cleanPath === "/admin/account/password" ||
      cleanPath === "/admin/account/onboarding"
    ) {
      return;
    }

    if (!selectedWorkspace) return;

    const pathWorkspace = getWorkspaceFromPath(cleanPath);
    if (pathWorkspace && pathWorkspace !== selectedWorkspace) {
      window.localStorage.setItem(ADMIN_WORKSPACE_STORAGE_KEY, pathWorkspace);
      writeWorkspaceCookie(pathWorkspace);
      queueMicrotask(() => setSelectedWorkspace(pathWorkspace));
      return;
    }

    const canonical = getCanonicalWorkspaceRoute(cleanPath, selectedWorkspace);
    if (canonical && canonical !== cleanPath) {
      const search = searchParams.toString();
      router.replace(`${canonical}${search ? `?${search}` : ""}`);
    }
  }, [pathname, ready, router, searchParams, selectedWorkspace]);

  const value = useMemo<AdminWorkspaceContextValue>(
    () => ({
      selectedWorkspace,
      activeWorkspace: selectedWorkspace ?? routeWorkspace,
      ready,
      selectWorkspace,
      clearWorkspace,
    }),
    [clearWorkspace, ready, routeWorkspace, selectWorkspace, selectedWorkspace],
  );

  return (
    <AdminWorkspaceContext.Provider value={value}>
      {children}
    </AdminWorkspaceContext.Provider>
  );
}

export function useAdminWorkspace() {
  const context = useContext(AdminWorkspaceContext);
  if (!context) {
    throw new Error("useAdminWorkspace must be used within AdminWorkspaceProvider");
  }
  return context;
}
