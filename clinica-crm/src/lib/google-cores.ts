// Os 11 colorId fixos de evento do Google Calendar (id → nome + hex).
// A recepção escolhe uma categoria e a cor vai junto pro Google no sync.
export interface GoogleCor {
  id: number;
  nome: string;
  hex: string;
}

export const GOOGLE_CORES: GoogleCor[] = [
  { id: 1, nome: "Lavanda", hex: "#7986cb" },
  { id: 2, nome: "Sálvia", hex: "#33b679" },
  { id: 3, nome: "Uva", hex: "#8e24aa" },
  { id: 4, nome: "Flamingo", hex: "#e67c73" },
  { id: 5, nome: "Banana", hex: "#f6bf26" },
  { id: 6, nome: "Tangerina", hex: "#f4511e" },
  { id: 7, nome: "Pavão", hex: "#039be5" },
  { id: 8, nome: "Grafite", hex: "#616161" },
  { id: 9, nome: "Mirtilo", hex: "#3f51b5" },
  { id: 10, nome: "Manjericão", hex: "#0b8043" },
  { id: 11, nome: "Tomate", hex: "#d50000" },
];

const POR_ID = new Map(GOOGLE_CORES.map((c) => [c.id, c]));

export function hexDaCor(googleColorId: number | null | undefined): string {
  if (googleColorId == null) return "#039be5"; // padrão (Pavão)
  return POR_ID.get(googleColorId)?.hex ?? "#039be5";
}
