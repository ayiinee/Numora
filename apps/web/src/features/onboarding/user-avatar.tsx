'use client';
import { useQuery } from '@tanstack/react-query';
import { Avatar, type AvatarProps } from '@tka/ui';
import { getProfilePhoto } from '@/lib/api';
import { useAuth } from './auth';

export function useProfilePhoto(userId?: string) {
  const { state } = useAuth();
  const token = state.status === 'ready' ? state.session.access_token : '';
  return useQuery({
    queryKey: ['profile-photo', userId],
    queryFn: () => getProfilePhoto(token, userId!),
    enabled: !!userId && !!token,
    staleTime: 600_000,
    refetchInterval: 600_000,
    retry: false,
  });
}
export function UserAvatar({
  userId,
  ...props
}: Omit<AvatarProps, 'src'> & { userId?: string | undefined }) {
  const photo = useProfilePhoto(userId);
  return <Avatar {...props} {...(photo.data?.url ? { src: photo.data.url } : {})} />;
}
export function OwnAvatar(props: Omit<AvatarProps, 'src'>) {
  const { state } = useAuth();
  return (
    <UserAvatar {...props} {...(state.status === 'ready' ? { userId: state.profile.id } : {})} />
  );
}
