// src/lib/relief/decodeDepthmapPng.ts

export type DecodedDepthmap = {
  normF32: Float32Array;
  w: number;
  h: number;
  bitDepth?: 8 | 16;
};

// IMPORTANT: input is Uint8Array
export function decodeDepthmapPng(bytes: Uint8Array): DecodedDepthmap {
  // TODO: qui dentro deve esserci il tuo parser PNG vero (IHDR/IDAT/Inflate ecc.)
  // In questa patch mettiamo almeno un errore esplicito se il parser non è implementato,
  // così TS non vede più "void".
  throw new Error(
    "decodeDepthmapPng: parser non implementato o non collegato. Deve ritornare {normF32,w,h}."
  );
}
