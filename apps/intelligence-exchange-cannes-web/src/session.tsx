import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAccount } from 'wagmi';

const STORAGE_KEY = 'iex-cannes-buyer-id';
const DEFAULT_BUYER_ID = 'demo-poster';

type BuyerSessionValue = {
  buyerId: string;
  connectedAddress: string | null;
  setBuyerId: (buyerId: string) => void;
};

const BuyerSessionContext = createContext<BuyerSessionValue | null>(null);

export function BuyerSessionProvider({ children }: { children: ReactNode }) {
  const { address } = useAccount();
  const [manualBuyerId, setManualBuyerIdState] = useState(DEFAULT_BUYER_ID);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setManualBuyerIdState(stored);
    }
  }, []);

  const buyerId = address ?? manualBuyerId;
  const value = useMemo<BuyerSessionValue>(() => ({
    buyerId,
    connectedAddress: address ?? null,
    setBuyerId(nextBuyerId: string) {
      const normalized = nextBuyerId.trim() || DEFAULT_BUYER_ID;
      window.localStorage.setItem(STORAGE_KEY, normalized);
      setManualBuyerIdState(normalized);
    },
  }), [address, buyerId]);

  return (
    <BuyerSessionContext.Provider value={value}>
      {children}
    </BuyerSessionContext.Provider>
  );
}

export function useBuyerSession() {
  const context = useContext(BuyerSessionContext);
  if (!context) {
    throw new Error('useBuyerSession must be used within BuyerSessionProvider');
  }
  return context;
}
