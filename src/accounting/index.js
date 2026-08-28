#!/usr/bin/env node
'use strict';

/**
 * Account Management System
 *
 * Node.js port of the legacy COBOL programs (main.cob, operations.cob, data.cob).
 * Preserves the original menu, business logic and data flow:
 *
 *   MainProgram --operation code--> Operations --READ/WRITE--> DataProgram --> account balance
 *
 * The balance is kept only in memory for the lifetime of the process, exactly like the
 * COBOL STORAGE-BALANCE working-storage item: it resets to the initial value on restart.
 */

const readline = require('readline');

// ---------------------------------------------------------------------------
// DataProgram equivalent: owns the account balance and the READ/WRITE contract.
// ---------------------------------------------------------------------------
const DataProgram = (() => {
  const INITIAL_BALANCE = 1000.0; // STORAGE-BALANCE PIC 9(6)V99 VALUE 1000.00
  let storageBalance = INITIAL_BALANCE;

  return {
    // PASSED-OPERATION 'READ'  -> returns current balance
    // PASSED-OPERATION 'WRITE' -> persists the given balance
    // any other operation code -> no-op, returns current balance unchanged
    call(operation, balance) {
      if (operation === 'READ') {
        return storageBalance;
      }
      if (operation === 'WRITE') {
        storageBalance = balance;
        return storageBalance;
      }
      return storageBalance;
    },
    // Test-only helper: simulates a fresh process restart (STORAGE-BALANCE is working-storage).
    reset() {
      storageBalance = INITIAL_BALANCE;
    },
  };
})();

// ---------------------------------------------------------------------------
// Operations equivalent: business logic for TOTAL / CREDIT / DEBIT.
// ---------------------------------------------------------------------------
const Operations = {
  async call(operationType, rl) {
    let finalBalance;

    if (operationType === 'TOTAL') {
      finalBalance = DataProgram.call('READ');
      console.log(`Current balance: ${formatBalance(finalBalance)}`);
    } else if (operationType === 'CREDIT') {
      const amount = await promptAmount(rl, 'Enter credit amount: ');
      finalBalance = DataProgram.call('READ');
      finalBalance += amount;
      DataProgram.call('WRITE', finalBalance);
      console.log(`Amount credited. New balance: ${formatBalance(finalBalance)}`);
    } else if (operationType === 'DEBIT') {
      const amount = await promptAmount(rl, 'Enter debit amount: ');
      finalBalance = DataProgram.call('READ');
      if (finalBalance >= amount) {
        finalBalance -= amount;
        DataProgram.call('WRITE', finalBalance);
        console.log(`Amount debited. New balance: ${formatBalance(finalBalance)}`);
      } else {
        console.log('Insufficient funds for this debit.');
      }
    }
  },
};

// Mimics PIC 9(6)V99 zero-padded display, e.g. 1000 -> 001000.00
function formatBalance(value) {
  const fixed = value.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  return `${intPart.padStart(6, '0')}.${decPart}`;
}

function question(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function promptAmount(rl, prompt) {
  const answer = await question(rl, prompt);
  const amount = parseFloat(answer);
  return Number.isNaN(amount) ? 0 : amount;
}

// ---------------------------------------------------------------------------
// MainProgram equivalent: menu loop.
// ---------------------------------------------------------------------------

// Handles a single USER-CHOICE / EVALUATE cycle. Returns the resulting CONTINUE-FLAG.
async function handleMenuChoice(choice, rl) {
  switch (choice) {
    case '1':
      await Operations.call('TOTAL', rl);
      return 'YES';
    case '2':
      await Operations.call('CREDIT', rl);
      return 'YES';
    case '3':
      await Operations.call('DEBIT', rl);
      return 'YES';
    case '4':
      return 'NO';
    default:
      console.log('Invalid choice, please select 1-4.');
      return 'YES';
  }
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let continueFlag = 'YES';

  try {
    while (continueFlag !== 'NO') {
      console.log('--------------------------------');
      console.log('Account Management System');
      console.log('1. View Balance');
      console.log('2. Credit Account');
      console.log('3. Debit Account');
      console.log('4. Exit');
      console.log('--------------------------------');
      const choice = (await question(rl, 'Enter your choice (1-4): ')).trim();
      continueFlag = await handleMenuChoice(choice, rl);
    }
    console.log('Exiting the program. Goodbye!');
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = { formatBalance, DataProgram, Operations, handleMenuChoice };
