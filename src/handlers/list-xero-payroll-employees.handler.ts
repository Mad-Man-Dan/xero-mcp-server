import { xeroClient } from "../clients/xero-client.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { Employee } from "../types/payroll-nz-types.js";

async function getPayrollEmployees(tenantId?: string): Promise<Employee[]> {
  await xeroClient.authenticate();
  const resolvedTenantId = xeroClient.resolveTenantId(tenantId);

  // Call the Employees endpoint from the PayrollNZApi
  const employees = await xeroClient.payrollNZApi.getEmployees(
    resolvedTenantId,
    undefined, // page
    undefined, // pageSize
    getClientHeaders(),
  );

  return employees.body.employees ?? [];
}

/**
 * List all payroll employees from Xero
 */
export async function listXeroPayrollEmployees(tenantId?: string): Promise<
  XeroClientResponse<Employee[]>
> {
  try {
    const employees = await getPayrollEmployees(tenantId);

    return {
      result: employees,
      isError: false,
      error: null,
    };
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error),
    };
  }
}
