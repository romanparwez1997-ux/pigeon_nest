export type Mark = 'X' | 'O' | null;
export const LINES = [[0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6]];
export function winner(board: Mark[]): 'X' | 'O' | 'draw' | null {
  for (const [a,b,c] of LINES) if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  return board.every(Boolean) ? 'draw' : null;
}
export function botMove(board: Mark[]): number | null {
  if (winner(board)) return null;
  for (const mark of ['O', 'X'] as const) {
    for (let i = 0; i < 9; i++) {
      if (board[i]) continue;
      const trial = [...board]; trial[i] = mark;
      if (winner(trial) === mark) return i;
    }
  }
  // The courier plays a friendly, beatable opponent.
  return [4, 0, 8, 2, 6, 1, 3, 5, 7].find(i => !board[i]) ?? null;
}
export function shuffledStamps(random = Math.random): string[] {
  const cards = ['🇯🇵', '🇫🇮', '🇧🇷', '🇮🇹', '🇰🇪', '🇵🇹'].flatMap(x => [x, x]);
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return cards;
}
