import { ERC20__factory } from "@popcorn/hardhat/typechain";
import { getToken } from "@popcorn/utils";
import { isAddress } from "ethers/lib/utils";
import { useContractMetadata } from "hooks/useContractMetadata";
import { useCallback, useEffect, useState } from "react";
import { Token } from "../../../utils/src/types/index";
import { useRpcProvider } from "../useRpcProvider";
import useWeb3 from "../useWeb3";

export default function useERC20(address: string | null, chainId): Token {
  const { account } = useWeb3();
  const [token, setToken] = useState<Token>(null);
  const provider = useRpcProvider(chainId);
  const erc20 = useCallback(ERC20__factory.connect, [address, chainId, provider]);
  const metadata = useContractMetadata(address, chainId);

  useEffect(() => {
    let mounted = true;
    if (isAddress(address)) {
      getToken(erc20(address, provider), provider, chainId, undefined, undefined, metadata)
        .then((token) => mounted && setToken(token))
        .catch((err) => {});
    }
    return () => {
      mounted = false;
    };
  }, [address, account, chainId]);

  return token;
}
