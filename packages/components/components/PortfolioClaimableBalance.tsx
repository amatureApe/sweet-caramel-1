import type { Pop } from "@popcorn/components/lib/types";
import { Fragment } from "react";
import { BigNumber, constants } from "ethers";

import { Badge, BadgeVariant } from "@popcorn/components/components/Badge";

import { Escrow } from "../lib";
import { AssetRow } from "../components/PortfolioSection";

function PortfolioClaimableBalance({
  token,
  type: rewardType,
  account,
  networth,
  callback,
}: {
  token: Pop.NamedAccountsMetadata;
  account?: string;
  networth: BigNumber;
  callback: any;
  type: "vesting" | "claimable";
}) {
  const chainId = Number(token.chainId);

  const sharedProps = {
    address: token.address,
    account: account as any,
    chainId,
    networth,
    token,
  };
  const isClaimable = rewardType === "claimable";

  return (
    <Escrow.ClaimableBalanceOf
      {...sharedProps}
      render={({ balance: claimableBalance, price, status }) =>
        isClaimable ? (
          <AssetRow
            {...sharedProps}
            callback={callback}
            name={token.symbol || "Popcorn"}
            balance={claimableBalance}
            status={status}
            price={price}
          />
        ) : (
          <Escrow.VestingBalanceOf
            {...sharedProps}
            render={({ balance: vestingBalance, price, status }) => (
              <AssetRow
                {...sharedProps}
                callback={callback}
                name="Popcorn"
                balance={vestingBalance}
                status={status}
                price={price}
              />
            )}
          />
        )
      }
    />
  );
}

export default PortfolioClaimableBalance;
