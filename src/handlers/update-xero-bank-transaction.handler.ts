import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { BankTransaction } from "xero-node";

interface BankTransactionLineItem {
  description: string;
  quantity: number;
  unitAmount: number;
  accountCode: string;
  taxType: string;
}

type BankTransactionType = "RECEIVE" | "SPEND";

async function getBankTransaction(bankTransactionId: string, tenantId?: string): Promise<BankTransaction | undefined> {
  await xeroClient.authenticate();
  const resolvedTenantId = xeroClient.resolveTenantId(tenantId);

  const response = await xeroClient.accountingApi.getBankTransaction(
    resolvedTenantId, // xeroTenantId
    bankTransactionId, // bankTransactionID
    undefined, // unitdp
    getClientHeaders() // options
  );

  return response.body.bankTransactions?.[0];
}

async function updateBankTransaction(
  bankTransactionId: string,
  existingBankTransaction: BankTransaction,
  type?: BankTransactionType,
  contactId?: string,
  lineItems?: BankTransactionLineItem[],
  reference?: string,
  date?: string,
  isReconciled?: boolean,
  tenantId?: string
): Promise<BankTransaction | undefined> {
  await xeroClient.authenticate();
  const resolvedTenantId = xeroClient.resolveTenantId(tenantId);

  // Start from the existing transaction so unspecified fields (LineAmountTypes,
  // currency, bank account, and — when no new line items are supplied — the
  // existing line items with their LineItemIDs) are preserved. This makes
  // metadata-only edits (e.g. just flipping isReconciled) safe.
  const bankTransaction: BankTransaction = {
    ...existingBankTransaction,
    bankTransactionID: bankTransactionId,
    type: type ? BankTransaction.TypeEnum[type] : existingBankTransaction.type,
    contact: contactId ? { contactID: contactId } : existingBankTransaction.contact,
    lineItems: lineItems ? lineItems : existingBankTransaction.lineItems,
    reference: reference ? reference : existingBankTransaction.reference,
    date: date ? date : existingBankTransaction.date,
    isReconciled: isReconciled ?? existingBankTransaction.isReconciled
  };

  // Remove server-calculated / read-only fields. If stale document totals are
  // sent back, Xero rejects with "document total does not equal the total of
  // the lines" (ErrorNumber 10). Dropping them lets Xero recompute from the
  // line items. We deliberately do NOT touch LineAmountTypes (forcing it would
  // change tax interpretation and cause the same mismatch).
  delete bankTransaction.subTotal;
  delete bankTransaction.totalTax;
  delete bankTransaction.total;
  delete bankTransaction.updatedDateUTC;
  delete bankTransaction.statusAttributeString;
  delete bankTransaction.validationErrors;

  const response = await xeroClient.accountingApi.updateBankTransaction(
    resolvedTenantId, // xeroTenantId
    bankTransactionId, // bankTransactionID
    { bankTransactions: [bankTransaction] }, // bankTransactions
    undefined, // unitdp
    undefined, // idempotencyKey
    getClientHeaders() // options
  );

  return response.body.bankTransactions?.[0];
}

export async function updateXeroBankTransaction(
  bankTransactionId: string,
  type?: BankTransactionType,
  contactId?: string,
  lineItems?: BankTransactionLineItem[],
  reference?: string,
  date?: string,
  isReconciled?: boolean,
  tenantId?: string
): Promise<XeroClientResponse<BankTransaction>> {
  try {
    const existingBankTransaction = await getBankTransaction(bankTransactionId, tenantId);

    if (!existingBankTransaction) {
      throw new Error(`Could not find bank transaction`);
    }

    const updatedBankTransaction = await updateBankTransaction(
      bankTransactionId,
      existingBankTransaction,
      type,
      contactId,
      lineItems,
      reference,
      date,
      isReconciled,
      tenantId
    );

    if (!updatedBankTransaction) {
      throw new Error(`Failed to update bank transaction`);
    }

    return {
      result: updatedBankTransaction,
      isError: false,
      error: null
    };
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error),
    };
  }
}