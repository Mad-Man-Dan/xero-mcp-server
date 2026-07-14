import { Journal, JournalLine } from "xero-node";
import { listXeroJournals } from "../../handlers/list-xero-journals.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { formatXeroDate } from "../../helpers/format-date.js";
import { z } from "zod";

function formatJournalLine(line: JournalLine): string {
  return [
    `  - ${line.accountCode ?? "?"} ${line.accountName ?? "Unknown account"}` +
      (line.accountType ? ` (${line.accountType})` : ""),
    `    Net: ${line.netAmount}, Gross: ${line.grossAmount}, Tax: ${line.taxAmount}` +
      (line.taxType ? ` (${line.taxType})` : ""),
    line.description ? `    Description: ${line.description}` : null,
    line.trackingCategories?.length
      ? `    Tracking: ${line.trackingCategories
          .map((tc) => `${tc.name}: ${tc.option}`)
          .join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatJournal(journal: Journal): string {
  return [
    `Journal #${journal.journalNumber} (ID: ${journal.journalID})`,
    journal.journalDate
      ? `Date: ${formatXeroDate(journal.journalDate)}`
      : null,
    journal.sourceType
      ? `Source: ${journal.sourceType}${journal.sourceID ? ` (${journal.sourceID})` : ""}`
      : null,
    journal.reference ? `Reference: ${journal.reference}` : null,
    journal.createdDateUTC
      ? `Created: ${formatXeroDate(journal.createdDateUTC)}`
      : null,
    "Lines:",
    journal.journalLines?.map(formatJournalLine).join("\n") ?? "  (none)",
  ]
    .filter(Boolean)
    .join("\n");
}

const ListJournalsTool = CreateXeroTool(
  "list-journals",
  `List general ledger journals from Xero (the read-only Journals endpoint).
This returns every journal Xero posts to the GL — from invoices, payments, bank transactions, manual journals, payroll, etc. — not just manual journals.
Journals are returned oldest to newest, up to 100 per call.
Pagination is offset-based on JournalNumber: to fetch the next batch, call again with offset set to the highest JournalNumber in the previous response. Repeat until an empty response — a partial page (fewer than 100) does NOT necessarily mean the end of the dataset.
Set paymentsOnly to true to retrieve journals on a cash basis (accrual basis is the default).
A single journal can be fetched by journalId or journalNumber; note sourceId/sourceType are not returned on single-journal lookups.`,
  {
    offset: z
      .number()
      .optional()
      .describe(
        "Only journals with a JournalNumber greater than this value are returned. Use the highest JournalNumber already retrieved to fetch the next batch.",
      ),
    paymentsOnly: z
      .boolean()
      .optional()
      .describe(
        "Set to true to retrieve journals on a cash basis. Accrual basis by default.",
      ),
    journalId: z
      .string()
      .optional()
      .describe("Optional JournalID to retrieve a single journal"),
    journalNumber: z
      .number()
      .optional()
      .describe("Optional JournalNumber to retrieve a single journal"),
  },
  async (args) => {
    const response = await listXeroJournals(
      args?.offset,
      args?.paymentsOnly,
      args?.journalId,
      args?.journalNumber,
      args?.tenantId,
    );

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing journals: ${response.error}`,
          },
        ],
      };
    }

    const journals = response.result;
    const highestJournalNumber = journals?.length
      ? Math.max(...journals.map((j) => j.journalNumber ?? 0))
      : undefined;

    return {
      content: [
        {
          type: "text" as const,
          text:
            `Found ${journals?.length || 0} journals.` +
            (highestJournalNumber !== undefined
              ? ` Highest JournalNumber: ${highestJournalNumber} — pass this as offset to fetch the next batch (repeat until an empty response).`
              : ""),
        },
        ...(journals?.map((journal: Journal) => ({
          type: "text" as const,
          text: formatJournal(journal),
        })) || []),
      ],
    };
  },
);

export default ListJournalsTool;
