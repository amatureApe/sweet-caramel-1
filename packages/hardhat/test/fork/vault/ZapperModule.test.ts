import axios from "axios";
import { Signer } from "ethers/lib/ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers, network } from "hardhat";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { Zapper } from "../../../lib/adapters/Zapper";
import { expectValue } from "../../../lib/utils/expectValue";
import { impersonateSigner } from "../../../lib/utils/test";
import { ERC20, VaultsV1Zapper } from "../../../typechain";
import { accounts, Contracts, deployContracts } from "./forkTestHelper";

const ETH_ADDRESS = ethers.constants.AddressZero;
const SETH_ADDRESS = "0x5e74C9036fb86BD7eCdcb084a0673EFc32eA31cb";
const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const SETH_POOL = "0xc5424B857f758E906013F3555Dad202e4bdB4567";

interface ZapperModuleContracts extends Contracts {
  vaultsV1Zapper?: VaultsV1Zapper;
  seth?: ERC20;
  dai?: ERC20;
}

let owner: SignerWithAddress;
let contracts: ZapperModuleContracts;
let zapper: Zapper;
let dao: Signer;

describe("sEth Zapper Test", function () {
  beforeEach(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.FORKING_RPC_URL,
          },
        },
      ],
    });
    [owner] = await ethers.getSigners();
    contracts = await deployContracts("0xA3D87FffcE63B53E0d54fAa1cc983B7eB0b74A9c");

    contracts.seth = (await ethers.getContractAt(
      "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
      SETH_ADDRESS
    )) as ERC20;

    contracts.dai = (await ethers.getContractAt(
      "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
      DAI_ADDRESS
    )) as ERC20;

    await contracts.faucet.sendTokens(DAI_ADDRESS, 10, owner.address);

    const VaultsV1Zapper = await ethers.getContractFactory("VaultsV1Zapper");
    contracts.vaultsV1Zapper = await VaultsV1Zapper.deploy(contracts.contractRegistry.address);

    dao = await impersonateSigner("0x92a1cB552d0e177f3A135B4c87A4160C8f2a485f");

    const aclRegistry = await ethers.getContractAt("ACLRegistry", accounts.aclRegistry);
    await aclRegistry
      .connect(dao)
      .grantRole(await aclRegistry.APPROVED_CONTRACT_ROLE(), contracts.vaultsV1Zapper.address);

    await contracts.vaultsV1Zapper.connect(dao).updateVault(contracts.asset.address, contracts.vault.address);
    await contracts.vaultsV1Zapper
      .connect(dao)
      .updateZaps(
        contracts.asset.address,
        "0x5Ce9b49B7A1bE9f2c3DC2B2A5BaCEA56fa21FBeE",
        "0xE03A338d5c305613AfC3877389DD3B0617233387"
      );

    zapper = new Zapper(axios, contracts.vaultsV1Zapper);

    await contracts.dai.approve(contracts.vaultsV1Zapper.address, ethers.constants.MaxUint256);
    await contracts.seth.approve(contracts.vaultsV1Zapper.address, ethers.constants.MaxUint256);
    await contracts.vault.approve(contracts.vaultsV1Zapper.address, ethers.constants.MaxUint256);
  });
  it("zapIn should swap to the underlying asset and deposit into the vault", async () => {
    const vaultBal = await contracts.vault.balanceOf(owner.address);
    const daiBal = await contracts.dai.balanceOf(owner.address);

    await zapper.zapIn(
      { address: contracts.dai.address, decimals: 18 },
      contracts.vault,
      SETH_POOL,
      parseUnits("1"),
      0.03,
      false
    );
    await expectValue((await contracts.vault.balanceOf(owner.address)).gt(vaultBal), true);
    await expectValue((await contracts.dai.balanceOf(owner.address)).lt(daiBal), true);
  });
  it("zapIn should swap to the underlying asset and stake", async () => {
    await contracts.vault.connect(dao).setStaking(contracts.staking.address);
    const stakingBal = await contracts.staking.balanceOf(owner.address);
    const daiBal = await contracts.dai.balanceOf(owner.address);

    await zapper.zapIn(
      { address: contracts.dai.address, decimals: 18 },
      contracts.vault,
      SETH_POOL,
      parseUnits("1"),
      0.03,
      true
    );
    await expectValue((await contracts.staking.balanceOf(owner.address)).gt(stakingBal), true);
    await expectValue((await contracts.dai.balanceOf(owner.address)).lt(daiBal), true);
  });
  it("zapIn should deposit crvLP into the vault", async () => {
    await contracts.faucet.sendTokens(SETH_ADDRESS, 5, owner.address);
    const vaultBal = await contracts.vault.balanceOf(owner.address);
    const sethBal = await contracts.seth.balanceOf(owner.address);

    await zapper.zapIn(
      { address: SETH_ADDRESS, decimals: 18 },
      contracts.vault,
      SETH_POOL,
      parseUnits("1"),
      0.03,
      false
    );
    await expectValue((await contracts.vault.balanceOf(owner.address)).gt(vaultBal), true);
    await expectValue((await contracts.seth.balanceOf(owner.address)).lt(sethBal), true);
  });
  it("zapOut should withdraw and swap into underlying asset", async () => {
    await zapper.zapIn(
      { address: contracts.dai.address, decimals: 18 },
      contracts.vault,
      SETH_POOL,
      parseUnits("2000"),
      0.03,
      false
    );
    const vaultBal = await contracts.vault.balanceOf(owner.address);
    const daiBal = await contracts.dai.balanceOf(owner.address);

    await zapper.zapOut(
      { address: contracts.dai.address, decimals: 18 },
      contracts.vault,
      SETH_POOL,
      vaultBal,
      1,
      false
    );
    await expectValue((await contracts.vault.balanceOf(owner.address)).lt(vaultBal), true);
    await expectValue((await contracts.dai.balanceOf(owner.address)).gt(daiBal), true);
  });
  it("zapOut should unstake and swap into underlying asset", async () => {
    await contracts.staking.connect(owner).setVault(contracts.vault.address);
    await contracts.vault.connect(dao).setStaking(contracts.staking.address);
    await zapper.zapIn(
      { address: contracts.dai.address, decimals: 18 },
      contracts.vault,
      SETH_POOL,
      parseUnits("2000"),
      0.03,
      true
    );
    const stakeBal = await contracts.staking.balanceOf(owner.address);
    const daiBal = await contracts.dai.balanceOf(owner.address);

    await zapper.zapOut(
      { address: contracts.dai.address, decimals: 18 },
      contracts.vault,
      SETH_POOL,
      stakeBal,
      1,
      true
    );
    await expectValue((await contracts.staking.balanceOf(owner.address)).lt(stakeBal), true);
    await expectValue((await contracts.dai.balanceOf(owner.address)).gt(daiBal), true);
  });
  it("zapOut should withdraw pool assets", async () => {
    await zapper.zapIn(
      { address: contracts.dai.address, decimals: 18 },
      contracts.vault,
      SETH_POOL,
      parseUnits("2000"),
      0.03,
      false
    );
    const vaultBal = await contracts.vault.balanceOf(owner.address);
    const sethBal = await contracts.seth.balanceOf(owner.address);

    await zapper.zapOut(
      { address: contracts.seth.address, decimals: 18 },
      contracts.vault,
      SETH_POOL,
      vaultBal,
      0.03,
      false
    );
    await expectValue((await contracts.vault.balanceOf(owner.address)).lt(vaultBal), true);
    await expectValue((await contracts.seth.balanceOf(owner.address)).gt(sethBal), true);
  });
});