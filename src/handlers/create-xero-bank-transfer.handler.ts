import { xeroClient } from "../clients/xero-client.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { BankTransfer } from "xero-node";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";

async function createBankTransfer(
  fromBankAccountId: string,
  toBankAccountId: string,
  amount: number,
  date?: string,
  reference?: string,
  fromIsReconciled?: boolean,
  toIsReconciled?: boolean,
  tenantId?: string
): Promise<BankTransfer | undefined> {
  await xeroClient.authenticate();
  const resolvedTenantId = xeroClient.resolveTenantId(tenantId);

  const bankTransfer: BankTransfer = {
    fromBankAccount: {
      accountID: fromBankAccountId
    },
    toBankAccount: {
      accountID: toBankAccountId
    },
    amount: amount,
    ...(date !== undefined ? { date } : {}),
    ...(reference !== undefined ? { reference } : {}),
    ...(fromIsReconciled !== undefined ? { fromIsReconciled } : {}),
    ...(toIsReconciled !== undefined ? { toIsReconciled } : {})
  };

  const response = await xeroClient.accountingApi.createBankTransfer(
    resolvedTenantId, // xeroTenantId
    {
      bankTransfers: [bankTransfer]
    }, // bankTransfers
    undefined, // idempotencyKey
    getClientHeaders()
  );

  return response.body.bankTransfers?.[0];
}

export async function createXeroBankTransfer(
  fromBankAccountId: string,
  toBankAccountId: string,
  amount: number,
  date?: string,
  reference?: string,
  fromIsReconciled?: boolean,
  toIsReconciled?: boolean,
  tenantId?: string
): Promise<XeroClientResponse<BankTransfer>> {
  try {
    const createdBankTransfer = await createBankTransfer(
      fromBankAccountId,
      toBankAccountId,
      amount,
      date,
      reference,
      fromIsReconciled,
      toIsReconciled,
      tenantId
    );

    if (!createdBankTransfer) {
      throw new Error("Bank transfer creation failed.");
    }

    return {
      result: createdBankTransfer,
      isError: false,
      error: null
    };
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error)
    };
  }
}
