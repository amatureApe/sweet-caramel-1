import { useMemo } from "react";
import { DeploymentChainIds, DeploymentContractsKeys, getNamedAccounts } from "@popcorn/utils";

/**
 * useBalanceValue hook is used to calculate the value of an account balance of a given token
 * @returns value of balance in USD terms based on token price
 */
export const useNamedAccounts = <Chain extends DeploymentChainIds>(
  chainId: Chain | undefined,
  contractAddresses?: DeploymentContractsKeys<Chain>[],
) => {
  return useMemo(() => (chainId && getNamedAccounts(chainId, contractAddresses)) || [], [chainId, contractAddresses]);
};
export default useNamedAccounts;