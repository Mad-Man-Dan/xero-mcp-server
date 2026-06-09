import { xeroClient } from "../clients/xero-client.js";
import { BankTransaction } from "xero-node";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

async function getBankTransactions(
  page: number,
  bankAccountId?: string,
  unreconciledOnly?: boolean,
  tenantId?: string,
): Promise<BankTransaction[]> {
  await xeroClient.authenticate();
  const resolvedTenantId = xeroClient.resolveTenantId(tenantId);

  const whereClauses = [
    bankAccountId ? `BankAccount.AccountID=guid("${bankAccountId}")` : null,
    unreconciledOnly ? "IsReconciled==false" : null,
  ].filter(Boolean);
  const where = whereClauses.length > 0 ? whereClauses.join(" AND ") : undefined;

  const response = await xeroClient.accountingApi.getBankTransactions(resolvedTenantId,
      undefined, // ifModifiedSince
      where, // where
      "Date DESC", // order
      page, // page
      undefined, // unitdp
      10, // pagesize
      getClientHeaders()
  );

  return response.body.bankTransactions ?? [];
}

export async function listXeroBankTransactions(
  page: number = 1,
  bankAccountId?: string,
  unreconciledOnly?: boolean,
  tenantId?: string,
): Promise<XeroClientResponse<BankTransaction[]>> {
  try {
    const bankTransactions = await getBankTransactions(page, bankAccountId, unreconciledOnly, tenantId);

    return {
      result: bankTransactions,
      isError: false,
      error: null
    }
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error)
    }
  }
}