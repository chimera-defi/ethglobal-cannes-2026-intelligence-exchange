declare module '@worldcoin/idkit/signing' {
  export function signRequest(action: string, signingKey: string): {
    sig: string;
    nonce: string;
    createdAt: string;
    expiresAt: string;
  };
}

declare module '@0gfoundation/0g-ts-sdk' {
  export const Indexer: new (...args: any[]) => any;
  export const MemData: new (...args: any[]) => any;
}

declare module 'ethers' {
  export const JsonRpcProvider: new (...args: any[]) => any;
  export const Wallet: new (...args: any[]) => any;
}
