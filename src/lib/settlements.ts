import type { SettlementBalanceInput, SettlementComputationInput, SettlementResult } from '../types';

import { isNearlyZero, roundCurrency } from './utils';

interface BalanceNode {
  balance: number;
  id: string;
  name: string;
}

export function calculateSettlements(
  players: SettlementComputationInput[]
): SettlementResult[] {
  return calculateSettlementsFromBalances(
    players.map((player) => ({
      id: player.id,
      name: player.name,
      balance: roundCurrency(player.finalAmount - player.totalContributed)
    }))
  );
}

export function calculateSettlementsFromBalances(
  playerBalances: SettlementBalanceInput[]
): SettlementResult[] {
  const balances: BalanceNode[] = playerBalances.map((player) => ({
    id: player.id,
    name: player.name,
    balance: roundCurrency(player.balance)
  }));

  const debtors = balances
    .filter((player) => player.balance < 0)
    .sort((first, second) => first.balance - second.balance);

  const creditors = balances
    .filter((player) => player.balance > 0)
    .sort((first, second) => second.balance - first.balance);

  const settlements: SettlementResult[] = [];

  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort((first, second) => first.balance - second.balance);
    creditors.sort((first, second) => second.balance - first.balance);

    const debtor = debtors[0];
    const creditor = creditors[0];
    const amount = roundCurrency(Math.min(Math.abs(debtor.balance), creditor.balance));

    if (amount <= 0) {
      break;
    }

    settlements.push({
      from: debtor.name,
      fromPlayerId: debtor.id,
      to: creditor.name,
      toPlayerId: creditor.id,
      amount
    });

    debtor.balance = roundCurrency(debtor.balance + amount);
    creditor.balance = roundCurrency(creditor.balance - amount);

    if (isNearlyZero(debtor.balance)) {
      debtors.shift();
    }

    if (isNearlyZero(creditor.balance)) {
      creditors.shift();
    }
  }

  return settlements;
}
