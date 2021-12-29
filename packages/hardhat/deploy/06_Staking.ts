import { DeployFunction } from "@anthonymartin/hardhat-deploy/types";
import { parseEther } from "ethers/lib/utils";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getSignerFrom } from "../lib/utils/getSignerFrom";
import { getStakingPools, Pool } from "../lib/utils/getStakingPools";
import { MockERC20 } from "../typechain";
import { addContractToRegistry } from "./utils";

const main: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const addresses = await getNamedAccounts();

  const signer = await getSignerFrom(
    hre.config.namedAccounts.deployer as string,
    hre
  );

  const stakingPools = await getStakingPools(
    hre.network.config.chainId,
    addresses,
    deployments
  );

  for (var i = 0; i < stakingPools.length; i++) {
    const { poolName, rewardsToken, inputToken, contract } = stakingPools[i];
    const deployed = await deploy(poolName, {
      from: addresses.deployer,
      args:
        stakingPools[i].contract === "PopLocker"
          ? [
              stakingPools[i].inputToken,
              (await deployments.get("RewardsEscrow")).address,
            ]
          : [
              stakingPools[i].rewardsToken,
              stakingPools[i].inputToken,
              (await deployments.get("RewardsEscrow")).address,
            ],
      log: true,
      autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks,
      contract: contract,
    });

    await addContractToRegistry(poolName, deployments, signer, hre);
  }
  if (["hardhat", "local"].includes(hre.network.name)) {
    createDemoData(hre, stakingPools[1]);
  }
};
export default main;
main.dependencies = ["setup"];
main.tags = ["core", "frontend"];

async function prepareStakingContract(
  POP: MockERC20,
  inputToken: MockERC20,
  contractAddress: string,
  signer: any,
  hre: HardhatRuntimeEnvironment
): Promise<void> {
  await (await POP.mint(contractAddress, parseEther("1000000000"))).wait(1);
  const stakingContract = await hre.ethers.getContractAt(
    "Staking",
    contractAddress,
    signer
  );
  console.log("Adding POP rewards to staking at:", contractAddress);
  await (await stakingContract.notifyRewardAmount(parseEther("1000"))).wait(1);
  console.log("Staking some Token...");
  await inputToken.approve(contractAddress, parseEther("1000"));
  await stakingContract.connect(signer).stake(parseEther("100"));
}

async function connectAndMintToken(
  tokenAddress: string,
  signer: any,
  hre: HardhatRuntimeEnvironment
): Promise<MockERC20> {
  const token = await hre.ethers.getContractAt(
    "MockERC20",
    tokenAddress,
    signer
  );
  await (
    await token.mint(await signer.getAddress(), parseEther("1000000000"))
  ).wait(1);
  return token;
}

async function createDemoData(
  hre: HardhatRuntimeEnvironment,
  pool: Pool
): Promise<void> {
  try {
    const { deployments } = hre;

    const signer = await getSignerFrom(
      hre.config.namedAccounts.deployer as string,
      hre
    );
    // fund Pool staking rewards
    const poolInputTokens = await connectAndMintToken(
      pool.inputToken,
      signer,
      hre
    );
    const poolRewardTokens = await connectAndMintToken(
      pool.rewardsToken,
      signer,
      hre
    );
    await prepareStakingContract(
      poolRewardTokens,
      poolInputTokens,
      (
        await deployments.get(pool.poolName)
      ).address,
      signer,
      hre
    );
  } catch (ex) {
    console.log(ex.toString());
    process.exit(1);
  }
}
