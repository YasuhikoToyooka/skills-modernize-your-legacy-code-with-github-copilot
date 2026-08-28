'use strict';

/**
 * Unit tests mirroring the scenarios documented in docs/TESTPLAN.md
 * (COBOL Student Account System Test Plan) for the Node.js port.
 */

const { formatBalance, DataProgram, Operations, handleMenuChoice } = require('../index');

// Minimal fake of readline.Interface: answers are consumed in FIFO order.
function fakeReadline(answers = []) {
  const queue = [...answers];
  return {
    question(prompt, callback) {
      callback(queue.length ? String(queue.shift()) : '');
    },
  };
}

describe('COBOL Student Account System - Node.js port', () => {
  let logSpy;

  beforeEach(() => {
    DataProgram.reset();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function lastLog() {
    return logSpy.mock.calls[logSpy.mock.calls.length - 1][0];
  }

  // TC-001: アプリ起動時の初期残高を確認する
  test('TC-001: initial balance is 001000.00', async () => {
    await Operations.call('TOTAL', fakeReadline());
    expect(lastLog()).toBe('Current balance: 001000.00');
  });

  // TC-002: 残高表示を繰り返す
  test('TC-002: repeated balance view does not change the balance', async () => {
    await Operations.call('TOTAL', fakeReadline());
    expect(lastLog()).toBe('Current balance: 001000.00');
    await Operations.call('TOTAL', fakeReadline());
    expect(lastLog()).toBe('Current balance: 001000.00');
  });

  // TC-003: 正の金額を入金する
  test('TC-003: crediting a positive amount increases the balance', async () => {
    await Operations.call('CREDIT', fakeReadline(['50.00']));
    expect(lastLog()).toBe('Amount credited. New balance: 001050.00');
  });

  // TC-004: 小数を含む金額を入金する
  test('TC-004: crediting an amount with cents is reflected on balance view', async () => {
    await Operations.call('CREDIT', fakeReadline(['12.34']));
    expect(lastLog()).toBe('Amount credited. New balance: 001012.34');
    await Operations.call('TOTAL', fakeReadline());
    expect(lastLog()).toBe('Current balance: 001012.34');
  });

  // TC-005: 複数回の入金結果が保持される
  test('TC-005: multiple credits accumulate correctly', async () => {
    await Operations.call('CREDIT', fakeReadline(['50.00']));
    await Operations.call('CREDIT', fakeReadline(['25.25']));
    await Operations.call('TOTAL', fakeReadline());
    expect(lastLog()).toBe('Current balance: 001075.25');
  });

  // TC-006: 残高以内の出金を実行する
  test('TC-006: debiting within balance decreases the balance', async () => {
    await Operations.call('DEBIT', fakeReadline(['125.50']));
    expect(lastLog()).toBe('Amount debited. New balance: 000874.50');
  });

  // TC-007: 残高と同額を出金する
  test('TC-007: debiting the exact balance succeeds and balance reaches zero', async () => {
    await Operations.call('DEBIT', fakeReadline(['1000.00']));
    expect(lastLog()).toBe('Amount debited. New balance: 000000.00');
    await Operations.call('TOTAL', fakeReadline());
    expect(lastLog()).toBe('Current balance: 000000.00');
  });

  // TC-008: 残高を超える出金を拒否する
  test('TC-008: debiting more than the balance is rejected and balance is unchanged', async () => {
    await Operations.call('DEBIT', fakeReadline(['1000.01']));
    expect(lastLog()).toBe('Insufficient funds for this debit.');
    await Operations.call('TOTAL', fakeReadline());
    expect(lastLog()).toBe('Current balance: 001000.00');
  });

  // TC-009: 不足出金後に有効な操作を続行する
  test('TC-009: a rejected debit does not block subsequent successful operations', async () => {
    await Operations.call('DEBIT', fakeReadline(['2000.00']));
    expect(lastLog()).toBe('Insufficient funds for this debit.');
    await Operations.call('CREDIT', fakeReadline(['10.00']));
    expect(lastLog()).toBe('Amount credited. New balance: 001010.00');
  });

  // TC-010: 無効なメニュー選択を処理する
  test('TC-010: an invalid menu choice shows an error and leaves the balance unchanged', async () => {
    const continueFlag = await handleMenuChoice('5', fakeReadline());
    expect(lastLog()).toBe('Invalid choice, please select 1-4.');
    expect(continueFlag).toBe('YES');
    await Operations.call('TOTAL', fakeReadline());
    expect(lastLog()).toBe('Current balance: 001000.00');
  });

  // TC-011: 境界の無効なメニュー選択を処理する
  test('TC-011: boundary invalid menu choices (0 and 9) are both rejected', async () => {
    await handleMenuChoice('0', fakeReadline());
    expect(lastLog()).toBe('Invalid choice, please select 1-4.');
    await handleMenuChoice('9', fakeReadline());
    expect(lastLog()).toBe('Invalid choice, please select 1-4.');
    await Operations.call('TOTAL', fakeReadline());
    expect(lastLog()).toBe('Current balance: 001000.00');
  });

  // TC-012: 終了操作を処理する
  test('TC-012: choosing exit returns the NO continue-flag', async () => {
    const continueFlag = await handleMenuChoice('4', fakeReadline());
    expect(continueFlag).toBe('NO');
  });

  // TC-013: 終了前の残高がセッション内で保持される
  test('TC-013: balance changes persist within the same session', async () => {
    await handleMenuChoice('2', fakeReadline(['50.00']));
    await handleMenuChoice('3', fakeReadline(['20.00']));
    await handleMenuChoice('1', fakeReadline());
    expect(lastLog()).toBe('Current balance: 001030.00');
  });

  // TC-014: アプリ再起動時に残高が初期化される
  test('TC-014: balance resets to the initial value on a fresh "restart"', async () => {
    await Operations.call('CREDIT', fakeReadline(['50.00']));
    await Operations.call('DEBIT', fakeReadline(['20.00']));

    // Simulate an application restart: reload the module to get a fresh
    // in-memory STORAGE-BALANCE, just like relaunching the COBOL program.
    jest.resetModules();
    const restarted = require('../index');
    await restarted.Operations.call('TOTAL', fakeReadline());
    expect(lastLog()).toBe('Current balance: 001000.00');
  });

  // TC-015: ゼロ金額の入金・出金を確認する
  test('TC-015: zero-amount credit and debit are accepted and leave the balance unchanged', async () => {
    await Operations.call('CREDIT', fakeReadline(['0.00']));
    expect(lastLog()).toBe('Amount credited. New balance: 001000.00');
    await Operations.call('DEBIT', fakeReadline(['0.00']));
    expect(lastLog()).toBe('Amount debited. New balance: 001000.00');
  });

  // TC-016: 最大桁を超える入金額を確認する
  test('TC-016: crediting up to the maximum representable amount is recorded as-is', async () => {
    await Operations.call('CREDIT', fakeReadline(['999999.99']));
    expect(lastLog()).toBe('Amount credited. New balance: 1000999.99');
  });

  // TC-017: 負数・不正な金額入力を確認する
  test('TC-017: current implementation applies negative amounts without validation', async () => {
    await Operations.call('CREDIT', fakeReadline(['-10.00']));
    expect(lastLog()).toBe('Amount credited. New balance: 000990.00');
  });

  test('TC-017b: non-numeric amount input is treated as zero (documented current behavior)', async () => {
    await Operations.call('CREDIT', fakeReadline(['abc']));
    expect(lastLog()).toBe('Amount credited. New balance: 001000.00');
  });

  // TC-018: DataProgram の READ/WRITE を確認する（単体）
  test('TC-018: DataProgram READ/WRITE contract', () => {
    expect(DataProgram.call('READ')).toBe(1000.0);
    DataProgram.call('WRITE', 1234.56);
    expect(DataProgram.call('READ')).toBe(1234.56);
  });

  // TC-019: DataProgram に未知の操作コードを渡す（単体）
  test('TC-019: DataProgram ignores unknown operation codes', () => {
    expect(DataProgram.call('READ')).toBe(1000.0);
    DataProgram.call('OTHER', 9999.99);
    expect(DataProgram.call('READ')).toBe(1000.0);
  });
});

describe('formatBalance helper', () => {
  test('zero-pads the integer portion to 6 digits and keeps 2 decimal places', () => {
    expect(formatBalance(1000)).toBe('001000.00');
    expect(formatBalance(0)).toBe('000000.00');
    expect(formatBalance(1012.34)).toBe('001012.34');
  });
});
