import { parseEther } from "@ethersproject/units";
import { getChainRelevantContracts } from "@popcorn/hardhat/lib/utils/getContractAddresses";
import { BasicIssuanceModule, ButterBatchProcessing } from "@popcorn/hardhat/typechain";
import { Address, ContractAddresses } from "@popcorn/utils/types";
import { BigNumber } from "ethers";
import useBasicIssuanceModule from "hooks/butter/useBasicIssuanceModule";
import useButterBatch from "hooks/butter/useButterBatch";
import useWeb3 from "hooks/useWeb3";
import useSWR from "swr";

export async function getTokenPrice(
  basicIssuanceModule: BasicIssuanceModule,
  butterBatch: ButterBatchProcessing,
  butterAddress: Address,
) {
  const requiredComponentsForIssue = await basicIssuanceModule.getRequiredComponentUnitsForIssue(
    butterAddress,
    parseEther("1"),
  );
  // Butter Token price
  const butterPrice = await butterBatch.valueOfComponents(...requiredComponentsForIssue);
  return butterPrice as BigNumber;
}

export default function useGetButterTokenPriceInUSD() {
  const { chainId } = useWeb3();
  const butterBatch = useButterBatch();
  const basicIssuanceModule = useBasicIssuanceModule();
  const contractAddresses: ContractAddresses = getChainRelevantContracts(chainId);
  const butterAddress = contractAddresses.butter;
  const shouldFetch = butterBatch && basicIssuanceModule && butterAddress && chainId;
  return useSWR(
    shouldFetch ? ["getTokenPrice", butterBatch, basicIssuanceModule, contractAddresses.butter] : null,
    async () => getTokenPrice(basicIssuanceModule, butterBatch, butterAddress),
  );
}