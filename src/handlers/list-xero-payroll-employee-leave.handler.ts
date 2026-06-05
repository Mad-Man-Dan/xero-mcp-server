import { xeroClient } from "../clients/xero-client.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
// Import the correct types - using the proper namespace
import { EmployeeLeave } from "../types/payroll-nz-types.js";

interface FetchEmployeeLeaveParams {
  employeeId?: string;
}

/**
 * Internal function to fetch employee leave from Xero
 */
async function fetchEmployeeLeave({ employeeId }: FetchEmployeeLeaveParams, tenantId?: string): Promise<EmployeeLeave[] | null> {
  await xeroClient.authenticate();
  const resolvedTenantId = xeroClient.resolveTenantId(tenantId);

  if (!employeeId) {
    throw new Error("Employee ID is required to fetch employee leave");
  }

  const response = await xeroClient.payrollNZApi.getEmployeeLeaves(
    resolvedTenantId,
    employeeId,
    {
      headers: getClientHeaders().headers
    }
  );

  return response.body.leave ?? null;
}

/**
 * List employee leave from Xero Payroll
 * @param employeeId The ID of the employee to retrieve leave for
 */
export async function listXeroPayrollEmployeeLeave(
  employeeId: string,
  tenantId?: string,
): Promise<XeroClientResponse<EmployeeLeave[]>> {
  try {
    const leave = await fetchEmployeeLeave({ employeeId }, tenantId);

    if (!leave) {
      return {
        result: [],
        isError: false,
        error: null,
      };
    }

    return {
      result: leave,
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
