import { useNamedAccounts } from "@popcorn/components/lib/utils/hooks";
import { NextPage } from "next";
import { ChainId } from "@popcorn/utils";
import { useFeatures } from "@popcorn/components/hooks";
import { Escrow, Erc20, Price, Contract, Staking } from "@popcorn/components/lib";
import { TotalBalance } from "@popcorn/components/lib/Contract/BalanceOf";
import { Pop } from "@popcorn/components/lib/types";
import { Networth } from "@popcorn/components/lib/Portfolio/Networth";
import { BigNumber } from "ethers";
import useSum from "../hooks/useSum3";

export const PortfolioPage: NextPage = () => {
  const {
    features: { portfolio: visible },
  } = useFeatures();

  // const { address: account } = useAccount();
  const account = "0x4f20cb7a1d567a54350a18dacb0cc803aebb4483";

  const contractsEth = useNamedAccounts("1", [
    "pop",
    "popStaking",
    "threeX",
    "threeXStaking",
    "butter",
    "butterStaking",
    "xenStaking",
    "popUsdcArrakisVaultStaking",
    "rewardsEscrow",
  ]);

  const contractsPoly = useNamedAccounts("137", [
    "pop",
    "popStaking",
    "popUsdcSushiLP",
    "popUsdcArrakisVault",
    "popUsdcArrakisVaultStaking",
    "rewardsEscrow",
    "xPop",
  ]);

  const contractsBnb = useNamedAccounts("56", ["pop", "xPop", "rewardsEscrow"]);

  const contractsArbitrum = useNamedAccounts("42161", ["pop", "xPop", "rewardsEscrow"]);

  const contractsOp = useNamedAccounts("10", ["pop", "popUsdcArrakisVault"]);
  const allContracts = [
    ...contractsEth,
    ...contractsPoly,
    ...contractsBnb,
    ...contractsArbitrum,
    ...contractsOp,
  ].flatMap((network) => network) as Pop.NamedAccountsMetadata[];

  const { loading: networthLoading, sum: networth, add } = useSum({ expected: 1 });
  const addToNetworth = (value?: BigNumber) => {
    !!value && add(value);
    return true;
  };
  return (
    <div className={visible ? "" : "hidden"}>
      <Networth account={account} loading={networthLoading} value={networth} />

      {allContracts.map((token, i) => (
        <Contract.Metadata
          index={i}
          alias={token.__alias}
          key={`${i}:${token.chainId}:${token.address}`}
          chainId={Number(token.chainId) as unknown as ChainId}
          address={token.address}
        >
          <TotalBalance key={`Contract.BalanceOf`} account={account} address={token.address} chainId={token.chainId} />

          <Erc20.BalanceOf
            key={`Erc20.BalanceOfValue`}
            account={account}
            address={token.address}
            chainId={token.chainId}
            render={({ balance, price, status }) => (
              <Contract.Value balance={balance?.value} price={price?.value} status={status} callback={addToNetworth} />
            )}
          />

          <Escrow.BalanceOf
            key={`Escrow.BalanceOfValue`}
            account={account}
            address={token.address}
            chainId={token.chainId}
            render={({ balance, price, status }) => (
              <>
                <Contract.Value balance={balance?.value} price={price?.value} status={status} />
              </>
            )}
          />

          <Escrow.ClaimableBalanceOf
            key={`Escrow.ClaimableBalanceOfValue`}
            account={account}
            address={token.address}
            chainId={token.chainId}
            render={({ balance, price, status }) => (
              <Contract.Value balance={balance?.value} price={price?.value} status={status} />
            )}
          />

          <Escrow.VestingBalanceOf
            key={`Escrow.VestingBalanceOfValue`}
            account={account}
            address={token.address}
            chainId={token.chainId}
            render={({ balance, price, status }) => (
              <Contract.Value balance={balance?.value} price={price?.value} status={status} />
            )}
          />

          <Price.PriceOf key={`Price.PriceOf`} address={token.address} chainId={token.chainId} />

          <Staking.Apy key={`Staking.vAPR`} address={token.address} chainId={token.chainId} />

          <Staking.ClaimableBalanceOf
            key={`Staking.ClaimableBalanceValue`}
            account={account}
            address={token.address}
            chainId={token.chainId}
            render={(props) => <Contract.Value balance={props.balance} price={props.price} decimals={props.decimals} />}
          />

          <Contract.Tvl key={`Contract.TVL`} address={token.address} chainId={token.chainId} />
        </Contract.Metadata>
      ))}
    </div>
  );
};

export default PortfolioPage;
