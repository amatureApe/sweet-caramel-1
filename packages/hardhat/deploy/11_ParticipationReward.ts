import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getSignerFrom } from "../lib/utils/getSignerFrom";
import { addContractToRegistry } from "./utils";

const main: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const addresses = await getNamedAccounts();

  const signer = await getSignerFrom(hre.config.namedAccounts.deployer as string, hre);

  await deploy("ParticipationReward", {
    from: addresses.deployer,
    args: [(await deployments.get("ContractRegistry")).address],
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
    contract: "ParticipationReward",
  });
  await addContractToRegistry("ParticipationReward", deployments, signer, hre);
};
export default main;
main.dependencies = ["setup"];
main.tags = ["core", "participation-reward"];
