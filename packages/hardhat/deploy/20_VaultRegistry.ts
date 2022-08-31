import { DeployFunction } from "@anthonymartin/hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getSignerFrom } from "../lib/utils/getSignerFrom";
import { addContractToRegistry } from "./utils";

const main: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const addresses = await getNamedAccounts();

  const signer = await getSignerFrom(hre.config.namedAccounts.deployer as string, hre);

  await deploy("VaultsV1Registry", {
    from: addresses.deployer,
    args: [addresses.deployer], // deployer will initially be owner for Owned
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
    contract: "VaultsV1Registry",
  });
  console.log("adding VaultsV1Registry to contract registry...");
  await addContractToRegistry("VaultsV1Registry", deployments, signer, hre);
};

export default main;
main.dependencies = ["setup"];
main.tags = ["core", "vault", "vaults-v1-registry"];
