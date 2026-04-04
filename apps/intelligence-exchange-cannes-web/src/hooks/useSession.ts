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
    enabled: !!sessionQuery.data?.account,
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

  async function refreshSession() {
    await queryClient.invalidateQueries({ queryKey: ['session'] });
  }

  const session = sessionQuery.data?.account ?? null;
  const worldStatus = worldStatusQuery.data ?? null;
  const worldRoles = worldStatus?.verifications.map(verification => verification.role)
    ?? session?.worldRoles
    ?? [];

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
    refreshSession,
  };
}
