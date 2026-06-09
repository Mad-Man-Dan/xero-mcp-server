import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { listXeroBankTransfers } from "../../handlers/list-xero-bank-transfers.handler.js";
import { bankTransferDeepLink } from "../../consts/deeplinks.js";

const ListBankTransfersTool = CreateXeroTool(
  "list-bank-transfers",
  `List all bank transfers in Xero.
  Returns transfers between bank accounts, including the reconciled status of each
  side (source and destination). Bank transfers cannot be paged or updated via the
  Xero API.`,
  {},
  async ({ tenantId }) => {
    const response = await listXeroBankTransfers(tenantId);
    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing bank transfers: ${response.error}`
          }
        ]
      };
    }

    const bankTransfers = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${bankTransfers?.length || 0} bank transfers:`
        },
        ...(bankTransfers?.map((transfer) => {
          const deepLink = transfer.fromBankAccount?.accountID && transfer.fromBankTransactionID
            ? bankTransferDeepLink(transfer.fromBankAccount.accountID, transfer.fromBankTransactionID)
            : null;

          return {
            type: "text" as const,
            text: [
              `Bank Transfer ID: ${transfer.bankTransferID}`,
              `From: ${transfer.fromBankAccount?.name ?? transfer.fromBankAccount?.accountID}`,
              `To: ${transfer.toBankAccount?.name ?? transfer.toBankAccount?.accountID}`,
              `Amount: ${transfer.amount}`,
              transfer.date ? `Date: ${transfer.date}` : null,
              transfer.reference ? `Reference: ${transfer.reference}` : null,
              `From Reconciled: ${transfer.fromIsReconciled ? "Yes" : "No"}`,
              `To Reconciled: ${transfer.toIsReconciled ? "Yes" : "No"}`,
              deepLink ? `Link to view: ${deepLink}` : null,
            ].filter(Boolean).join("\n")
          };
        }) || [])
      ]
    };
  }
);

export default ListBankTransfersTool;
