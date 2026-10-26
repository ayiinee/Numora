'use client';

import { useAuth } from '@/features/onboarding/auth';
import { destination } from '@/features/onboarding/destination';
import { ApiProblem, type IdentityProfile } from '@/lib/api';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { adminCanAccess, type AdminWorkspacePermission as Permission } from './admin-access';

const AccessError = createContext<(error: unknown) => void>(() => {});
export const useAdminAccessError = () => useContext(AccessError);

export function AdminWorkspace({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { state, refresh } = useAuth();
  const router = useRouter();
  const profile = state.status === 'ready' ? state.profile : null;
  const parentError = useContext(AccessError);
  const [blocked, setBlocked] = useState<{
    profile: IdentityProfile | null;
    message: string;
  } | null>(null);
  const onError = useCallback(
    (error: unknown) => {
      if (error instanceof ApiProblem && [401, 403].includes(error.status)) {
        parentError(error);
        setBlocked({ profile, message: error.message });
      }
    },
    [profile, parentError],
  );
  useEffect(() => {
    if (state.status === 'signed_out') router.replace('/admin/login');
    if (state.status === 'registration') router.replace('/onboarding');
    if (state.status === 'ready' && state.profile.role !== 'ADMIN')
      router.replace(destination(state.profile));
  }, [router, state]);

  // refresh() schedules an identity check; it does not await its result. Keep the
  // workspace closed until AuthProvider supplies a newly checked profile object.
  const denied = blocked !== null && blocked.profile === profile;
  if (!adminCanAccess(profile, permission) || denied) {
    return (
      <AdminFrame
        title="Akses Admin"
        description="Periksa akses akun untuk melanjutkan."
        icon="lock"
      >
        {state.status === 'loading' ? (
          <AdminLoading message="Memeriksa akses Admin…" />
        ) : (
          <AdminMessage
            error
            message={
              denied
                ? blocked.message
                : state.status === 'error' || state.status === 'disabled'
                  ? (state.message ?? 'Akun tidak dapat mengakses halaman ini.')
                  : permission === 'content'
                    ? 'Akses memerlukan Super Admin atau Admin Content, Data & Moderation.'
                    : 'Halaman ini hanya tersedia untuk Admin Operasional atau Super Admin yang aktif.'
            }
            login
            retry={() => void refresh()}
          />
        )}
      </AdminFrame>
    );
  }
  const key =
    state.status === 'ready'
      ? JSON.stringify([profile?.id, profile?.adminRole, profile?.status, profile?.capabilities])
      : state.status;
  return (
    <AccessError.Provider key={key} value={onError}>
      {children}
    </AccessError.Provider>
  );
}

export function withAdminWorkspace<P extends object>(
  Component: ComponentType<P>,
  permission: Permission,
) {
  return function ProtectedAdminWorkspace(props: P) {
    return (
      <AdminWorkspace permission={permission}>
        <Component {...props} />
      </AdminWorkspace>
    );
  };
}
