declare module '@worldcoin/idkit/signing' {
  export function signRequest(action: string, signingKey: string): {
    sig: string;
    nonce: string;
    createdAt: string;
    expiresAt: string;
  };
}

declare module 'ethers' {
  export const JsonRpcProvider: new (...args: any[]) => any;
  export const Wallet: new (...args: any[]) => any;
}
