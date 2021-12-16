import { parseEther } from '@ethersproject/units';
import { Contracts } from '@popcorn/app/context/Web3/contracts';
import { LockStaking, Staking } from '@popcorn/hardhat/typechain';
import { BigNumber } from 'ethers';
import { ERC20, ERC20__factory } from '../../hardhat/typechain';
import { bigNumberToNumber } from './formatBigNumber';
import { Address } from './types';

export interface StakingPoolInfo {
  stakingContractAddress: string;
  stakedTokenAddress: string;
  stakedTokenName?: string;
  apy: number;
  totalStake: number;
  tokenEmission: number;
}

export async function calculateAPY(
  tokenPerWeek: BigNumber,
  totalStaked: BigNumber,
): Promise<number> {
  //Prevents `div by 0` errors
  if (!totalStaked || totalStaked.eq(BigNumber.from('0'))) {
    return Infinity;
  }

  const tokenPerWeekPerShare = tokenPerWeek
    .mul(parseEther('1'))
    .div(totalStaked);
  const apy = tokenPerWeekPerShare.mul(52);
  return bigNumberToNumber(apy.mul(100));
}

export async function getSingleStakingPoolInfo(
  stakingContract: Staking | LockStaking,
  library: any,
  stakedTokenAddress?: Address,
  stakedTokenName?: string,
): Promise<StakingPoolInfo> {
  const tokenPerWeek = await stakingContract?.getRewardForDuration({
    gasLimit: '2000000',
  });
  const totalStaked = await stakingContract?.totalSupply({
    gasLimit: '2000000',
  });
  if (!stakedTokenAddress) {
    stakedTokenAddress = await (stakingContract as Staking)?.stakingToken({
      gasLimit: 2000000,
    });
  }
  if (!stakedTokenName) {
    stakedTokenName = await getStakedTokenName(stakedTokenAddress, library);
  }
  return {
    stakingContractAddress: stakingContract?.address,
    stakedTokenAddress,
    stakedTokenName,
    apy: await calculateAPY(tokenPerWeek, totalStaked),
    totalStake: bigNumberToNumber(totalStaked),
    tokenEmission: bigNumberToNumber(tokenPerWeek),
  };
}

export async function getStakedTokenName(
  stakedTokenAddress: Address,
  library: any,
): Promise<string> {
  try {
    if (stakedTokenAddress && stakedTokenAddress.length > 1) {
      const contract: ERC20 = await ERC20__factory.connect(
        stakedTokenAddress,
        library,
      );
      const result = contract ? await contract.name() : '';
      return result;
    }
  } catch (ex) {
    console.log(ex);
  }
}

export async function getStakingPoolsInfo(
  contracts: Contracts,
  library: any,
): Promise<StakingPoolInfo[]> {
  let stakingPools: StakingPoolInfo[] = [];
  const stakingContracts = contracts ? contracts.staking : [];
  if (contracts && stakingContracts && stakingContracts.length > 0) {
    for (let i = 0; i < stakingContracts.length; i++) {
      const stakingContract = stakingContracts[i];
      const tokenPerWeek = await stakingContract?.getRewardForDuration({
        gasLimit: 2000000,
      });
      const totalStaked = await stakingContract?.totalSupply({
        gasLimit: 2000000,
      });
      const stakedTokenAddress: string = await stakingContract?.stakingToken({
        gasLimit: 2000000,
      });
      const apy = await calculateAPY(tokenPerWeek, totalStaked);
      const totalStake = await bigNumberToNumber(totalStaked);
      const tokenEmission = await bigNumberToNumber(tokenPerWeek);
      let stakedTokenName = 'unnamed';
      stakedTokenName = await getStakedTokenName(stakedTokenAddress, library);
      const stakingInfo = {
        stakingContractAddress: stakingContract?.address,
        stakedTokenAddress: stakedTokenAddress,
        stakedTokenName: stakedTokenName,
        apy,
        totalStake,
        tokenEmission,
      };
      stakingPools[i] = stakingInfo;
    }
    return stakingPools;
  }
  return stakingPools;
}

export async function getEarned(
  account: string,
  contracts: Contracts,
): Promise<number[]> {
  const { staking: stakingContracts } = contracts;
  const result: number[] = [];
  if (!stakingContracts || stakingContracts.length === 0) {
    return result;
  }
  for (let i = 0; i < stakingContracts.length; i++) {
    result[i] = bigNumberToNumber(await contracts.staking[i].earned(account));
  }
  return result;
}