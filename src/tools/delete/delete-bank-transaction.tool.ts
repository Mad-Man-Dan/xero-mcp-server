import { z } from "zod";
import { deleteXeroBankTransaction } from "../../handlers/delete-xero-bank-transaction.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const DeleteBankTransactionTool = CreateXeroTool(
  "delete-bank-transaction",
  "Delete a spend money or receive money bank transaction in Xero by setting its status to DELETED. \
Use this to remove an agent-created or duplicate bank transaction. \
Note: prepayment and overpayment transactions cannot be deleted this way.",
  {
    bankTransactionId: z
      .string()
      .describe("The unique Xero identifier for the bank transaction to delete."),
  },
  async ({ bankTransactionId, tenantId }) => {
    const response = await deleteXeroBankTransaction(bankTransactionId, tenantId);

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error deleting bank transaction: ${response.error}`,
          },
        ],
      };
    }

    const bankTransaction = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: `Bank transaction deleted successfully: ${bankTransaction?.bankTransactionID} (Status: ${bankTransaction?.status})`,
        },
      ],
    };
  },
);

export default DeleteBankTransactionTool;
