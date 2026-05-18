import type { DinnerExpense, PlayerSummary, SettlementBalanceInput } from '../types';

import { roundCurrency } from './utils';

export function calculateDinnerBalances(
  players: PlayerSummary[],
  expenses: DinnerExpense[]
): SettlementBalanceInput[] {
  const balances = players.reduce<Record<string, SettlementBalanceInput>>((accumulator, player) => {
    accumulator[player.id] = {
      balance: 0,
      id: player.id,
      name: player.name
    };
    return accumulator;
  }, {});

  const activeExpenses = expenses.filter((expense) => !expense.deleted_at);
  const sortedPlayers = players
    .slice()
    .sort((first, second) => first.name.localeCompare(second.name, 'es', { sensitivity: 'base' }));

  activeExpenses.forEach((expense) => {
    if (sortedPlayers.length === 0 || !balances[expense.paid_by_player_id]) {
      return;
    }

    const totalCents = Math.round(roundCurrency(expense.amount) * 100);
    const baseShareCents = Math.floor(totalCents / sortedPlayers.length);
    const remainderCents = totalCents - baseShareCents * sortedPlayers.length;

    sortedPlayers.forEach((player, index) => {
      const playerShareCents = baseShareCents + (index < remainderCents ? 1 : 0);
      balances[player.id].balance = roundCurrency(
        balances[player.id].balance - playerShareCents / 100
      );
    });

    balances[expense.paid_by_player_id].balance = roundCurrency(
      balances[expense.paid_by_player_id].balance + totalCents / 100
    );
  });

  return Object.values(balances);
}
