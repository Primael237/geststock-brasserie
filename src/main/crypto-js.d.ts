declare module 'crypto-js' {
  interface CipherParams {
    toString(): string;
  }
  interface AES {
    encrypt(message: string, key: string): CipherParams;
    decrypt(ciphertext: string, key: string): any;
  }
  export const AES: AES;
}