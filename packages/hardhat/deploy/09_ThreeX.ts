import { BigNumber, ethers, utils } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getSignerFrom } from "../lib/utils/getSignerFrom";
import { addContractToRegistry } from "./utils";
import { DeployFunction } from "@anthonymartin/hardhat-deploy/types";
import { INCENTIVE_MANAGER_ROLE } from "../lib/acl/roles";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const addresses = await getNamedAccounts();
  const { threeX, threeXStaking, daoAgentV2 } = addresses;
  const signer = await getSignerFrom(hre.config.namedAccounts.deployer as string, hre);
  const pop = addresses.pop;

  const YTOKEN_ADDRESSES = [addresses.ySusd, addresses.y3Eur];
  const CRV_DEPENDENCIES = [
    {
      lpToken: addresses.crvSusd,
      utilityPool: addresses.crvSusdUtilityPool,
      oracle: ethers.constants.AddressZero,
      curveMetaPool: addresses.crvSusdMetapool,
      angleRouter: ethers.constants.AddressZero,
    },
    {
      lpToken: addresses.crv3EurMetapool,
      utilityPool: ethers.constants.AddressZero,
      oracle: addresses.eurOracle,
      curveMetaPool: addresses.crv3EurMetapool,
      angleRouter: addresses.angleRouter,
    },
  ];

  console.log(
    JSON.stringify(
      {
        YTOKEN_ADDRESSES,
        CRV_DEPENDENCIES,
      },
      null,
      2
    )
  );

  //ContractRegistry
  const contractRegistryAddress = (await deployments.get("ContractRegistry")).address;

  //Butter Batch
  console.log("deploying threeXBatchProcessing...");

  const processing = await deploy("ThreeXBatchProcessing", {
    from: addresses.deployer,
    args: [
      contractRegistryAddress,
      threeXStaking,
      { sourceToken: addresses.usdc, targetToken: threeX },
      { sourceToken: threeX, targetToken: addresses.usdc },
      addresses.setBasicIssuanceModule,
      YTOKEN_ADDRESSES,
      CRV_DEPENDENCIES,
      addresses.agEur,
      { batchCooldown: BigNumber.from("1"), mintThreshold: parseEther("1"), redeemThreshold: parseEther("0.1") },
    ],
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
  });

  console.log("adding ThreeXBatchProcessing to contract registry...");
  await addContractToRegistry("ThreeXBatchProcessing", deployments, signer, hre);

  const batchStorage = await deploy("ThreeXBatchVault", {
    from: addresses.deployer,
    args: [contractRegistryAddress, (await deployments.get("ThreeXBatchProcessing")).address],
  });

  console.log("adding ThreeXBatchVault to contract registry...");
  await addContractToRegistry("ThreeXBatchVault", deployments, signer, hre);

  const processingContract = await hre.ethers.getContractAt(
    "ThreeXBatchProcessing",
    (
      await deployments.get("ThreeXBatchProcessing")
    ).address,
    signer
  );

  console.log("setting batch storage contract ... ");
  const batchStorageTx = await processingContract.setBatchStorage((await deployments.get("ThreeXBatchVault")).address);
  await wait(batchStorageTx, hre);

  console.log("setting threeXBatchProcessing approvals ... ");
  const approvalsTx = await processingContract.setApprovals();
  await wait(approvalsTx, hre);

  console.log("setting fee recipients ...");
  const feeTx1 = await processingContract.setFee(utils.formatBytes32String("mint"), 75, daoAgentV2, threeX);
  await wait(feeTx1, hre);

  const feeTx2 = await processingContract.setFee(utils.formatBytes32String("redeem"), 75, daoAgentV2, addresses.usdc);
  await wait(feeTx2, hre);

  //Adding permissions and other maintance
  const keeperIncentive = await hre.ethers.getContractAt(
    "KeeperIncentiveV2",
    (
      await deployments.get("KeeperIncentive")
    ).address,
    signer
  );

  if (!Boolean(parseInt(process.env.UPDATE_ONLY || "0"))) {
    const aclRegistry = await hre.ethers.getContractAt(
      "ACLRegistry",
      (
        await deployments.get("ACLRegistry")
      ).address,
      signer
    );
    //Butter Batch Zapper
    console.log("deploying ThreeXZapper...");
    const processingZapper = await deploy("ThreeXZapper", {
      from: addresses.deployer,
      args: [contractRegistryAddress, addresses.threePool, [addresses.dai, addresses.usdc, addresses.usdt]],
      log: true,
      autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
    });
    await addContractToRegistry("ThreeXZapper", deployments, signer, hre);

    console.log("setting approvals for ThreeXZapper... ");
    const zapper = await hre.ethers.getContractAt("ThreeXZapper", processingZapper.address, signer);

    const zapperApprovalsTx = await zapper.setApprovals();
    await wait(zapperApprovalsTx, hre);

    console.log("granting ThreeXZapper role to ThreeXZapper");
    const tx1 = await aclRegistry.grantRole(
      ethers.utils.id("ThreeXZapper"),
      (
        await deployments.get("ThreeXZapper")
      ).address
    );
    await wait(tx1, hre);

    console.log("granting INCENTIVE_MANAGER_ROLE role to deployer");
    const incentiveGrantTx = await aclRegistry.grantRole(INCENTIVE_MANAGER_ROLE, await signer.getAddress());
    await wait(incentiveGrantTx, hre);

    console.log("granting ApprovedContract role to ThreeXZapper");
    const tx2 = await aclRegistry.grantRole(
      ethers.utils.id("ApprovedContract"),
      (
        await deployments.get("ThreeXZapper")
      ).address
    );
    await wait(tx2, hre);

    console.log("creating incentive 1 ...");
    const tx3 = await keeperIncentive.createIncentive(
      (
        await deployments.get("ThreeXBatchProcessing")
      ).address, // controller contract
      0, // reward
      true, // enabled
      true, // openToEveryone
      pop, // rewardToken
      60 * 60 * 24, // cooldown
      0 // burnRate
    );
    await wait(tx3, hre);

    console.log("creating incentive 2 ...");
    const tx4 = await keeperIncentive.createIncentive(
      (
        await deployments.get("ThreeXBatchProcessing")
      ).address, // controller contract
      0, // reward
      true, // enabled
      true, // openToEveryone
      pop, // rewardToken
      60 * 60 * 24, // cooldown
      0 // burnRate
    );
    await wait(tx4, hre);
  }
};

async function wait(tx, hre) {
  if (!["hardhat", "local"].includes(hre.network.name)) {
    await tx.wait();
  }
}

export default func;

func.dependencies = ["setup", "acl-registry", "contract-registry", "keeper-incentives"];
func.tags = ["frontend", "3x"];
