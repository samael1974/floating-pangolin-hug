// src/lib/reliefTypes.ts
// Tipi condivisi tra UI e core (NO dipendenze da THREE o React)

export type ReliefType = {
  id: string;
  name: string;
  description: string;
};

// Modalità di output per la mesh/STL
export type OutputMode = "relief" | "mold";

// Stile base (piatta o incassata)
export type BaseStyle = "flat" | "recessed";
