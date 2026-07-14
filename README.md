# Xero MCP Server (Multi-Tenant Fork)

This is a fork of [XeroAPI/xero-mcp-server](https://github.com/XeroAPI/xero-mcp-server) with **multi-tenant support**. It adds the ability to manage multiple Xero organisations from a single MCP server instance — essential for accountants, bookkeepers, and partners managing multiple client organisations through Xero.

## What's New in This Fork

- **Multi-tenant support** — list, switch, and target specific Xero organisations at runtime
- **Authorization Code flow with PKCE** — connect to multiple orgs via OAuth2 (Custom Connections are limited to a single org)
- **Persistent token storage** — OAuth tokens are cached locally and refresh automatically, so you only authorize in the browser once
- **Standalone login script** — run `npm run login` to authorize (or add more) organisations without starting the MCP server
- **Per-call tenant override** — every tool accepts an optional `tenantId` parameter to target a specific org without switching globally
- **Granular OAuth scopes** — migrated from deprecated umbrella scopes (`accounting.transactions`, `accounting.reports.read`) to Xero's new granular scopes; override the full scope set via the `XERO_SCOPES` env var
- **General ledger Journals endpoint** — `list-journals` exposes Xero's read-only Journals API, returning every journal posted to the GL (invoices, payments, bank transactions, payroll, manual journals, etc.) with offset-based pagination and a cash-basis option
- **Accounts (Chart of Accounts) CRUD** — get, create, update, and delete accounts
- **Bank transfers** — create and list transfers between bank accounts
- **Bank transaction management** — delete (void) spend/receive money transactions; safer partial updates that preserve existing line items on metadata-only edits (e.g. flipping `isReconciled`)
- **Generic attachment tools** — list, download, and upload attachments across all entity types (invoices, contacts, manual journals, etc.)
- **Invoice status control** — create invoices as DRAFT, SUBMITTED, or AUTHORISED; update invoices to transition status (approve, void, delete); custom due dates on create
- **New tools:** `list-xero-tenants`, `switch-xero-tenant`, `list-journals`, `get-account`, `create-account`, `update-account`, `delete-account`, `create-bank-transfer`, `list-bank-transfers`, `delete-bank-transaction`, `list-attachments`, `get-attachment`, `upload-attachment`

## Prerequisites

- Node.js (v18 or higher)
- npm or pnpm
- A Xero developer account with API credentials

## Docs and Links

- [Xero Public API Documentation](https://developer.xero.com/documentation/api/)
- [Xero API Explorer](https://api-explorer.xero.com/)
- [Xero OpenAPI Specs](https://github.com/XeroAPI/Xero-OpenAPI)
- [Xero-Node Public API SDK Docs](https://xeroapi.github.io/xero-node/accounting)
- [Developer Documentation](https://developer.xero.com/)

## Setup

### Create a Xero Account

If you don't already have a Xero account, you can create one by signing up [here](https://www.xero.com/au/signup/) using the free trial.

We recommend using a Demo Company to start with because it comes with pre-loaded sample data. Once logged in, switch to it via the top left-hand dropdown and selecting "Demo Company".

NOTE: To use Payroll-specific queries, the region should be either NZ or UK.

### Authentication

There are 3 modes of authentication supported:

#### 1. Authorization Code with PKCE (Recommended for Multi-Tenant)

This is the recommended mode if you manage **multiple Xero organisations** (e.g., as a partner, accountant, or bookkeeper). It uses OAuth2 Authorization Code flow with PKCE, connects to all orgs you authorize, and persists tokens locally so you only need to authorize in the browser once.

##### Xero App Setup

1. Go to [Xero Developer](https://developer.xero.com/app/manage) and create a **Web App** (not a Custom Connection)
2. Add `http://localhost:3000/callback` as a **Redirect URI**
3. Note your **Client ID** and **Client Secret**
4. Select the scopes your app needs (see [Required Scopes](#required-scopes) below)

##### Claude Code Configuration

```bash
claude mcp add --scope user xero \
  -e XERO_CLIENT_ID=your_client_id \
  -e XERO_CLIENT_SECRET=your_client_secret \
  -e XERO_AUTH_MODE=auth_code \
  -- node /path/to/xero-mcp-server/dist/index.js
```

##### Claude Desktop Configuration

```json
{
  "mcpServers": {
    "xero": {
      "command": "node",
      "args": ["/path/to/xero-mcp-server/dist/index.js"],
      "env": {
        "XERO_CLIENT_ID": "your_client_id",
        "XERO_CLIENT_SECRET": "your_client_secret",
        "XERO_AUTH_MODE": "auth_code"
      }
    }
  }
}
```

##### How It Works

1. On first use, a browser window opens to Xero's authorization page
2. You log in and select which organisations to connect
3. Tokens are saved to `~/.xero-mcp/tokens.json` and refresh automatically
4. Subsequent sessions reuse the cached tokens with no browser interaction
5. If the refresh token expires (60+ days of inactivity), the browser opens again for re-authorization

##### Connecting Multiple Client Organisations

To connect several organisations back-to-back — including orgs under different Xero logins — use the standalone login script instead of waiting for the server's first-use prompt:

```bash
npm run login
```

Each pass opens the browser for one authorization: sign in with whichever Xero login has access to that client and connect the org. When the authorization completes, the script asks whether to authorize another account and repeats until you answer no. Connections accumulate on your Xero app across passes, so each authorization adds to the set of connected orgs rather than replacing it.

The script saves tokens to the same store the MCP server uses, so no server restart or reconfiguration is needed. Re-run it any time to add more organisations later, and verify what's connected with `list-xero-tenants`.

##### Optional Environment Variables

| Variable | Default | Description |
|---|---|---|
| `XERO_CALLBACK_PORT` | `3000` | Port for the OAuth callback server |
| `XERO_TOKEN_STORE_PATH` | `~/.xero-mcp/tokens.json` | Override the token storage location |
| `XERO_SCOPES` | See [Required Scopes](#required-scopes) | Space-separated list overriding the default OAuth scopes requested |

#### 2. Custom Connections (Single Org Only)

Custom Connections use the `client_credentials` grant and are limited to **one organisation per app**. This is simpler to set up but does not support multi-tenant workflows.

Set up a Custom Connection following [these instructions](https://developer.xero.com/documentation/guides/oauth2/custom-connections/).

```json
{
  "mcpServers": {
    "xero": {
      "command": "npx",
      "args": ["-y", "@xeroapi/xero-mcp-server@latest"],
      "env": {
        "XERO_CLIENT_ID": "your_client_id_here",
        "XERO_CLIENT_SECRET": "your_client_secret_here"
      }
    }
  }
}
```

#### 3. Bearer Token

Use this if your MCP client handles OAuth externally and provides a pre-obtained bearer token.

```json
{
  "mcpServers": {
    "xero": {
      "command": "npx",
      "args": ["-y", "@xeroapi/xero-mcp-server@latest"],
      "env": {
        "XERO_CLIENT_BEARER_TOKEN": "your_bearer_token"
      }
    }
  }
}
```

NOTE: `XERO_CLIENT_BEARER_TOKEN` takes precedence over other auth modes if set.

### Required Scopes

This fork uses the **new granular scopes** (not the deprecated `accounting.transactions` / `accounting.reports.read` umbrella scopes). When configuring your Xero app, request the following:

```
openid profile email offline_access

# Accounting - Transactions (granular)
accounting.invoices
accounting.invoices.read
accounting.payments
accounting.payments.read
accounting.banktransactions
accounting.banktransactions.read
accounting.manualjournals
accounting.manualjournals.read
accounting.journals.read

# Accounting - Other
accounting.contacts
accounting.settings

# Accounting - Reports (granular)
accounting.reports.aged.read
accounting.reports.balancesheet.read
accounting.reports.profitandloss.read
accounting.reports.trialbalance.read

# Payroll
payroll.settings
payroll.employees
payroll.timesheets
```

> See the [Xero OAuth 2.0 Scopes documentation](https://developer.xero.com/documentation/guides/oauth2/scopes/) for the full list and deprecation timeline.

> NOTE: `accounting.journals.read` (used by `list-journals`) is a restricted scope — Xero may require you to request access to the Journals endpoint for your app. If your app doesn't have it, set `XERO_SCOPES` to a scope list without it, or authorization will fail.

## Multi-Tenant Usage

### Listing Connected Organisations

Use `list-xero-tenants` to see all connected organisations:

```
> List my Xero tenants

Found 3 connected tenant(s):
(active) Acme Corp
  Tenant ID: abc123...
  Type: ORGANISATION
Widget Co
  Tenant ID: def456...
  Type: ORGANISATION
```

### Switching Active Tenant

Use `switch-xero-tenant` to change which org subsequent commands target:

```
> Switch to Widget Co (def456...)
Successfully switched to tenant: Widget Co
```

### Per-Call Tenant Override

Every tool accepts an optional `tenantId` parameter. This lets you query a specific org without changing the active tenant:

```
> List invoices for tenant def456...
```

## Available MCP Tools

### Tenant Management
- `list-xero-tenants`: List all connected Xero organisations
- `switch-xero-tenant`: Switch the active organisation

### Accounts (Chart of Accounts)
- `list-accounts`: Retrieve chart of accounts
- `get-account`: Retrieve a single account by ID
- `create-account`: Create a new account (code, name, type, tax type, etc.)
- `update-account`: Update an account or archive it
- `delete-account`: Delete an account (only if no transactions exist)

### Attachments (Generic — works across all entity types)
- `list-attachments`: List attachments on any entity (invoice, contact, manual journal, etc.)
- `get-attachment`: Download an attachment as base64 content
- `upload-attachment`: Upload a file to any entity (from base64 or local file path)

### Read Operations
- `list-contacts`: Retrieve contacts (customers and suppliers)
- `list-contact-groups`: Retrieve contact groups
- `list-credit-notes`: Retrieve credit notes
- `list-invoices`: Retrieve invoices
- `list-items`: Retrieve items
- `list-manual-journals`: Retrieve manual journals
- `list-organisation-details`: Retrieve organisation details
- `list-payments`: Retrieve payments
- `list-quotes`: Retrieve quotes
- `list-tax-rates`: Retrieve tax rates
- `list-bank-transactions`: Retrieve bank transactions
- `list-bank-transfers`: Retrieve bank transfers
- `list-journals`: Retrieve general ledger journals (every journal Xero posts to the GL — from invoices, payments, bank transactions, payroll, etc.), with offset-based pagination and an optional cash-basis mode
- `list-tracking-categories`: Retrieve tracking categories
- `list-profit-and-loss`: Retrieve profit and loss report
- `list-report-balance-sheet`: Retrieve balance sheet report
- `list-trial-balance`: Retrieve trial balance report
- `list-aged-receivables-by-contact`: Retrieve aged receivables for a contact
- `list-aged-payables-by-contact`: Retrieve aged payables for a contact

### Payroll Operations
- `list-payroll-employees`: Retrieve payroll employees
- `list-payroll-employee-leave`: Retrieve employee leave records
- `list-payroll-employee-leave-balances`: Retrieve employee leave balances
- `list-payroll-employee-leave-types`: Retrieve employee leave types
- `list-payroll-leave-periods`: Retrieve employee leave periods
- `list-payroll-leave-types`: Retrieve all available leave types
- `list-timesheets`: Retrieve payroll timesheets
- `get-timesheet`: Retrieve a specific timesheet
- `create-timesheet`: Create a new timesheet
- `add-timesheet-line`: Add a line to a timesheet
- `update-timesheet-line`: Update a timesheet line
- `approve-timesheet`: Approve a timesheet
- `revert-timesheet`: Revert an approved timesheet
- `delete-timesheet`: Delete a timesheet

### Create Operations
- `create-bank-transaction`: Create a bank transaction
- `create-bank-transfer`: Create a transfer between two bank accounts
- `create-contact`: Create a contact
- `create-credit-note`: Create a credit note
- `create-invoice`: Create an invoice
- `create-item`: Create an item
- `create-manual-journal`: Create a manual journal
- `create-payment`: Create a payment
- `create-quote`: Create a quote
- `create-tracking-category`: Create a tracking category
- `create-tracking-options`: Create tracking options

### Update Operations
- `update-bank-transaction`: Update a bank transaction (partial update — omitted fields and line items are preserved)
- `update-contact`: Update a contact
- `update-credit-note`: Update a draft credit note
- `update-invoice`: Update a draft invoice
- `update-item`: Update an item
- `update-manual-journal`: Update a manual journal
- `update-quote`: Update a draft quote
- `update-tracking-category`: Update a tracking category
- `update-tracking-options`: Update tracking options

### Delete Operations
- `delete-bank-transaction`: Delete (void) a spend or receive money bank transaction

For detailed API documentation, refer to the [MCP Protocol Specification](https://modelcontextprotocol.io/).

## For Developers

### Installation

```bash
npm install
```

### Build

```bash
npm run build
```

### Development with Claude Desktop

Link your local build to Claude Desktop via Settings > Developer > Edit config:

NOTE: On Windows, escape backslashes in the path: `"C:\\projects\\xero-mcp-server\\dist\\index.js"`

```json
{
  "mcpServers": {
    "xero": {
      "command": "node",
      "args": ["/path/to/xero-mcp-server/dist/index.js"],
      "env": {
        "XERO_CLIENT_ID": "your_client_id_here",
        "XERO_CLIENT_SECRET": "your_client_secret_here",
        "XERO_AUTH_MODE": "auth_code"
      }
    }
  }
}
```

## License

MIT

## Security

- Do not commit your `.env` file or any sensitive credentials to version control (it is included in `.gitignore` as a safe default)
- OAuth tokens are stored locally at `~/.xero-mcp/tokens.json` — this path is also gitignored
- Tokens contain sensitive access credentials; do not share or commit them
- NOTE: This adds ability to perform actions across ALL of your connected Xero orgs. Be sure when in use that connected mcp actions are done in accordance to how you want. Be mindful if you're doing actions with a LLM that the *correct* tenant/client is being worked on.


## Upstream

This fork is based on [XeroAPI/xero-mcp-server](https://github.com/XeroAPI/xero-mcp-server). See the upstream repo for the original single-tenant implementation.

Shout out to AutomationTown 
  -Dan