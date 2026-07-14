import { z } from "zod";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { createXeroBankTransfer } from "../../handlers/create-xero-bank-transfer.handler.js";
import { bankTransferDeepLink } from "../../consts/deeplinks.js";
import { formatXeroDate } from "../../helpers/format-date.js";

const CreateBankTransferTool = CreateXeroTool(
  "create-bank-transfer",
  `Create a bank transfer between two bank accounts in Xero.
  Moves money from one bank account to another. Both accounts must be of type BANK
  and in the same currency (cross-currency transfers are not supported).
  The reconciled flags (fromIsReconciled / toIsReconciled) mark each side of the
  transfer as reconciled. These are only honoured when there is no matching bank
  statement line (e.g. agent-created transfers); otherwise they default to unreconciled.
  When a bank transfer is created, a deep link to view it in Xero is returned and
  should be displayed to the user.`,
  {
    fromBankAccountId: z.string().describe("AccountID of the source bank account"),
    toBankAccountId: z.string().describe("AccountID of the destination bank account"),
    amount: z.number().describe("Amount to transfer, in the currency of the source account"),
    date: z.string()
      .optional()
      .describe("Date of the transfer (YYYY-MM-DD). Defaults to today's date"),
    reference: z.string().optional(),
    fromIsReconciled: z.boolean()
      .optional()
      .describe("Mark the source side of the transfer as reconciled. Defaults to unreconciled."),
    toIsReconciled: z.boolean()
      .optional()
      .describe("Mark the destination side of the transfer as reconciled. Defaults to unreconciled.")
  },
  async ({ fromBankAccountId, toBankAccountId, amount, date, reference, fromIsReconciled, toIsReconciled, tenantId }) => {
    const result = await createXeroBankTransfer(
      fromBankAccountId,
      toBankAccountId,
      amount,
      date,
      reference,
      fromIsReconciled,
      toIsReconciled,
      tenantId
    );

    if (result.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error creating bank transfer: ${result.error}`
          }
        ]
      };
    }

    const bankTransfer = result.result;

    const deepLink = bankTransfer.fromBankAccount?.accountID && bankTransfer.fromBankTransactionID
      ? bankTransferDeepLink(bankTransfer.fromBankAccount.accountID, bankTransfer.fromBankTransactionID)
      : null;

    return {
      content: [
        {
          type: "text" as const,
          text: [
            "Bank transfer created successfully:",
            `ID: ${bankTransfer?.bankTransferID}`,
            `Date: ${formatXeroDate(bankTransfer?.date)}`,
            `From: ${bankTransfer?.fromBankAccount?.name ?? bankTransfer?.fromBankAccount?.accountID}`,
            `To: ${bankTransfer?.toBankAccount?.name ?? bankTransfer?.toBankAccount?.accountID}`,
            `Amount: ${bankTransfer?.amount}`,
            `From Reconciled: ${bankTransfer?.fromIsReconciled ? "Yes" : "No"}`,
            `To Reconciled: ${bankTransfer?.toIsReconciled ? "Yes" : "No"}`,
            deepLink ? `Link to view: ${deepLink}` : null
          ].filter(Boolean).join("\n"),
        },
      ],
    };
  }
);

export default CreateBankTransferTool;
