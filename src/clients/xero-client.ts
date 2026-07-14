import axios from "axios";
import { exec } from "child_process";
import dotenv from "dotenv";
import * as client from "openid-client";
import {
  IXeroClientConfig,
  Organisation,
  TokenSet,
  XeroClient,
} from "xero-node";

import { ensureError } from "../helpers/ensure-error.js";
import { formatError } from "../helpers/format-error.js";
import { TokenStore } from "./token-store.js";
import { OAuthCallbackServer } from "./oauth-callback-server.js";

// Only load .env if env vars aren't already set (e.g., when running locally).
// MCP server configs provide env vars directly, so dotenv is a fallback only.
if (!process.env.XERO_CLIENT_ID && !process.env.XERO_CLIENT_BEARER_TOKEN) {
  dotenv.config();
}

const client_id = process.env.XERO_CLIENT_ID;
const client_secret = process.env.XERO_CLIENT_SECRET;
const bearer_token = process.env.XERO_CLIENT_BEARER_TOKEN;
const auth_mode = process.env.XERO_AUTH_MODE;
const callback_port = parseInt(process.env.XERO_CALLBACK_PORT || "3000", 10);
const grant_type = "client_credentials";

if (!bearer_token && !auth_mode && (!client_id || !client_secret)) {
  throw Error("Environment Variables not set - please check your .env file");
}
if (auth_mode === "auth_code" && (!client_id || !client_secret)) {
  throw Error(
    "XERO_CLIENT_ID and XERO_CLIENT_SECRET are required for auth_code mode",
  );
}

abstract class MCPXeroClient extends XeroClient {
  public tenantId: string;
  private shortCodeCache: Map<string, string> = new Map();

  protected constructor(config?: IXeroClientConfig) {
    super(config);
    this.tenantId = "";
  }

  public abstract authenticate(): Promise<void>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override async updateTenants(fullOrgDetails?: boolean): Promise<any[]> {
    await super.updateTenants(fullOrgDetails);
    if (this.tenants && this.tenants.length > 0) {
      this.tenantId = this.tenants[0].tenantId;
    }
    return this.tenants;
  }

  /**
   * Returns all connected tenants.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public getTenants(): any[] {
    return this.tenants ?? [];
  }

  /**
   * Switches the active tenant. Validates that the tenantId exists in the connected tenants list.
   */
  public switchTenantId(tenantId: string): void {
    const tenant = this.tenants?.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (t: any) => t.tenantId === tenantId,
    );
    if (!tenant) {
      const available = (this.tenants ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((t: any) => `${t.tenantName} (${t.tenantId})`)
        .join(", ");
      throw new Error(
        `Tenant ID "${tenantId}" not found. Available tenants: ${available || "none"}`,
      );
    }
    this.tenantId = tenantId;
  }

  /**
   * Resolves a tenant ID — uses the override if provided and valid, otherwise returns the active tenantId.
   */
  public resolveTenantId(overrideTenantId?: string): string {
    if (overrideTenantId) {
      const tenant = this.tenants?.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (t: any) => t.tenantId === overrideTenantId,
      );
      if (!tenant) {
        throw new Error(
          `Tenant ID "${overrideTenantId}" not found in connected tenants.`,
        );
      }
      return overrideTenantId;
    }
    return this.tenantId;
  }

  private async getOrganisation(tenantId?: string): Promise<Organisation> {
    await this.authenticate();

    const resolvedTenantId = this.resolveTenantId(tenantId);
    const organisationResponse = await this.accountingApi.getOrganisations(
      resolvedTenantId || "",
    );

    const organisation = organisationResponse.body.organisations?.[0];

    if (!organisation) {
      throw new Error("Failed to retrieve organisation");
    }

    return organisation;
  }

  public async getShortCode(tenantId?: string): Promise<string | undefined> {
    const resolvedTenantId = this.resolveTenantId(tenantId);
    if (!this.shortCodeCache.has(resolvedTenantId)) {
      try {
        const organisation = await this.getOrganisation(resolvedTenantId);
        this.shortCodeCache.set(
          resolvedTenantId,
          organisation.shortCode ?? "",
        );
      } catch (error: unknown) {
        const err = ensureError(error);

        throw new Error(
          `Failed to get Organisation short code: ${err.message}`,
        );
      }
    }
    return this.shortCodeCache.get(resolvedTenantId);
  }
}

class CustomConnectionsXeroClient extends MCPXeroClient {
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(config: {
    clientId: string;
    clientSecret: string;
    grantType: string;
  }) {
    super(config);
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
  }

  public async getClientCredentialsToken(): Promise<TokenSet> {
    const scope =
      process.env.XERO_SCOPES ??
      "accounting.invoices accounting.invoices.read accounting.payments accounting.payments.read accounting.banktransactions accounting.banktransactions.read accounting.manualjournals accounting.manualjournals.read accounting.journals.read accounting.contacts accounting.settings accounting.reports.aged.read accounting.reports.balancesheet.read accounting.reports.profitandloss.read accounting.reports.trialbalance.read payroll.settings payroll.employees payroll.timesheets";
    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString("base64");

    try {
      const response = await axios.post(
        "https://identity.xero.com/connect/token",
        `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`,
        {
          headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
        },
      );

      // Get the tenant ID from the connections endpoint
      const token = response.data.access_token;
      const connectionsResponse = await axios.get(
        "https://api.xero.com/connections",
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );

      if (connectionsResponse.data && connectionsResponse.data.length > 0) {
        this.tenantId = connectionsResponse.data[0].tenantId;
      }

      return response.data;
    } catch (error) {
      throw new Error(`Failed to get Xero token: ${formatError(error)}`);
    }
  }

  public async authenticate() {
    const tokenResponse = await this.getClientCredentialsToken();

    this.setTokenSet({
      access_token: tokenResponse.access_token,
      expires_in: tokenResponse.expires_in,
      token_type: tokenResponse.token_type,
    });

    // Populate the tenants array so getTenants()/switchTenantId() work
    await this.updateTenants();
  }
}

class BearerTokenXeroClient extends MCPXeroClient {
  private readonly bearerToken: string;

  constructor(config: { bearerToken: string }) {
    super();
    this.bearerToken = config.bearerToken;
  }

  async authenticate(): Promise<void> {
    this.setTokenSet({
      access_token: this.bearerToken,
    });

    await this.updateTenants();
  }
}

const XERO_ISSUER = new URL("https://identity.xero.com");
const XERO_SCOPES =
  process.env.XERO_SCOPES ??
  "openid profile email accounting.invoices accounting.invoices.read accounting.payments accounting.payments.read accounting.banktransactions accounting.banktransactions.read accounting.manualjournals accounting.manualjournals.read accounting.journals.read accounting.contacts accounting.settings accounting.reports.aged.read accounting.reports.balancesheet.read accounting.reports.profitandloss.read accounting.reports.trialbalance.read payroll.settings payroll.employees payroll.timesheets offline_access";

class AuthCodeXeroClient extends MCPXeroClient {
  private readonly tokenStore: TokenStore;
  private readonly callbackPort: number;
  private readonly authClientId: string;
  private readonly authClientSecret: string;
  private readonly redirectUri: string;
  private authenticatePromise: Promise<void> | null = null;
  private oidcConfig: client.Configuration | null = null;

  constructor(config: {
    clientId: string;
    clientSecret: string;
    callbackPort: number;
    tokenStorePath?: string;
  }) {
    // Don't pass OAuth config to XeroClient — we handle OAuth ourselves
    super();
    this.authClientId = config.clientId;
    this.authClientSecret = config.clientSecret;
    this.tokenStore = new TokenStore(config.tokenStorePath);
    this.callbackPort = config.callbackPort;
    this.redirectUri = `http://localhost:${config.callbackPort}/callback`;
  }

  private isTokenValid(): boolean {
    try {
      const tokenSet = this.readTokenSet();
      if (!tokenSet?.access_token) return false;
      const expiresAt = tokenSet.expires_at;
      if (!expiresAt) return false;
      // Valid if more than 60 seconds remain
      return expiresAt * 1000 > Date.now() + 60_000;
    } catch {
      return false;
    }
  }

  private async getOidcConfig(): Promise<client.Configuration> {
    if (!this.oidcConfig) {
      this.oidcConfig = await client.discovery(
        XERO_ISSUER,
        this.authClientId,
        this.authClientSecret,
      );
    }
    return this.oidcConfig;
  }

  async authenticate(): Promise<void> {
    // Concurrency guard: only one auth flow at a time
    if (this.authenticatePromise) {
      return this.authenticatePromise;
    }
    this.authenticatePromise = this.doAuthenticate();
    try {
      await this.authenticatePromise;
    } finally {
      this.authenticatePromise = null;
    }
  }

  private async doAuthenticate(): Promise<void> {
    // 1. Check if current in-memory token is still valid
    if (this.isTokenValid()) {
      return;
    }

    const config = await this.getOidcConfig();

    // 2. Try loading stored tokens and refreshing
    const storedTokens = await this.tokenStore.load();
    if (storedTokens?.refresh_token) {
      try {
        const refreshResponse = await this.xeroTokenRequest({
          grant_type: "refresh_token",
          refresh_token: storedTokens.refresh_token as string,
        });
        const tokenSet = this.tokenResponseToTokenSet(refreshResponse);
        this.setTokenSet(tokenSet);
        await this.tokenStore.save(tokenSet);
        await this.updateTenants(false);
        process.stderr.write(
          `[Xero Auth] Token refreshed successfully.\n`,
        );
        return;
      } catch {
        process.stderr.write(
          `[Xero Auth] Token refresh failed, starting new authorization flow.\n`,
        );
        await this.tokenStore.clear();
      }
    }

    // 3. Full interactive OAuth flow with PKCE
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge =
      await client.calculatePKCECodeChallenge(codeVerifier);
    const state = client.randomState();

    const authUrl = client.buildAuthorizationUrl(config, {
      redirect_uri: this.redirectUri,
      scope: XERO_SCOPES,
      response_type: "code",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state: state,
    });

    const callbackServer = new OAuthCallbackServer(this.callbackPort);
    try {
      process.stderr.write(
        `\n[Xero Auth] Authorization required. Please visit this URL to authorize:\n\n${authUrl.href}\n\n`,
      );

      // Attempt to open the browser (best-effort, fire-and-forget)
      this.openBrowser(authUrl.href);

      // Wait for the callback
      const callbackUrl = await callbackServer.waitForCallback();

      // Validate state from callback
      const callbackParams = new URL(callbackUrl).searchParams;
      const returnedState = callbackParams.get("state");
      if (returnedState !== state) {
        throw new Error("OAuth state mismatch — possible CSRF attack.");
      }

      const code = callbackParams.get("code");
      if (!code) {
        throw new Error(
          `Authorization failed: ${callbackParams.get("error") || "no code returned"}`,
        );
      }

      // Exchange the authorization code for tokens via direct POST
      // (openid-client v6's authorizationCodeGrant has client auth
      // incompatibilities with Xero's token endpoint)
      const tokenData = await this.xeroTokenRequest({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: this.redirectUri,
        code_verifier: codeVerifier,
      });

      const tokenSet = this.tokenResponseToTokenSet(tokenData);
      this.setTokenSet(tokenSet);
      await this.tokenStore.save(tokenSet);

      // Fetch tenants (connections only, skip full org details to avoid extra API calls)
      await this.updateTenants(false);

      // Log connected tenants
      process.stderr.write(`[Xero Auth] Authorization successful.\n`);
      this.logTenants();
    } finally {
      callbackServer.shutdown();
    }
  }

  /**
   * Makes a direct POST to Xero's token endpoint.
   * Uses client_secret_post (credentials in body) which Xero accepts reliably.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async xeroTokenRequest(params: Record<string, string>): Promise<any> {
    const response = await axios.post(
      "https://identity.xero.com/connect/token",
      new URLSearchParams({
        ...params,
        client_id: this.authClientId,
        client_secret: this.authClientSecret,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
      },
    );
    return response.data;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tokenResponseToTokenSet(response: any): TokenSet {
    return {
      access_token: response.access_token,
      refresh_token: response.refresh_token,
      expires_at: response.expires_in
        ? Math.floor(Date.now() / 1000) + response.expires_in
        : undefined,
      token_type: response.token_type ?? "Bearer",
      id_token: response.id_token,
      scope: response.scope,
    } as TokenSet;
  }

  private logTenants(): void {
    if (this.tenants && this.tenants.length > 0) {
      process.stderr.write(`[Xero Auth] Connected tenants:\n`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.tenants.forEach((t: any, i: number) => {
        const marker = t.tenantId === this.tenantId ? " (active)" : "";
        process.stderr.write(
          `  ${i + 1}. ${t.tenantName} [${t.tenantId}]${marker}\n`,
        );
      });
    }
  }

  private openBrowser(url: string): void {
    if (process.platform === "win32") {
      // On Windows, `start` treats the first quoted arg as a window title.
      // Use `start "" "url"` to provide an empty title.
      exec(`start "" "${url}"`, () => {});
    } else {
      const cmd = process.platform === "darwin" ? "open" : "xdg-open";
      exec(`${cmd} "${url}"`, () => {});
    }
  }
}

function createClient(): MCPXeroClient {
  if (bearer_token) {
    return new BearerTokenXeroClient({ bearerToken: bearer_token });
  }

  if (auth_mode === "auth_code") {
    return new AuthCodeXeroClient({
      clientId: client_id!,
      clientSecret: client_secret!,
      callbackPort: callback_port,
      tokenStorePath: process.env.XERO_TOKEN_STORE_PATH,
    });
  }

  return new CustomConnectionsXeroClient({
    clientId: client_id!,
    clientSecret: client_secret!,
    grantType: grant_type,
  });
}

export const xeroClient = createClient();
