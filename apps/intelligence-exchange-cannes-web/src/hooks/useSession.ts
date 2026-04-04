import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccount, useSignMessage } from 'wagmi';
import { createAuthChallenge, verifyAuthChallenge, getMe, logout as apiLogout, getWorldStatus } from '../api';

export function useSession() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ['session', 'me'],
    queryFn: getMe,
    retry: false,
    staleTime: 30_000,
    enabled: isConnected,
  });

  const worldStatusQuery = useQuery({
    queryKey: ['session', 'world'],
    queryFn: getWorldStatus,
    retry: false,
    staleTime: 30_000,
    enabled: !!sessionQuery.data,
  });

  async function signIn() {
    if (!address) throw new Error('Wallet not connected');
    const { challengeId, message } = await createAuthChallenge(address);
    const signature = await signMessageAsync({ message });
    await verifyAuthChallenge(challengeId, address, signature);
    await queryClient.invalidateQueries({ queryKey: ['session'] });
  }

  async function signOut() {
    await apiLogout();
    queryClient.removeQueries({ queryKey: ['session'] });
  }

  const session = sessionQuery.data ?? null;
  const worldStatus = worldStatusQuery.data ?? null;
  const worldRoles: Array<'poster' | 'worker' | 'reviewer'> = worldStatus?.roles ?? session?.worldRoles ?? [];

  return {
    isConnected,
    address,
    session,
    worldRoles,
    isPosterVerified: worldRoles.includes('poster'),
    isWorkerVerified: worldRoles.includes('worker'),
    isReviewerVerified: worldRoles.includes('reviewer'),
    isSessionLoading: sessionQuery.isLoading,
    signIn,
    signOut,
  };
}
