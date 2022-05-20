import { DeployFunction } from "@anthonymartin/hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getSignerFrom } from "../lib/utils/getSignerFrom";
import { addContractToRegistry } from "./utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const addresses = await getNamedAccounts();
  const signer = await getSignerFrom(hre.config.namedAccounts.deployer as string, hre);

  const YTOKEN_ADDRESSES = [addresses.yFrax, addresses.yRai, addresses.yMusd, addresses.yAlusd];
  const CRV_DEPENDENCIES = [
    {
      curveMetaPool: addresses.crvFraxMetapool,
      crvLPToken: addresses.crvFrax,
    },
    {
      curveMetaPool: addresses.crvRaiMetapool,
      crvLPToken: addresses.crvRai,
    },
    {
      curveMetaPool: addresses.crvMusdMetapool,
      crvLPToken: addresses.crvMusd,
    },
    {
      curveMetaPool: addresses.crvAlusdMetapool,
      crvLPToken: addresses.crvAlusd,
    },
  ];

  //ContractRegistry
  const contractRegistryAddress = (await deployments.get("ContractRegistry")).address;

  //Whale Butter
  console.log("deploying whale butter...");
  const deployed = await deploy("ButterWhaleProcessing", {
    from: addresses.deployer,
    args: [
      contractRegistryAddress,
      addresses.butterStaking,
      addresses.butter,
      addresses.threeCrv,
      addresses.threePool,
      addresses.setBasicIssuanceModule,
      YTOKEN_ADDRESSES,
      CRV_DEPENDENCIES,
    ],
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
    contract: "ButterWhaleProcessing",
  });

  console.log("adding whale butter to contract registry...");
  await addContractToRegistry("ButterWhaleProcessing", deployments, signer, hre);

  console.log("setting approvals for ButterWhaleProcessing");
  const butterWhaleProcessing = await hre.ethers.getContractAt(
    "ButterWhaleProcessing",
    (
      await deployments.get("ButterWhaleProcessing")
    ).address
  );
  await butterWhaleProcessing.setApprovals();
};

export default func;

func.dependencies = ["setup"];
func.tags = ["frontend", "butterwhale"];