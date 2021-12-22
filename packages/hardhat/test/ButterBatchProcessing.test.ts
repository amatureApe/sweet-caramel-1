import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import bluebird from "bluebird";
import { expect } from "chai";
import { BigNumber, utils } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ethers, waffle } from "hardhat";
import ButterBatchProcessingAdapter from "../lib/adapters/ButterBatchAdapter";
import { expectRevert } from "../lib/utils/expectValue";
import { MockERC20 } from "../typechain";
import { ButterBatchProcessing } from "../typechain/ButterBatchProcessing";
import { MockBasicIssuanceModule } from "../typechain/MockBasicIssuanceModule";
import { MockCurveMetapool } from "../typechain/MockCurveMetapool";
import { MockYearnV2Vault } from "../typechain/MockYearnV2Vault";

const provider = waffle.provider;

interface Contracts {
  mock3Crv: MockERC20;
  mockPop: MockERC20;
  mockCrvUSDX: MockERC20;
  mockCrvUST: MockERC20;
  mockSetToken: MockERC20;
  mockYearnVaultUSDX: MockYearnV2Vault;
  mockYearnVaultUST: MockYearnV2Vault;
  mockCurveMetapoolUSDX: MockCurveMetapool;
  mockCurveMetapoolUST: MockCurveMetapool;
  mockBasicIssuanceModule: MockBasicIssuanceModule;
  butterBatchProcessing: ButterBatchProcessing;
}

enum BatchType {
  Mint,
  Redeem,
}

const DAY = 60 * 60 * 24;

const DepositorInitial = parseEther("100000");
let owner: SignerWithAddress,
  depositor: SignerWithAddress,
  depositor1: SignerWithAddress,
  depositor2: SignerWithAddress,
  depositor3: SignerWithAddress,
  zapper: SignerWithAddress;
let contracts: Contracts;

async function deployContracts(): Promise<Contracts> {
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mock3Crv = await (
    await MockERC20.deploy("3Crv", "3Crv", 18)
  ).deployed();
  const mockBasicCoin = await (
    await MockERC20.deploy("Basic", "Basic", 18)
  ).deployed();
  const mockPop = await (await MockERC20.deploy("POP", "POP", 18)).deployed();
  await mock3Crv.mint(depositor.address, DepositorInitial);
  await mock3Crv.mint(depositor1.address, DepositorInitial);
  await mock3Crv.mint(depositor2.address, DepositorInitial);
  await mock3Crv.mint(depositor3.address, DepositorInitial);

  const mockCrvUSDX = await (
    await MockERC20.deploy("crvUSDX", "crvUSDX", 18)
  ).deployed();
  const mockCrvUST = await (
    await MockERC20.deploy("crvUST", "crvUST", 18)
  ).deployed();
  const mockSetToken = await await MockERC20.deploy("setToken", "setToken", 18);

  const MockYearnV2Vault = await ethers.getContractFactory("MockYearnV2Vault");
  const mockYearnVaultUSDX = (await (
    await MockYearnV2Vault.deploy(mockCrvUSDX.address)
  ).deployed()) as MockYearnV2Vault;
  const mockYearnVaultUST = (await (
    await MockYearnV2Vault.deploy(mockCrvUST.address)
  ).deployed()) as MockYearnV2Vault;

  const MockCurveMetapool = await ethers.getContractFactory(
    "MockCurveMetapool"
  );

  //Besides crvUSDX and 3Crv no coins are needed in this test which is why i used the same token in the other places
  const mockCurveMetapoolUSDX = (await (
    await MockCurveMetapool.deploy(
      mockBasicCoin.address,
      mockCrvUSDX.address,
      mock3Crv.address,
      mockBasicCoin.address,
      mockBasicCoin.address,
      mockBasicCoin.address
    )
  ).deployed()) as MockCurveMetapool;
  const mockCurveMetapoolUST = (await (
    await MockCurveMetapool.deploy(
      mockBasicCoin.address,
      mockCrvUST.address,
      mock3Crv.address,
      mockBasicCoin.address,
      mockBasicCoin.address,
      mockBasicCoin.address
    )
  ).deployed()) as MockCurveMetapool;

  const mockBasicIssuanceModule = (await (
    await (
      await ethers.getContractFactory("MockBasicIssuanceModule")
    ).deploy([mockYearnVaultUSDX.address, mockYearnVaultUST.address], [50, 50])
  ).deployed()) as MockBasicIssuanceModule;

  const aclRegistry = await (
    await (await ethers.getContractFactory("ACLRegistry")).deploy()
  ).deployed();

  const contractRegistry = await (
    await (
      await ethers.getContractFactory("ContractRegistry")
    ).deploy(aclRegistry.address)
  ).deployed();

  const keeperIncentive = await (
    await (
      await ethers.getContractFactory("KeeperIncentive")
    ).deploy(contractRegistry.address, 0, 0)
  ).deployed();

  const staking = await (
    await (
      await ethers.getContractFactory("Staking")
    ).deploy(mockPop.address, mockPop.address, mockBasicCoin.address)
  ).deployed();

  const butterBatchProcessing = (await (
    await (
      await ethers.getContractFactory("ButterBatchProcessing")
    ).deploy(
      contractRegistry.address,
      mockSetToken.address,
      mock3Crv.address,
      mockBasicIssuanceModule.address,
      [mockYearnVaultUSDX.address, mockYearnVaultUST.address],
      [
        {
          curveMetaPool: mockCurveMetapoolUSDX.address,
          crvLPToken: mockCrvUSDX.address,
        },
        {
          curveMetaPool: mockCurveMetapoolUST.address,
          crvLPToken: mockCrvUST.address,
        },
      ],
      1800,
      parseEther("20000"),
      parseEther("200")
    )
  ).deployed()) as ButterBatchProcessing;

  await aclRegistry.grantRole(ethers.utils.id("DAO"), owner.address);
  await aclRegistry.grantRole(ethers.utils.id("Keeper"), owner.address);

  await contractRegistry
    .connect(owner)
    .addContract(ethers.utils.id("POP"), mockPop.address, ethers.utils.id("1"));
  await contractRegistry
    .connect(owner)
    .addContract(
      ethers.utils.id("KeeperIncentive"),
      keeperIncentive.address,
      ethers.utils.id("1")
    );
  await contractRegistry
    .connect(owner)
    .addContract(
      ethers.utils.id("Staking"),
      staking.address,
      ethers.utils.id("1")
    );

  await keeperIncentive
    .connect(owner)
    .createIncentive(
      utils.formatBytes32String("ButterBatchProcessing"),
      0,
      true,
      false
    );

  await keeperIncentive
    .connect(owner)
    .createIncentive(
      utils.formatBytes32String("ButterBatchProcessing"),
      0,
      true,
      false
    );

  await keeperIncentive
    .connect(owner)
    .addControllerContract(
      utils.formatBytes32String("ButterBatchProcessing"),
      butterBatchProcessing.address
    );

  return {
    mock3Crv,
    mockPop,
    mockCrvUSDX,
    mockCrvUST,
    mockSetToken,
    mockYearnVaultUSDX,
    mockYearnVaultUST,
    mockCurveMetapoolUSDX,
    mockCurveMetapoolUST,
    mockBasicIssuanceModule,
    butterBatchProcessing,
  };
}

const timeTravel = async (time: number) => {
  await provider.send("evm_increaseTime", [time]);
  await provider.send("evm_mine", []);
};

const deployAndAssignContracts = async () => {
  [owner, depositor, depositor1, depositor2, depositor3, zapper] =
    await ethers.getSigners();
  contracts = await deployContracts();
  await contracts.mock3Crv
    .connect(depositor)
    .approve(contracts.butterBatchProcessing.address, parseEther("100000000"));
};

describe("ButterBatchProcessing", function () {
  beforeEach(async function () {
    await deployAndAssignContracts();
  });
  context("setters and getters", () => {
    describe("setCurvePoolTokenPairs", () => {
      it("sets curve pool token pairs", async () => {
        const YUST_TOKEN_ADDRESS = "0x1c6a9783f812b3af3abbf7de64c3cd7cc7d1af44";
        const UST_METAPOOL_ADDRESS =
          "0x890f4e345B1dAED0367A877a1612f86A1f86985f";
        const CRV_UST_TOKEN_ADDRESS =
          "0x94e131324b6054c0D789b190b2dAC504e4361b53";
        await contracts.butterBatchProcessing
          .connect(owner)
          .setCurvePoolTokenPairs(
            [YUST_TOKEN_ADDRESS],
            [
              {
                curveMetaPool: UST_METAPOOL_ADDRESS,
                crvLPToken: CRV_UST_TOKEN_ADDRESS,
              },
            ]
          );
        expect(
          await contracts.butterBatchProcessing.curvePoolTokenPairs(
            YUST_TOKEN_ADDRESS
          )
        ).to.deep.eq([UST_METAPOOL_ADDRESS, CRV_UST_TOKEN_ADDRESS]);
      });
    });
    describe("setBatchCooldown", () => {
      it("sets batch cooldown period", async () => {
        await contracts.butterBatchProcessing.setBatchCooldown(52414);
        expect(await contracts.butterBatchProcessing.batchCooldown()).to.equal(
          BigNumber.from("52414")
        );
      });
      it("should revert if not owner", async function () {
        await expect(
          contracts.butterBatchProcessing
            .connect(depositor)
            .setBatchCooldown(52414)
        ).to.be.revertedWith("you dont have the right role");
      });
    });
    describe("setMintThreshold", () => {
      it("sets mint threshold", async () => {
        await contracts.butterBatchProcessing.setMintThreshold(
          parseEther("100342312")
        );
        expect(await contracts.butterBatchProcessing.mintThreshold()).to.equal(
          parseEther("100342312")
        );
      });
      it("should revert if not owner", async function () {
        await expect(
          contracts.butterBatchProcessing
            .connect(depositor)
            .setMintThreshold(parseEther("100342312"))
        ).to.be.revertedWith("you dont have the right role");
      });
    });
    describe("setRedeemThreshold", () => {
      it("sets redeem threshold", async () => {
        await contracts.butterBatchProcessing.setRedeemThreshold(
          parseEther("100342312")
        );
        expect(
          await contracts.butterBatchProcessing.redeemThreshold()
        ).to.equal(parseEther("100342312"));
      });
      it("should revert if not owner", async function () {
        await expect(
          contracts.butterBatchProcessing
            .connect(depositor)
            .setRedeemThreshold(parseEther("100342312"))
        ).to.be.revertedWith("you dont have the right role");
      });
    });
  });
  context("batch generation", () => {
    describe("mint batch generation", () => {
      it("should set a non-zero batchId when initialized", async () => {
        const batchId0 = await contracts.butterBatchProcessing.batchIds(0);
        const adapter = new ButterBatchProcessingAdapter(
          contracts.butterBatchProcessing
        );
        const batch = await adapter.getBatch(batchId0);
        expect(
          batch.batchId.match(
            /0x.+[^0x0000000000000000000000000000000000000000000000000000000000000000]/
          )?.length
        ).equal(1);
      });
      it("should set batch struct properties when the contract is deployed", async () => {
        const batchId0 = await contracts.butterBatchProcessing.batchIds(0);
        const adapter = new ButterBatchProcessingAdapter(
          contracts.butterBatchProcessing
        );
        const batch = await adapter.getBatch(batchId0);
        expect(batch).to.deep.contain({
          batchType: BatchType.Mint,
          claimable: false,
          claimableTokenAddress: contracts.mockSetToken.address,
          suppliedTokenAddress: contracts.mock3Crv.address,
        });
        expect(batch.claimableTokenBalance).to.equal(BigNumber.from(0));
        expect(batch.unclaimedShares).to.equal(BigNumber.from(0));
        expect(batch.suppliedTokenBalance).to.equal(BigNumber.from(0));
      });
    });
    describe("redeem batch generation", () => {
      it("should set a non-zero batchId when initialized", async () => {
        const batchId1 = await contracts.butterBatchProcessing.batchIds(1);
        const adapter = new ButterBatchProcessingAdapter(
          contracts.butterBatchProcessing
        );
        const batch = await adapter.getBatch(batchId1);
        expect(
          batch.batchId.match(
            /0x.+[^0x0000000000000000000000000000000000000000000000000000000000000000]/
          )?.length
        ).equal(1);
      });
      it("should set batch struct properties when the contract is deployed", async () => {
        const batchId1 = await contracts.butterBatchProcessing.batchIds(1);
        const adapter = new ButterBatchProcessingAdapter(
          contracts.butterBatchProcessing
        );
        const batch = await adapter.getBatch(batchId1);

        expect(batch).to.deep.contain({
          batchType: BatchType.Redeem,
          claimable: false,
          claimableTokenAddress: contracts.mock3Crv.address,
          suppliedTokenAddress: contracts.mockSetToken.address,
        });
        expect(batch.claimableTokenBalance).to.equal(BigNumber.from(0));
        expect(batch.unclaimedShares).to.equal(BigNumber.from(0));
        expect(batch.suppliedTokenBalance).to.equal(BigNumber.from(0));
      });
    });
  });
  describe("minting", function () {
    context("depositing", function () {
      describe("batch struct", () => {
        const deposit = async (amount?: number) => {
          await contracts.butterBatchProcessing
            .connect(depositor)
            .depositForMint(
              parseEther(amount ? amount.toString() : "10"),
              depositor.address
            );
        };

        const subject = async (batchId) => {
          const adapter = new ButterBatchProcessingAdapter(
            contracts.butterBatchProcessing
          );
          const batch = await adapter.getBatch(batchId);
          return batch;
        };

        it("increments suppliedTokenBalance and unclaimedShares with deposit", async () => {
          const batchId =
            await contracts.butterBatchProcessing.currentMintBatchId();
          await deposit(10);
          expect(await subject(batchId)).to.deep.contain({
            suppliedTokenBalance: parseEther("10"),
            unclaimedShares: parseEther("10"),
          });
        });
        it("depositing does not make a batch claimable", async () => {
          const batchId =
            await contracts.butterBatchProcessing.currentMintBatchId();
          await deposit(10);
          expect(await subject(batchId)).to.deep.contain({
            claimable: false,
          });
        });
        it("increments suppliedTokenBalance and unclaimedShares when multiple deposits are made", async () => {
          const batchId =
            await contracts.butterBatchProcessing.currentMintBatchId();
          await deposit(); // 10
          await deposit(); // 10
          await deposit(); // 10
          expect(await subject(batchId)).to.deep.contain({
            claimableTokenBalance: parseEther("0"),
            suppliedTokenBalance: parseEther("30"),
            unclaimedShares: parseEther("30"),
          });
        });
        it("increments claimableTokenBalance when batch is minted", async () => {
          const batchId =
            await contracts.butterBatchProcessing.currentMintBatchId();
          await deposit(); // 10
          await timeTravel(1 * DAY); // wait enough time to mint batch
          await contracts.butterBatchProcessing.batchMint(0);
          const batchHysiOwned = await contracts.mockSetToken.balanceOf(
            contracts.butterBatchProcessing.address
          );
          expect(await subject(batchId)).to.deep.contain({
            claimableTokenBalance: batchHysiOwned,
            suppliedTokenBalance: parseEther("10"),
            unclaimedShares: parseEther("10"),
          });
        });
        it("sets batch to claimable when batch is minted", async () => {
          const batchId =
            await contracts.butterBatchProcessing.currentMintBatchId();
          await deposit(); // 10
          await timeTravel(1 * DAY); // wait enough time to mint batch
          await contracts.butterBatchProcessing.batchMint(0);
          expect(await subject(batchId)).to.deep.contain({
            claimable: true,
          });
        });
        it("decrements unclaimedShares and claimable when claim is made", async () => {
          const batchId =
            await contracts.butterBatchProcessing.currentMintBatchId();
          await deposit(); // 10
          await timeTravel(1 * DAY); // wait enough time to mint batch
          await contracts.butterBatchProcessing.batchMint(0);
          await contracts.butterBatchProcessing
            .connect(depositor)
            .claim(batchId, depositor.address);

          expect(await subject(batchId)).to.deep.contain({
            claimable: true,
            unclaimedShares: parseEther("0"),
            claimableTokenBalance: parseEther("0"),
          });
        });
      });

      it("deposits 3crv in the current mintBatch", async function () {
        const result = await contracts.butterBatchProcessing
          .connect(depositor)
          .depositForMint(parseEther("10000"), depositor.address);
        expect(result)
          .to.emit(contracts.butterBatchProcessing, "Deposit")
          .withArgs(depositor.address, parseEther("10000"));
        expect(
          await contracts.mock3Crv.balanceOf(
            contracts.butterBatchProcessing.address
          )
        ).to.equal(parseEther("10000"));
        const currentMintBatchId =
          await contracts.butterBatchProcessing.currentMintBatchId();
        const currentBatch = await contracts.butterBatchProcessing.batches(
          currentMintBatchId
        );
        expect(currentBatch.suppliedTokenBalance).to.equal(parseEther("10000"));
        expect(currentBatch.unclaimedShares).to.equal(parseEther("10000"));
      });
      it("adds the mintBatch to the users batches", async function () {
        await contracts.mock3Crv
          .connect(depositor)
          .approve(
            contracts.butterBatchProcessing.address,
            parseEther("10000")
          );
        await contracts.butterBatchProcessing
          .connect(depositor)
          .depositForMint(parseEther("10000"), depositor.address);

        const currentMintBatchId =
          await contracts.butterBatchProcessing.currentMintBatchId();
        expect(
          await contracts.butterBatchProcessing.accountBatches(
            depositor.address,
            0
          )
        ).to.equal(currentMintBatchId);
      });
      it("allows multiple deposits", async function () {
        await contracts.mock3Crv
          .connect(depositor)
          .approve(
            contracts.butterBatchProcessing.address,
            parseEther("10000")
          );
        await contracts.butterBatchProcessing
          .connect(depositor)
          .depositForMint(parseEther("10000"), depositor.address);
        await contracts.mock3Crv
          .connect(depositor1)
          .approve(
            contracts.butterBatchProcessing.address,
            parseEther("10000")
          );
        await contracts.butterBatchProcessing
          .connect(depositor1)
          .depositForMint(parseEther("10000"), depositor1.address);
        await contracts.mock3Crv
          .connect(depositor2)
          .approve(
            contracts.butterBatchProcessing.address,
            parseEther("10000")
          );
        await contracts.butterBatchProcessing
          .connect(depositor2)
          .depositForMint(parseEther("5000"), depositor2.address);
        await contracts.butterBatchProcessing
          .connect(depositor2)
          .depositForMint(parseEther("5000"), depositor2.address);
        const currentMintBatchId =
          await contracts.butterBatchProcessing.currentMintBatchId();
        const currentBatch = await contracts.butterBatchProcessing.batches(
          currentMintBatchId
        );
        expect(currentBatch.suppliedTokenBalance).to.equal(parseEther("30000"));
        expect(currentBatch.unclaimedShares).to.equal(parseEther("30000"));
        expect(
          await contracts.butterBatchProcessing.accountBatches(
            depositor.address,
            0
          )
        ).to.equal(currentMintBatchId);
        expect(
          await contracts.butterBatchProcessing.accountBatches(
            depositor1.address,
            0
          )
        ).to.equal(currentMintBatchId);
        expect(
          await contracts.butterBatchProcessing.accountBatches(
            depositor2.address,
            0
          )
        ).to.equal(currentMintBatchId);
      });
    });
    context("batch minting", function () {
      context("reverts", function () {
        it("reverts when minting too early", async function () {
          await contracts.mock3Crv
            .connect(depositor)
            .approve(
              contracts.butterBatchProcessing.address,
              parseEther("10000")
            );
          await contracts.butterBatchProcessing
            .connect(depositor)
            .depositForMint(parseEther("10000"), depositor.address);
          await expect(
            contracts.butterBatchProcessing.connect(owner).batchMint(0)
          ).to.be.revertedWith("can not execute batch action yet");
        });
        it("reverts when called by someone other the keeper", async function () {
          await contracts.mock3Crv
            .connect(depositor)
            .approve(
              contracts.butterBatchProcessing.address,
              parseEther("10000")
            );
          await contracts.butterBatchProcessing
            .connect(depositor)
            .depositForMint(parseEther("10000"), depositor.address);
          await provider.send("evm_increaseTime", [1800]);

          await expect(
            contracts.butterBatchProcessing.connect(depositor).batchMint(0)
          ).to.be.revertedWith("you dont have the right role");
        });
      });
      context("success", function () {
        it("batch mints", async function () {
          const batchId =
            await contracts.butterBatchProcessing.currentMintBatchId();

          await contracts.mock3Crv
            .connect(depositor)
            .approve(
              contracts.butterBatchProcessing.address,
              parseEther("10000")
            );
          await contracts.butterBatchProcessing
            .connect(depositor)
            .depositForMint(parseEther("10000"), depositor.address);
          await provider.send("evm_increaseTime", [1800]);
          const result = await contracts.butterBatchProcessing
            .connect(owner)
            .batchMint(0);
          expect(result)
            .to.emit(contracts.butterBatchProcessing, "BatchMinted")
            .withArgs(batchId, parseEther("10000"), parseEther("100"));
          expect(
            await contracts.mockSetToken.balanceOf(
              contracts.butterBatchProcessing.address
            )
          ).to.equal(parseEther("100"));
        });
        it("mints early when mintThreshold is met", async function () {
          await contracts.mock3Crv
            .connect(depositor)
            .approve(
              contracts.butterBatchProcessing.address,
              parseEther("10000")
            );
          await contracts.butterBatchProcessing
            .connect(depositor)
            .depositForMint(parseEther("10000"), depositor.address);
          await contracts.mock3Crv
            .connect(depositor1)
            .approve(
              contracts.butterBatchProcessing.address,
              parseEther("10000")
            );
          await contracts.butterBatchProcessing
            .connect(depositor1)
            .depositForMint(parseEther("10000"), depositor1.address);
          await expect(
            contracts.butterBatchProcessing.connect(owner).batchMint(0)
          ).to.emit(contracts.butterBatchProcessing, "BatchMinted");
        });
        it("advances to the next batch", async function () {
          await contracts.mock3Crv
            .connect(depositor)
            .approve(
              contracts.butterBatchProcessing.address,
              parseEther("10000")
            );
          await contracts.butterBatchProcessing
            .connect(depositor)
            .depositForMint(parseEther("10000"), depositor.address);
          await provider.send("evm_increaseTime", [1800]);

          const previousMintBatchId =
            await contracts.butterBatchProcessing.currentMintBatchId();
          await contracts.butterBatchProcessing.batchMint(0);

          const previousBatch = await contracts.butterBatchProcessing.batches(
            previousMintBatchId
          );
          expect(previousBatch.claimable).to.equal(true);

          const currentMintBatchId =
            await contracts.butterBatchProcessing.currentMintBatchId();
          expect(currentMintBatchId).to.not.equal(previousMintBatchId);
        });
      });
    });
    context("claiming", function () {
      beforeEach(async function () {
        await contracts.mock3Crv
          .connect(depositor)
          .approve(
            contracts.butterBatchProcessing.address,
            parseEther("10000")
          );
        await contracts.butterBatchProcessing
          .connect(depositor)
          .depositForMint(parseEther("10000"), depositor.address);
        await contracts.mock3Crv
          .connect(depositor1)
          .approve(
            contracts.butterBatchProcessing.address,
            parseEther("10000")
          );
        await contracts.butterBatchProcessing
          .connect(depositor1)
          .depositForMint(parseEther("10000"), depositor1.address);
        await contracts.mock3Crv
          .connect(depositor2)
          .approve(
            contracts.butterBatchProcessing.address,
            parseEther("10000")
          );
        await contracts.butterBatchProcessing
          .connect(depositor2)
          .depositForMint(parseEther("10000"), depositor2.address);
        await contracts.mock3Crv
          .connect(depositor3)
          .approve(
            contracts.butterBatchProcessing.address,
            parseEther("10000")
          );
        await contracts.butterBatchProcessing
          .connect(depositor3)
          .depositForMint(parseEther("10000"), depositor3.address);
      });
      it("reverts when batch is not yet claimable", async function () {
        const batchId = await contracts.butterBatchProcessing.accountBatches(
          depositor.address,
          0
        );
        await expect(
          contracts.butterBatchProcessing
            .connect(depositor)
            .claim(batchId, depositor.address)
        ).to.be.revertedWith("not yet claimable");
      });
      it("claims batch successfully", async function () {
        await provider.send("evm_increaseTime", [1800]);
        await provider.send("evm_mine", []);
        await contracts.butterBatchProcessing.connect(owner).batchMint(0);
        const batchId = await contracts.butterBatchProcessing.accountBatches(
          depositor.address,
          0
        );
        expect(
          await contracts.butterBatchProcessing
            .connect(depositor)
            .claim(batchId, depositor.address)
        )
          .to.emit(contracts.butterBatchProcessing, "Claimed")
          .withArgs(
            depositor.address,
            BatchType.Mint,
            parseEther("10000"),
            parseEther("100")
          );
        expect(
          await contracts.mockSetToken.balanceOf(depositor.address)
        ).to.equal(parseEther("100"));
        const batch = await contracts.butterBatchProcessing.batches(batchId);
        expect(batch.unclaimedShares).to.equal(parseEther("30000"));
        expect(batch.claimableTokenBalance).to.equal(parseEther("300"));
      });
    });
  });

  describe("redeeming", function () {
    beforeEach(async function () {
      await contracts.mockSetToken.mint(depositor.address, parseEther("100"));
      await contracts.mockSetToken.mint(depositor1.address, parseEther("100"));
      await contracts.mockSetToken.mint(depositor2.address, parseEther("100"));
      await contracts.mockSetToken.mint(depositor3.address, parseEther("100"));
      await contracts.mockYearnVaultUSDX.mint(
        contracts.mockBasicIssuanceModule.address,
        parseEther("20000")
      );
      await contracts.mockYearnVaultUST.mint(
        contracts.mockBasicIssuanceModule.address,
        parseEther("20000")
      );
      await contracts.mockSetToken
        .connect(depositor)
        .increaseAllowance(
          contracts.butterBatchProcessing.address,
          parseEther("10000000000")
        );
    });
    context("depositing", function () {
      describe("batch struct", () => {
        const deposit = async (amount?: number) => {
          await contracts.butterBatchProcessing
            .connect(depositor)
            .depositForRedeem(parseEther(amount ? amount.toString() : "10"));
        };

        const subject = async (batchId) => {
          const adapter = new ButterBatchProcessingAdapter(
            contracts.butterBatchProcessing
          );
          const batch = await adapter.getBatch(batchId);
          return batch;
        };

        it("increments suppliedTokenBalance and unclaimedShares when a redeem deposit is made", async () => {
          const batchId =
            await contracts.butterBatchProcessing.currentRedeemBatchId();
          await deposit(10);
          const batch = await subject(batchId);
          expect(batch).to.deep.contain({
            suppliedTokenBalance: parseEther("10"),
            claimable: false,
            unclaimedShares: parseEther("10"),
          });
        });
        it("increments suppliedTokenBalance and unclaimedShares when multiple deposits are made", async () => {
          const batchId =
            await contracts.butterBatchProcessing.currentRedeemBatchId();
          await deposit(); // 10
          await deposit(); // 10
          await deposit(); // 10
          expect(await subject(batchId)).to.deep.contain({
            claimableTokenBalance: parseEther("0"),
            suppliedTokenBalance: parseEther("30"),
            claimable: false,
            unclaimedShares: parseEther("30"),
          });
        });
        it("updates struct when batch is minted", async () => {
          const batchId =
            await contracts.butterBatchProcessing.currentRedeemBatchId();
          await deposit(); // 10
          await timeTravel(1 * DAY); // wait enough time to redeem batch
          await contracts.butterBatchProcessing.batchRedeem(0);

          expect(await subject(batchId)).to.deep.contain({
            suppliedTokenBalance: parseEther("10"),
            claimable: true,
            unclaimedShares: parseEther("10"),
          });
        });
        it("decrements unclaimedShares and claimable when claim is made", async () => {
          const batchId =
            await contracts.butterBatchProcessing.currentRedeemBatchId();
          await deposit(); // 10
          await timeTravel(1 * DAY); // wait enough time to redeem batch
          await contracts.butterBatchProcessing.batchRedeem(0);
          await contracts.butterBatchProcessing
            .connect(depositor)
            .claim(batchId, depositor.address);

          expect(await subject(batchId)).to.deep.contain({
            claimable: true,
            unclaimedShares: parseEther("0"),
            claimableTokenBalance: parseEther("0"),
          });
        });
      });
      it("deposits setToken in the current redeemBatch", async function () {
        await contracts.mockSetToken
          .connect(depositor)
          .approve(contracts.butterBatchProcessing.address, parseEther("100"));
        const result = await contracts.butterBatchProcessing
          .connect(depositor)
          .depositForRedeem(parseEther("100"));
        expect(result)
          .to.emit(contracts.butterBatchProcessing, "Deposit")
          .withArgs(depositor.address, parseEther("100"));
        expect(
          await contracts.mockSetToken.balanceOf(
            contracts.butterBatchProcessing.address
          )
        ).to.equal(parseEther("100"));
        const currentRedeemBatchId =
          await contracts.butterBatchProcessing.currentRedeemBatchId();
        const currentBatch = await contracts.butterBatchProcessing.batches(
          currentRedeemBatchId
        );
        expect(currentBatch.suppliedTokenBalance).to.equal(parseEther("100"));
        expect(currentBatch.unclaimedShares).to.equal(parseEther("100"));
      });
      it("adds the redeemBatch to the users batches", async function () {
        await contracts.mockSetToken
          .connect(depositor)
          .approve(contracts.butterBatchProcessing.address, parseEther("100"));
        await contracts.butterBatchProcessing
          .connect(depositor)
          .depositForRedeem(parseEther("100"));

        const currentRedeemBatchId =
          await contracts.butterBatchProcessing.currentRedeemBatchId();
        expect(
          await contracts.butterBatchProcessing.accountBatches(
            depositor.address,
            0
          )
        ).to.equal(currentRedeemBatchId);
      });
      it("allows multiple deposits", async function () {
        await contracts.mockSetToken
          .connect(depositor)
          .approve(contracts.butterBatchProcessing.address, parseEther("100"));
        await contracts.butterBatchProcessing
          .connect(depositor)
          .depositForRedeem(parseEther("100"));
        await contracts.mockSetToken
          .connect(depositor1)
          .approve(contracts.butterBatchProcessing.address, parseEther("100"));
        await contracts.butterBatchProcessing
          .connect(depositor1)
          .depositForRedeem(parseEther("100"));
        await contracts.mockSetToken
          .connect(depositor2)
          .approve(contracts.butterBatchProcessing.address, parseEther("100"));
        await contracts.butterBatchProcessing
          .connect(depositor2)
          .depositForRedeem(parseEther("50"));
        await contracts.butterBatchProcessing
          .connect(depositor2)
          .depositForRedeem(parseEther("50"));
        const currentRedeemBatchId =
          await contracts.butterBatchProcessing.currentRedeemBatchId();
        const currentBatch = await contracts.butterBatchProcessing.batches(
          currentRedeemBatchId
        );
        expect(currentBatch.suppliedTokenBalance).to.equal(parseEther("300"));
        expect(currentBatch.unclaimedShares).to.equal(parseEther("300"));
        expect(
          await contracts.butterBatchProcessing.accountBatches(
            depositor.address,
            0
          )
        ).to.equal(currentRedeemBatchId);
        expect(
          await contracts.butterBatchProcessing.accountBatches(
            depositor1.address,
            0
          )
        ).to.equal(currentRedeemBatchId);
        expect(
          await contracts.butterBatchProcessing.accountBatches(
            depositor2.address,
            0
          )
        ).to.equal(currentRedeemBatchId);
      });
    });
    context("batch redeeming", function () {
      beforeEach(async function () {
        await contracts.mockSetToken.mint(depositor.address, parseEther("100"));
        await contracts.mockSetToken.mint(
          depositor1.address,
          parseEther("100")
        );
        await contracts.mockSetToken.mint(
          depositor2.address,
          parseEther("100")
        );
        await contracts.mockSetToken.mint(
          depositor3.address,
          parseEther("100")
        );
        await contracts.mockCrvUSDX.mint(
          contracts.mockYearnVaultUSDX.address,
          parseEther("20000")
        );
        await contracts.mockCrvUST.mint(
          contracts.mockYearnVaultUST.address,
          parseEther("20000")
        );
      });

      context("reverts", function () {
        it("reverts when redeeming too early", async function () {
          await contracts.mockSetToken
            .connect(depositor)
            .approve(
              contracts.butterBatchProcessing.address,
              parseEther("100")
            );
          await contracts.butterBatchProcessing
            .connect(depositor)
            .depositForRedeem(parseEther("100"));
          await expect(
            contracts.butterBatchProcessing.connect(owner).batchRedeem(0)
          ).to.be.revertedWith("can not execute batch action yet");
        });
        it("reverts when called by someone other the keeper", async function () {
          await contracts.mockSetToken
            .connect(depositor)
            .approve(
              contracts.butterBatchProcessing.address,
              parseEther("100")
            );
          await contracts.butterBatchProcessing
            .connect(depositor)
            .depositForRedeem(parseEther("100"));
          await provider.send("evm_increaseTime", [1800]);

          await expect(
            contracts.butterBatchProcessing.connect(depositor).batchRedeem(0)
          ).to.be.revertedWith("you dont have the right role");
        });
      });
      context("success", function () {
        it("batch redeems", async function () {
          const batchId =
            await contracts.butterBatchProcessing.currentRedeemBatchId();

          await contracts.mockSetToken
            .connect(depositor)
            .approve(
              contracts.butterBatchProcessing.address,
              parseEther("100")
            );
          await contracts.butterBatchProcessing
            .connect(depositor)
            .depositForRedeem(parseEther("100"));
          await provider.send("evm_increaseTime", [1800]);

          const result = await contracts.butterBatchProcessing
            .connect(owner)
            .batchRedeem(0);
          expect(result)
            .to.emit(contracts.butterBatchProcessing, "BatchRedeemed")
            .withArgs(batchId, parseEther("100"), parseEther("9990"));
          expect(
            await contracts.mock3Crv.balanceOf(
              contracts.butterBatchProcessing.address
            )
          ).to.equal(parseEther("9990"));
        });
        it("mints early when redeemThreshold is met", async function () {
          await contracts.mockSetToken
            .connect(depositor)
            .approve(
              contracts.butterBatchProcessing.address,
              parseEther("100")
            );
          await contracts.butterBatchProcessing
            .connect(depositor)
            .depositForRedeem(parseEther("100"));
          await contracts.mockSetToken
            .connect(depositor1)
            .approve(
              contracts.butterBatchProcessing.address,
              parseEther("100")
            );
          await contracts.butterBatchProcessing
            .connect(depositor1)
            .depositForRedeem(parseEther("100"));
          const result = await contracts.butterBatchProcessing
            .connect(owner)
            .batchRedeem(0);
          expect(result).to.emit(
            contracts.butterBatchProcessing,
            "BatchRedeemed"
          );
        });
        it("advances to the next batch", async function () {
          await contracts.mockSetToken
            .connect(depositor)
            .approve(
              contracts.butterBatchProcessing.address,
              parseEther("100")
            );
          await contracts.butterBatchProcessing
            .connect(depositor)
            .depositForRedeem(parseEther("100"));
          await provider.send("evm_increaseTime", [1800]);

          const previousRedeemBatchId =
            await contracts.butterBatchProcessing.currentRedeemBatchId();
          await contracts.butterBatchProcessing.batchRedeem(0);

          const previousBatch = await contracts.butterBatchProcessing.batches(
            previousRedeemBatchId
          );
          expect(previousBatch.claimable).to.equal(true);

          const currentRedeemBatchId =
            await contracts.butterBatchProcessing.currentRedeemBatchId();
          expect(currentRedeemBatchId).to.not.equal(previousRedeemBatchId);
        });
      });
    });
    context("claiming", function () {
      beforeEach(async function () {
        await contracts.mockSetToken
          .connect(depositor)
          .approve(contracts.butterBatchProcessing.address, parseEther("100"));
        await contracts.butterBatchProcessing
          .connect(depositor)
          .depositForRedeem(parseEther("100"));
        await contracts.mockSetToken
          .connect(depositor1)
          .approve(contracts.butterBatchProcessing.address, parseEther("100"));
        await contracts.butterBatchProcessing
          .connect(depositor1)
          .depositForRedeem(parseEther("100"));
        await contracts.mockSetToken
          .connect(depositor2)
          .approve(contracts.butterBatchProcessing.address, parseEther("100"));
        await contracts.butterBatchProcessing
          .connect(depositor2)
          .depositForRedeem(parseEther("100"));
        await contracts.mockSetToken
          .connect(depositor3)
          .approve(contracts.butterBatchProcessing.address, parseEther("100"));
        await contracts.butterBatchProcessing
          .connect(depositor3)
          .depositForRedeem(parseEther("100"));
        await contracts.mockCrvUSDX.mint(
          contracts.mockYearnVaultUSDX.address,
          parseEther("20000")
        );
        await contracts.mockCrvUST.mint(
          contracts.mockYearnVaultUST.address,
          parseEther("20000")
        );
      });
      it("reverts when batch is not yet claimable", async function () {
        const batchId = await contracts.butterBatchProcessing.accountBatches(
          depositor.address,
          0
        );
        await expect(
          contracts.butterBatchProcessing.claim(batchId, depositor.address)
        ).to.be.revertedWith("not yet claimable");
      });
      it("claim batch successfully", async function () {
        await provider.send("evm_increaseTime", [1800]);
        await contracts.butterBatchProcessing.connect(owner).batchRedeem(0);
        const batchId = await contracts.butterBatchProcessing.accountBatches(
          depositor.address,
          0
        );
        expect(
          await contracts.butterBatchProcessing
            .connect(depositor)
            .claim(batchId, depositor.address)
        )
          .to.emit(contracts.butterBatchProcessing, "Claimed")
          .withArgs(
            depositor.address,
            BatchType.Redeem,
            parseEther("100"),
            parseEther("9990")
          );
        expect(await contracts.mock3Crv.balanceOf(depositor.address)).to.equal(
          parseEther("109990")
        );
        const batch = await contracts.butterBatchProcessing.batches(batchId);
        expect(batch.unclaimedShares).to.equal(parseEther("300"));
      });
    });
  });
  context("withdrawing from batch", function () {
    describe("batch struct", () => {
      const withdraw = async (batchId: string, amount?: BigNumber) => {
        return contracts.butterBatchProcessing
          .connect(depositor)
          .withdrawFromBatch(
            batchId,
            amount ? amount : parseEther("10"),
            depositor.address
          );
      };
      const subject = async (batchId) => {
        const adapter = new ButterBatchProcessingAdapter(
          contracts.butterBatchProcessing
        );
        const batch = await adapter.getBatch(batchId);
        return batch;
      };
      context("redeem batch withdrawal", () => {
        beforeEach(async function () {
          await contracts.mockSetToken.mint(
            depositor.address,
            parseEther("100")
          );
          await contracts.mockSetToken.mint(
            depositor1.address,
            parseEther("100")
          );
          await contracts.mockSetToken.mint(
            depositor2.address,
            parseEther("100")
          );
          await contracts.mockSetToken.mint(
            depositor3.address,
            parseEther("100")
          );
          await contracts.mockYearnVaultUSDX.mint(
            contracts.mockBasicIssuanceModule.address,
            parseEther("20000")
          );
          await contracts.mockYearnVaultUST.mint(
            contracts.mockBasicIssuanceModule.address,
            parseEther("20000")
          );
          await contracts.mockSetToken
            .connect(depositor)
            .increaseAllowance(
              contracts.butterBatchProcessing.address,
              parseEther("10000000000")
            );
          await contracts.mockSetToken
            .connect(owner)
            .mint(depositor.address, parseEther("100"));
          await contracts.mockSetToken
            .connect(depositor)
            .approve(
              contracts.butterBatchProcessing.address,
              parseEther("100")
            );
          await contracts.butterBatchProcessing
            .connect(depositor)
            .depositForRedeem(parseEther("100"));
          await contracts.mockCrvUSDX.mint(
            contracts.mockYearnVaultUSDX.address,
            parseEther("20000")
          );
          await contracts.mockCrvUST.mint(
            contracts.mockYearnVaultUST.address,
            parseEther("20000")
          );
        });

        it("decrements suppliedTokenBalance and unclaimedShares when a withdrawal is made", async () => {
          const batchId =
            await contracts.butterBatchProcessing.currentRedeemBatchId();
          const batchBefore = await subject(batchId);
          await withdraw(batchId);
          const batchAfter = await subject(batchId);
          expect(
            batchAfter.suppliedTokenBalance.lt(batchBefore.suppliedTokenBalance)
          ).to.be.true;
          expect(batchAfter.unclaimedShares.lt(batchBefore.unclaimedShares)).to
            .be.true;
        });
        it("decrements suppliedTokenBalance and unclaimedShares when multiple deposits are made", async () => {
          const batchId =
            await contracts.butterBatchProcessing.currentRedeemBatchId();
          const batchBefore = await subject(batchId);
          await withdraw(batchId, parseEther("10"));
          await withdraw(batchId, parseEther("10"));
          await withdraw(batchId, parseEther("10"));
          const batchAfter = await subject(batchId);
          expect(
            batchBefore.suppliedTokenBalance.sub(parseEther("30"))
          ).to.equal(batchAfter.suppliedTokenBalance);
          expect(batchBefore.unclaimedShares.sub(parseEther("30"))).to.equal(
            batchAfter.unclaimedShares
          );
        });
        it("transfers set token to depositor after withdraw", async function () {
          const batchId = await contracts.butterBatchProcessing.accountBatches(
            depositor.address,
            0
          );
          await contracts.butterBatchProcessing
            .connect(depositor)
            .withdrawFromBatch(batchId, parseEther("100"), depositor.address);
          expect(
            await contracts.mockSetToken.balanceOf(depositor.address)
          ).to.equal(parseEther("200"));
        });
        it("reverts when the batch was already redeemed", async function () {
          const batchId = await contracts.butterBatchProcessing.accountBatches(
            depositor.address,
            0
          );
          await timeTravel(1 * DAY);
          await contracts.butterBatchProcessing.batchRedeem(0);
          await expect(withdraw(batchId)).to.be.revertedWith(
            "already processed"
          );
        });
      });
      context("mint batch withdrawal", () => {
        beforeEach(async function () {
          await contracts.butterBatchProcessing
            .connect(depositor)
            .depositForMint(parseEther("100"), depositor.address);
        });
        it("decrements suppliedTokenBalance and unclaimedShares when a withdrawal is made", async () => {
          const batchId =
            await contracts.butterBatchProcessing.currentMintBatchId();
          const batchBefore = await subject(batchId);
          await withdraw(batchId, parseEther("10"));
          const batchAfter = await subject(batchId);
          expect(
            batchAfter.suppliedTokenBalance.lt(batchBefore.suppliedTokenBalance)
          ).to.be.true;
          expect(batchAfter.unclaimedShares.lt(batchBefore.unclaimedShares)).to
            .be.true;
        });
        it("decrements suppliedTokenBalance and unclaimedShares when multiple deposits are made", async () => {
          const batchId =
            await contracts.butterBatchProcessing.currentMintBatchId();
          const batchBefore = await subject(batchId);
          await withdraw(batchId, parseEther("10"));
          await withdraw(batchId, parseEther("10"));
          await withdraw(batchId, parseEther("10"));
          const batchAfter = await subject(batchId);
          expect(
            batchBefore.suppliedTokenBalance.sub(parseEther("30"))
          ).to.equal(batchAfter.suppliedTokenBalance);
          expect(batchBefore.unclaimedShares.sub(parseEther("30"))).to.equal(
            batchAfter.unclaimedShares
          );
        });
        it("emits an event when withdrawn", async function () {
          const batchId = await contracts.butterBatchProcessing.accountBatches(
            depositor.address,
            0
          );
          expect(await withdraw(batchId, parseEther("100")))
            .to.emit(contracts.butterBatchProcessing, "WithdrawnFromBatch")
            .withArgs(batchId, parseEther("100"), depositor.address);
        });
        it("transfers 3crv to depositor after withdraw", async function () {
          const batchId = await contracts.butterBatchProcessing.accountBatches(
            depositor.address,
            0
          );
          const balanceBefore = await contracts.mock3Crv.balanceOf(
            depositor.address
          );
          await contracts.butterBatchProcessing
            .connect(depositor)
            .withdrawFromBatch(batchId, parseEther("100"), depositor.address);
          const balanceAfter = await contracts.mock3Crv.balanceOf(
            depositor.address
          );
          expect(balanceAfter.sub(balanceBefore)).to.equal(parseEther("100"));
        });
        it("reverts when the batch was already minted", async function () {
          const batchId = await contracts.butterBatchProcessing.accountBatches(
            depositor.address,
            0
          );
          await timeTravel(1 * DAY);
          await contracts.butterBatchProcessing.batchMint(0);
          await expect(withdraw(batchId)).to.be.revertedWith(
            "already processed"
          );
        });
      });
    });
  });
  context("moveUnclaimedDepositsIntoCurrentBatch", function () {
    context("error", function () {
      it("reverts when length of batchIds and shares are not matching", async function () {
        await expect(
          contracts.butterBatchProcessing
            .connect(depositor)
            .moveUnclaimedDepositsIntoCurrentBatch(
              new Array(2).fill(
                "0xa15f699e141c27ed0edace41ff8fa7b836e3ddb658b25c811a1674e9c7a75c5c"
              ),
              new Array(3).fill(parseEther("10")),
              BatchType.Mint
            )
        ).to.be.revertedWith("array lengths must match");
      });
      it("reverts if given a batch that is not from the correct batchType", async function () {
        await contracts.mock3Crv
          .connect(depositor)
          .approve(
            contracts.butterBatchProcessing.address,
            parseEther("10000")
          );
        await contracts.butterBatchProcessing
          .connect(depositor)
          .depositForMint(parseEther("10000"), depositor.address);

        await provider.send("evm_increaseTime", [1800]);
        await provider.send("evm_mine", []);
        await contracts.butterBatchProcessing.connect(owner).batchMint(0);
        const batchId = await contracts.butterBatchProcessing.accountBatches(
          depositor.address,
          0
        );
        await expect(
          contracts.butterBatchProcessing.moveUnclaimedDepositsIntoCurrentBatch(
            [batchId],
            [parseEther("10000")],
            BatchType.Redeem
          )
        ).to.be.revertedWith("incorrect batchType");
      });
      it("reverts on an unclaimable batch", async function () {
        await contracts.mock3Crv
          .connect(depositor)
          .approve(
            contracts.butterBatchProcessing.address,
            parseEther("10000")
          );
        await contracts.butterBatchProcessing
          .connect(depositor)
          .depositForMint(parseEther("10000"), depositor.address);
        const batchId = await contracts.butterBatchProcessing.accountBatches(
          depositor.address,
          0
        );
        await expect(
          contracts.butterBatchProcessing.moveUnclaimedDepositsIntoCurrentBatch(
            [batchId],
            [parseEther("10000")],
            BatchType.Mint
          )
        ).to.be.revertedWith("has not yet been processed");
      });
      it("reverts if the user has insufficient funds", async function () {
        await contracts.mock3Crv
          .connect(depositor)
          .approve(
            contracts.butterBatchProcessing.address,
            parseEther("10000")
          );
        await contracts.butterBatchProcessing
          .connect(depositor)
          .depositForMint(parseEther("10000"), depositor.address);
        const batchId = await contracts.butterBatchProcessing.accountBatches(
          depositor.address,
          0
        );
        await provider.send("evm_increaseTime", [2500]);
        await provider.send("evm_mine", []);
        await contracts.butterBatchProcessing.batchMint(0);
        await expect(
          contracts.butterBatchProcessing.moveUnclaimedDepositsIntoCurrentBatch(
            [batchId],
            [parseEther("20000")],
            BatchType.Mint
          )
        ).to.be.revertedWith("account has insufficient funds");
      });
    });
    context("success", function () {
      it("moves hysi into current redeemBatch", async function () {
        await contracts.mock3Crv
          .connect(depositor)
          .approve(
            contracts.butterBatchProcessing.address,
            parseEther("10000")
          );
        await contracts.butterBatchProcessing
          .connect(depositor)
          .depositForMint(parseEther("10000"), depositor.address);
        const batchId = await contracts.butterBatchProcessing.accountBatches(
          depositor.address,
          0
        );
        await provider.send("evm_increaseTime", [1800]);
        await provider.send("evm_mine", []);
        await contracts.butterBatchProcessing.connect(owner).batchMint(0);
        const mintedHYSI = await contracts.mockSetToken.balanceOf(
          contracts.butterBatchProcessing.address
        );
        expect(
          await contracts.butterBatchProcessing
            .connect(depositor)
            .moveUnclaimedDepositsIntoCurrentBatch(
              [batchId],
              [parseEther("10000")],
              BatchType.Mint
            )
        )
          .to.emit(
            contracts.butterBatchProcessing,
            "MovedUnclaimedDepositsIntoCurrentBatch"
          )
          .withArgs(mintedHYSI, BatchType.Mint, depositor.address);
        const currentRedeemBatchId =
          await contracts.butterBatchProcessing.currentRedeemBatchId();
        const redeemBatch = await contracts.butterBatchProcessing.batches(
          currentRedeemBatchId
        );
        expect(redeemBatch.suppliedTokenBalance).to.be.equal(mintedHYSI);
      });
      it("moves 3crv into current mintBatch", async function () {
        await contracts.mockSetToken.mint(depositor.address, parseEther("100"));
        await contracts.mockCrvUSDX.mint(
          contracts.mockYearnVaultUSDX.address,
          parseEther("20000")
        );
        await contracts.mockCrvUST.mint(
          contracts.mockYearnVaultUST.address,
          parseEther("20000")
        );
        await contracts.mockYearnVaultUSDX.mint(
          contracts.mockBasicIssuanceModule.address,
          parseEther("20000")
        );
        await contracts.mockYearnVaultUST.mint(
          contracts.mockBasicIssuanceModule.address,
          parseEther("20000")
        );
        await contracts.mockSetToken
          .connect(depositor)
          .approve(contracts.butterBatchProcessing.address, parseEther("100"));
        await contracts.butterBatchProcessing
          .connect(depositor)
          .depositForRedeem(parseEther("100"));
        const batchId = await contracts.butterBatchProcessing.accountBatches(
          depositor.address,
          0
        );
        await provider.send("evm_increaseTime", [1800]);
        await provider.send("evm_mine", []);
        await contracts.butterBatchProcessing.connect(owner).batchRedeem(0);
        const redeemed3CRV = await contracts.mock3Crv.balanceOf(
          contracts.butterBatchProcessing.address
        );
        expect(
          await contracts.butterBatchProcessing
            .connect(depositor)
            .moveUnclaimedDepositsIntoCurrentBatch(
              [batchId],
              [parseEther("100")],
              BatchType.Redeem
            )
        )
          .to.emit(
            contracts.butterBatchProcessing,
            "MovedUnclaimedDepositsIntoCurrentBatch"
          )
          .withArgs(redeemed3CRV, BatchType.Redeem, depositor.address);
        const currentMintBatchId =
          await contracts.butterBatchProcessing.currentMintBatchId();
        const redeemBatch = await contracts.butterBatchProcessing.batches(
          currentMintBatchId
        );
        expect(redeemBatch.suppliedTokenBalance).to.be.equal(redeemed3CRV);
      });
      it("moves only parts of the funds in a batch", async function () {
        await contracts.mock3Crv
          .connect(depositor)
          .approve(
            contracts.butterBatchProcessing.address,
            parseEther("10000")
          );
        await contracts.butterBatchProcessing
          .connect(depositor)
          .depositForMint(parseEther("10000"), depositor.address);
        const batchId = await contracts.butterBatchProcessing.accountBatches(
          depositor.address,
          0
        );
        await provider.send("evm_increaseTime", [1800]);
        await provider.send("evm_mine", []);
        await contracts.butterBatchProcessing.connect(owner).batchMint(0);
        const mintedHYSI = await contracts.mockSetToken.balanceOf(
          contracts.butterBatchProcessing.address
        );
        expect(
          await contracts.butterBatchProcessing
            .connect(depositor)
            .moveUnclaimedDepositsIntoCurrentBatch(
              [batchId],
              [parseEther("5000")],
              BatchType.Mint
            )
        )
          .to.emit(
            contracts.butterBatchProcessing,
            "MovedUnclaimedDepositsIntoCurrentBatch"
          )
          .withArgs(mintedHYSI.div(2), BatchType.Mint, depositor.address);
        const currentRedeemBatchId =
          await contracts.butterBatchProcessing.currentRedeemBatchId();
        const redeemBatch = await contracts.butterBatchProcessing.batches(
          currentRedeemBatchId
        );
        expect(redeemBatch.suppliedTokenBalance).to.be.equal(mintedHYSI.div(2));
        const mintBatch = await contracts.butterBatchProcessing.batches(
          batchId
        );
        expect(mintBatch.claimableTokenBalance).to.be.equal(mintedHYSI.div(2));
      });
      it("moves funds from up to 20 batches", async function () {
        await contracts.mockCrvUSDX.mint(
          contracts.mockYearnVaultUSDX.address,
          parseEther("100000")
        );
        await contracts.mockCrvUST.mint(
          contracts.mockYearnVaultUST.address,
          parseEther("100000")
        );
        await contracts.mockYearnVaultUSDX.mint(
          contracts.mockBasicIssuanceModule.address,
          parseEther("100000")
        );
        await contracts.mockYearnVaultUST.mint(
          contracts.mockBasicIssuanceModule.address,
          parseEther("100000")
        );

        await contracts.mock3Crv.mint(depositor.address, parseEther("2000"));
        await contracts.mock3Crv
          .connect(depositor)
          .approve(contracts.butterBatchProcessing.address, parseEther("2000"));
        await bluebird.map(
          new Array(20).fill(0),
          async (i) => {
            await contracts.butterBatchProcessing
              .connect(depositor)
              .depositForMint(parseEther("100"), depositor.address);
            await provider.send("evm_increaseTime", [1800]);
            await provider.send("evm_mine", []);
            await contracts.butterBatchProcessing.connect(owner).batchMint(0);
          },
          { concurrency: 1 }
        );
        const batchIds =
          await contracts.butterBatchProcessing.getAccountBatches(
            depositor.address
          );
        const mintedHYSI = await contracts.mockSetToken.balanceOf(
          contracts.butterBatchProcessing.address
        );
        expect(
          await contracts.butterBatchProcessing
            .connect(depositor)
            .moveUnclaimedDepositsIntoCurrentBatch(
              batchIds,
              new Array(20).fill(parseEther("100")),
              BatchType.Mint
            )
        )
          .to.emit(
            contracts.butterBatchProcessing,
            "MovedUnclaimedDepositsIntoCurrentBatch"
          )
          .withArgs(mintedHYSI, BatchType.Mint, depositor.address);
        const currentRedeemBatchId =
          await contracts.butterBatchProcessing.currentRedeemBatchId();
        const redeemBatch = await contracts.butterBatchProcessing.batches(
          currentRedeemBatchId
        );
        expect(redeemBatch.suppliedTokenBalance).to.be.equal(mintedHYSI);
      });
    });
  });
  context("paused", function () {
    let claimableMintId;
    let claimableRedeemId;
    let currentMintId;
    let currentRedeemId;

    beforeEach(async function () {
      //Prepare MintBatches
      claimableMintId =
        await contracts.butterBatchProcessing.currentMintBatchId();
      await contracts.mock3Crv.mint(depositor.address, parseEther("40000"));
      await contracts.butterBatchProcessing
        .connect(depositor)
        .depositForMint(parseEther("20000"), depositor.address);
      await contracts.butterBatchProcessing.connect(owner).batchMint(0);
      currentMintId =
        await contracts.butterBatchProcessing.currentMintBatchId();
      await contracts.butterBatchProcessing
        .connect(depositor)
        .depositForMint(parseEther("20000"), depositor.address);

      //Prepare RedeemBatches
      await contracts.mockYearnVaultUSDX.mint(
        contracts.mockBasicIssuanceModule.address,
        parseEther("200000")
      );
      await contracts.mockYearnVaultUST.mint(
        contracts.mockBasicIssuanceModule.address,
        parseEther("200000")
      );
      await contracts.mockSetToken.mint(depositor.address, parseEther("400"));
      await contracts.mockSetToken
        .connect(depositor)
        .approve(contracts.butterBatchProcessing.address, parseEther("10000"));
      claimableRedeemId =
        await contracts.butterBatchProcessing.currentRedeemBatchId();
      await contracts.butterBatchProcessing
        .connect(depositor)
        .depositForRedeem(parseEther("200"));
      await contracts.butterBatchProcessing.connect(owner).batchRedeem(0);
      currentRedeemId =
        await contracts.butterBatchProcessing.currentRedeemBatchId();
      await contracts.butterBatchProcessing
        .connect(depositor)
        .depositForRedeem(parseEther("200"));

      //Pause Contract
      await contracts.butterBatchProcessing.connect(owner).pause();
    });
    it("prevents deposit for mint", async function () {
      await expectRevert(
        contracts.butterBatchProcessing
          .connect(depositor)
          .depositForMint(parseEther("1"), depositor.address),
        "Pausable: paused"
      );
    });
    it("prevents deposit for redeem", async function () {
      await expectRevert(
        contracts.butterBatchProcessing
          .connect(depositor)
          .depositForRedeem(parseEther("1")),
        "Pausable: paused"
      );
    });
    it("prevents mint", async function () {
      await expectRevert(
        contracts.butterBatchProcessing.connect(owner).batchMint(0),
        "Pausable: paused"
      );
    });
    it("prevents redeem", async function () {
      await expectRevert(
        contracts.butterBatchProcessing.connect(owner).batchRedeem(0),
        "Pausable: paused"
      );
    });
    it("prevents to move unclaimed deposits into the current batch", async function () {
      const batchId =
        await contracts.butterBatchProcessing.currentMintBatchId();
      await expectRevert(
        contracts.butterBatchProcessing
          .connect(depositor)
          .moveUnclaimedDepositsIntoCurrentBatch(
            [batchId],
            [parseEther("1")],
            BatchType.Mint
          ),
        "Pausable: paused"
      );
    });
    it("still allows to withdraw from mint batch", async function () {
      expect(
        await contracts.butterBatchProcessing
          .connect(depositor)
          .withdrawFromBatch(currentMintId, parseEther("10"), depositor.address)
      )
        .to.emit(contracts.butterBatchProcessing, "WithdrawnFromBatch")
        .withArgs(currentMintId, parseEther("10"), depositor.address);
    });
    it("still allows to withdraw from redeem batch", async function () {
      expect(
        await contracts.butterBatchProcessing
          .connect(depositor)
          .withdrawFromBatch(
            currentRedeemId,
            parseEther("1"),
            depositor.address
          )
      )
        .to.emit(contracts.butterBatchProcessing, "WithdrawnFromBatch")
        .withArgs(currentRedeemId, parseEther("1"), depositor.address);
    });
    it("still allows to claim minted butter", async function () {
      expect(
        await contracts.butterBatchProcessing
          .connect(depositor)
          .claim(claimableMintId, depositor.address)
      )
        .to.emit(contracts.butterBatchProcessing, "Claimed")
        .withArgs(
          depositor.address,
          BatchType.Mint,
          parseEther("20000"),
          parseEther("200")
        );
    });
    it("still allows to claim redemeed 3crv", async function () {
      expect(
        await contracts.butterBatchProcessing
          .connect(depositor)
          .claim(claimableRedeemId, depositor.address)
      )
        .to.emit(contracts.butterBatchProcessing, "Claimed")
        .withArgs(
          depositor.address,
          BatchType.Redeem,
          parseEther("200"),
          parseEther("951.428571428571428572")
        );
    });
  });
});
