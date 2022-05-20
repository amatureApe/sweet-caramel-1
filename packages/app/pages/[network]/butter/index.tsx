import { parseEther } from "@ethersproject/units";
import {
  adjustDepositDecimals,
  formatAndRoundBigNumber,
  getMinMintAmount,
  isButterSupportedOnCurrentNetwork,
  percentageToBps,
  prepareHotSwap,
} from "@popcorn/utils";
import { BatchProcessTokenKey, BatchProcessTokens, BatchType, SelectedToken } from "@popcorn/utils/src/types";
import BatchProgress from "components/BatchButter/BatchProgress";
import ClaimableBatches from "components/BatchButter/ClaimableBatches";
import MintRedeemInterface from "components/BatchButter/MintRedeemInterface";
import StatInfoCard from "components/BatchButter/StatInfoCard";
import Tutorial from "components/BatchButter/Tutorial";
import ButterStats from "components/ButterStats";
import MainActionButton from "components/MainActionButton";
import { setDualActionWideModal, setMobileFullScreenModal, setMultiChoiceActionModal } from "context/actions";
import { store } from "context/store";
import { ChainId } from "context/Web3/connectors";
import { BigNumber, constants, ethers } from "ethers";
import { ModalType, toggleModal } from "helper/modalHelpers";
import useButter from "hooks/butter/useButter";
import useButterBatch from "hooks/butter/useButterBatch";
import useButterBatchData from "hooks/butter/useButterBatchData";
import useButterBatchZapper from "hooks/butter/useButterBatchZapper";
import useButterWhaleData from "hooks/butter/useButterWhaleData";
import useButterWhaleProcessing from "hooks/butter/useButterWhaleProcessing";
import useThreeCurveVirtualPrice from "hooks/useThreeCurveVirtualPrice";
import useWeb3 from "hooks/useWeb3";
import { useContext, useEffect, useState } from "react";
import ContentLoader from "react-content-loader";
import toast from "react-hot-toast";
import abi from "../../../public/ButterBatchZapperAbi.json";

export enum TOKEN_INDEX {
  dai,
  usdc,
  usdt,
}

export function isDepositDisabled(depositAmount: BigNumber, inputTokenBalance: BigNumber): boolean {
  return depositAmount.gt(inputTokenBalance);
}

export function getZapDepositAmount(depositAmount: BigNumber, tokenKey: string): [BigNumber, BigNumber, BigNumber] {
  switch (tokenKey) {
    case "dai":
      return [depositAmount, BigNumber.from("0"), BigNumber.from("0")];
    case "usdc":
      return [BigNumber.from("0"), depositAmount, BigNumber.from("0")];
    case "usdt":
      return [BigNumber.from("0"), BigNumber.from("0"), depositAmount];
  }
}

export interface ButterPageState {
  selectedToken: SelectedToken;
  useZap: boolean;
  depositAmount: BigNumber;
  redeeming: boolean;
  useUnclaimedDeposits: boolean;
  slippage: number;
  initalLoad: boolean;
  batchToken: BatchProcessTokens;
  whaleToken: BatchProcessTokens;
  instant: boolean;
}

export const DEFAULT_BUTTER_PAGE_STATE: ButterPageState = {
  selectedToken: null,
  useZap: false,
  depositAmount: BigNumber.from("0"),
  redeeming: false,
  useUnclaimedDeposits: false,
  slippage: 1, // in percent (1 = 100 BPS)
  initalLoad: true,
  batchToken: null,
  whaleToken: null,
  instant: false,
};

export default function Butter(): JSX.Element {
  const {
    signerOrProvider,
    account,
    chainId,
    onContractSuccess,
    onContractError,
    contractAddresses,
    connect,
    setChain,
    pushWithinChain,
    signer,
  } = useWeb3();
  const { dispatch } = useContext(store);
  const butter = useButter();
  const butterBatchZapper = useButterBatchZapper();
  const butterBatch = useButterBatch();
  const butterWhaleProcessing = useButterWhaleProcessing();
  const { data: butterWhaleData, error: butterWhaleError, mutate: refetchButterWhaleData } = useButterWhaleData();
  const {
    data: butterBatchData,
    error: errorFetchingButterBatchData,
    mutate: refetchButterBatchData,
  } = useButterBatchData();
  const [butterPageState, setButterPageState] = useState<ButterPageState>(DEFAULT_BUTTER_PAGE_STATE);
  const virtualPrice = useThreeCurveVirtualPrice(contractAddresses?.butterDependency?.threePool);
  const loadingButterBatchData =
    !butterBatchData && !errorFetchingButterBatchData && !butterWhaleError && !butterWhaleData;

  useEffect(() => {
    if (!signerOrProvider || !chainId) {
      return;
    }
    if (!isButterSupportedOnCurrentNetwork(chainId)) {
      dispatch(
        setDualActionWideModal({
          title: "Coming Soon",
          content: "Currently, Butter is only available on Ethereum.",
          onConfirm: {
            label: "Switch Network",
            onClick: () => {
              setChain(ChainId.Ethereum);
              dispatch(setDualActionWideModal(false));
            },
          },
          onDismiss: {
            label: "Go Back",
            onClick: () => {
              pushWithinChain("/");
              dispatch(setDualActionWideModal(false));
            },
          },
          keepOpen: true,
        }),
      );
    } else {
      dispatch(setDualActionWideModal(false));
    }
  }, [signerOrProvider, account, chainId]);

  useEffect(() => {
    if (
      !butterBatchData ||
      !butterBatchData?.batchProcessTokens ||
      !butterWhaleData ||
      !butterWhaleData?.batchProcessTokens
    ) {
      return;
    }
    if (butterPageState.initalLoad) {
      setButterPageState({
        ...butterPageState,
        selectedToken: {
          input: butterBatchData?.batchProcessTokens?.threeCrv?.key,
          output: butterBatchData?.batchProcessTokens?.butter?.key,
        },
        batchToken: butterBatchData?.batchProcessTokens,
        whaleToken: butterWhaleData?.batchProcessTokens,
        redeeming: false,
        initalLoad: false,
      });
    } else {
      setButterPageState({
        ...butterPageState,
        batchToken: butterBatchData?.batchProcessTokens,
        whaleToken: butterWhaleData?.batchProcessTokens,
      });
    }
  }, [butterBatchData, butterWhaleData]);

  useEffect(() => {
    if (!butterBatchData || !butterBatchData?.batchProcessTokens) {
      return;
    }
    if (butterPageState.redeeming) {
      setButterPageState({
        ...butterPageState,
        selectedToken: {
          input: butterPageState?.batchToken?.butter?.key,
          output: butterPageState?.batchToken?.threeCrv?.key,
        },
        useZap: false,
        depositAmount: BigNumber.from("0"),
        useUnclaimedDeposits: false,
      });
    } else {
      setButterPageState({
        ...butterPageState,
        selectedToken: {
          input: butterPageState?.batchToken?.threeCrv?.key,
          output: butterPageState?.batchToken?.butter?.key,
        },
        useZap: false,
        depositAmount: BigNumber.from("0"),
        useUnclaimedDeposits: false,
      });
    }
  }, [butterPageState.redeeming]);

  const hasClaimableBalances = () => {
    if (butterPageState.redeeming) {
      return butterBatchData?.claimableMintBatches.length > 0;
    }
    return butterBatchData?.claimableRedeemBatches.length > 0;
  };

  function selectToken(token: BatchProcessTokenKey): void {
    const zapToken = ["dai", "usdc", "usdt"];
    const newSelectedToken = { ...butterPageState.selectedToken };
    if (butterPageState.redeeming) {
      newSelectedToken.output = token;
    } else {
      newSelectedToken.input = token;
    }
    if (zapToken.includes(newSelectedToken.output) || zapToken.includes(newSelectedToken.input)) {
      setButterPageState({
        ...butterPageState,
        selectedToken: newSelectedToken,
        useUnclaimedDeposits: false,
        useZap: true,
        depositAmount: BigNumber.from("0"),
      });
    } else {
      setButterPageState({
        ...butterPageState,
        selectedToken: newSelectedToken,
        useUnclaimedDeposits: false,
        useZap: false,
        depositAmount: BigNumber.from("0"),
      });
    }
  }

  function handleMintSuccess(res) {
    onContractSuccess(res, `${butterPageState.batchToken[butterPageState.selectedToken.input].name} deposited!`, () => {
      toggleModal(
        ModalType.MultiChoice,
        {
          title: "Deposit for Mint",
          content:
            "You have successfully deposited into the current mint batch. Check the table at the bottom of this page to claim the tokens when they are ready.",
          image: <img src="images/butter/modal-1.png" className="px-6" />,
          onConfirm: {
            label: "Close",
            onClick: () => dispatch(setMultiChoiceActionModal(false)),
          },
          onDismiss: {
            label: "Do not remind me again",
            onClick: () => {
              localStorage.setItem("hideBatchProcessingPopover", "true");
              dispatch(setMultiChoiceActionModal(false));
            },
          },
        },
        "hideMintPopover",
        dispatch,
      );
    });
  }
  function handleRedeemSuccess(res) {
    onContractSuccess(res, "Butter deposited!", () => {
      toggleModal(
        ModalType.MultiChoice,
        {
          title: "Deposit for Redeem",
          content:
            "You have successfully deposited into the current redeem batch. Check the table at the bottom of this page to claim the tokens when they are ready.",
          image: <img src="images/butter/batch-popover.png" className="px-6" />,
          onConfirm: {
            label: "Close",
            onClick: () => dispatch(setMultiChoiceActionModal(false)),
          },
          onDismiss: {
            label: "Do not remind me again",
            onClick: () => {
              localStorage.setItem("hideBatchProcessingPopover", "true");
              dispatch(setMultiChoiceActionModal(false));
            },
          },
        },
        "hideRedeemPopover",
        dispatch,
      );
    });
  }

  async function instantMint(depositAmount: BigNumber): Promise<ethers.ContractTransaction> {
    toast.loading(`Depositing ${butterPageState.batchToken[butterPageState.selectedToken.input].name}...`);
    if (butterPageState.useZap) {
      const virtualPriceValue = await virtualPrice();
      const minMintAmount = getMinMintAmount(
        depositAmount,
        butterPageState.selectedToken.input,
        butterPageState.slippage,
        virtualPriceValue,
      );
      return butterWhaleProcessing.zapMint(
        getZapDepositAmount(depositAmount, butterPageState.selectedToken.input),
        minMintAmount,
        percentageToBps(butterPageState.slippage),
        false, // TODO Add option to stake right away
      );
    }
    return butterWhaleProcessing.mint(
      depositAmount,
      percentageToBps(butterPageState.slippage),
      false, // TODO Add option to stake right away
    );
  }
  async function instantRedeem(depositAmount: BigNumber): Promise<ethers.ContractTransaction> {
    toast.loading(`Withdrawing ${butterPageState.batchToken[butterPageState.selectedToken.output].name}...`);
    if (butterPageState.useZap) {
      return butterWhaleProcessing.zapRedeem(
        depositAmount,
        TOKEN_INDEX[butterPageState.selectedToken.output],
        adjustDepositDecimals(depositAmount, butterPageState.selectedToken.output)
          .mul(100 - butterPageState.slippage)
          .div(100),
        butterPageState.slippage,
      );
    }
    return butterWhaleProcessing.redeem(depositAmount, percentageToBps(butterPageState.slippage));
  }
  async function batchMint(depositAmount: BigNumber): Promise<ethers.ContractTransaction> {
    toast.loading(`Depositing ${butterPageState.batchToken[butterPageState.selectedToken.input].name} ...`);
    if (butterPageState.useZap) {
      const virtualPriceValue = await virtualPrice();
      const minMintAmount = getMinMintAmount(
        depositAmount,
        butterPageState.selectedToken.input,
        butterPageState.slippage,
        virtualPriceValue,
      );
      return butterBatchZapper.zapIntoBatch(
        getZapDepositAmount(depositAmount, butterPageState.selectedToken.input),
        minMintAmount,
      );
    }
    return butterBatch.depositForMint(depositAmount, account);
  }
  async function batchRedeem(depositAmount: BigNumber): Promise<ethers.ContractTransaction> {
    toast.loading("Depositing Butter...");
    return butterBatch.depositForRedeem(depositAmount);
  }
  async function hotswapRedeem(depositAmount: BigNumber): Promise<ethers.ContractTransaction> {
    const batches = butterBatchData?.claimableMintBatches;
    const hotSwapParameter = prepareHotSwap(batches, depositAmount);
    toast.loading("Depositing Funds...");
    return butterBatch.moveUnclaimedDepositsIntoCurrentBatch(
      hotSwapParameter.batchIds as string[],
      hotSwapParameter.amounts,
      BatchType.Mint,
    );
  }
  async function hotswapMint(depositAmount: BigNumber): Promise<ethers.ContractTransaction> {
    const batches = butterBatchData?.claimableRedeemBatches;
    const hotSwapParameter = prepareHotSwap(batches, depositAmount);
    toast.loading("Depositing Funds...");
    return butterBatch.moveUnclaimedDepositsIntoCurrentBatch(
      hotSwapParameter.batchIds as string[],
      hotSwapParameter.amounts,
      BatchType.Redeem,
    );
  }

  async function handleMainAction(depositAmount: BigNumber, batchType: BatchType): Promise<void> {
    depositAmount = adjustDepositDecimals(depositAmount, butterPageState.selectedToken.input);
    if (butterPageState.instant && butterPageState.redeeming) {
      await instantRedeem(depositAmount).then(
        (res) => onContractSuccess(res, "Butter redeemed!"),
        (err) => onContractError(err),
      );
    } else if (butterPageState.instant) {
      await instantMint(depositAmount).then(
        (res) => onContractSuccess(res, "Butter minted!"),
        (err) => onContractError(err),
      );
    } else if (butterPageState.useUnclaimedDeposits && batchType === BatchType.Mint) {
      hotswapMint(depositAmount).then(
        (res) => onContractSuccess(res, `Funds deposited!`),
        (err) => onContractError(err),
      );
    } else if (butterPageState.useUnclaimedDeposits) {
      await hotswapRedeem(depositAmount).then(
        (res) => onContractSuccess(res, `Funds deposited!`),
        (err) => onContractError(err),
      );
    } else if (batchType === BatchType.Mint) {
      await batchMint(depositAmount).then(handleMintSuccess, (err) => onContractError(err));
    } else {
      await batchRedeem(depositAmount).then(handleRedeemSuccess, (err) => onContractError(err));
    }
    await Promise.all([refetchButterBatchData(), refetchButterWhaleData()]);
    setButterPageState({ ...butterPageState, depositAmount: constants.Zero });
  }

  function handleClaimSuccess(res) {
    onContractSuccess(res, `Batch claimed!`, () => {
      refetchButterBatchData();
      toggleModal(
        ModalType.MultiChoice,
        {
          title: "You claimed your Token",
          children: (
            <p className="text-sm text-gray-500">
              Your tokens should now be visible in your wallet. If you can’t see your BTR, import it here:
              <a
                onClick={async () =>
                  window.ethereum.request({
                    method: "wallet_watchAsset",
                    params: {
                      type: "ERC20",
                      options: {
                        address: butter.address,
                        symbol: "BTR",
                        decimals: 18,
                      },
                    },
                  })
                }
                className="text-blue-600 cursor-pointer"
              >
                BTR
              </a>
            </p>
          ),
          image: <img src="/images/butter/modal-2.png" className="px-6" />,
          onConfirm: {
            label: "Close",
            onClick: () => dispatch(setMultiChoiceActionModal(false)),
          },
          onDismiss: {
            label: "Do not remind me again",
            onClick: () => {
              localStorage.setItem("hideClaimSuccessPopover", "true");
              dispatch(setMultiChoiceActionModal(false));
            },
          },
        },
        "hideClaimSuccessPopover",
        dispatch,
      );
    });
  }
  async function claim(batchId: string, useZap?: boolean, outputToken?: string): Promise<void> {
    toast.loading("Claiming Batch...");
    let call;
    if (useZap) {
      call = butterBatchZapper.claimAndSwapToStable(
        batchId,
        TOKEN_INDEX[outputToken],
        adjustDepositDecimals(
          butterBatchData?.accountBatches
            .find((batch) => batch.batchId === batchId)
            .accountClaimableTokenBalance.mul(butterBatchData?.batchProcessTokens?.threeCrv.price)
            .div(butterBatchData?.batchProcessTokens[outputToken].price),
          outputToken,
        )
          .mul(100 - butterPageState.slippage)
          .div(100),
      );
    } else {
      call = butterBatch.claim(batchId, account);
    }
    await call.then(
      (res) => handleClaimSuccess(res),
      (err) => onContractError(err),
    );
  }

  async function claimAndStake(batchId: string): Promise<void> {
    toast.loading("Claiming and staking Butter...");
    await butterBatch
      .claimAndStake(batchId, account)
      .then((res) => onContractSuccess(res, `Staked claimed Butter`, () => refetchButterBatchData()))
      .catch((err) => onContractError(err));
  }

  async function withdraw(batchId: string, amount: BigNumber, useZap?: boolean, outputToken?: string): Promise<void> {
    let call;
    if (useZap) {
      call = new ethers.Contract(contractAddresses.butterBatchZapper, abi, signer).zapOutOfBatch(
        batchId,
        amount,
        TOKEN_INDEX[outputToken],
        adjustDepositDecimals(amount, outputToken)
          .mul(100 - butterPageState.slippage)
          .div(100),
      );
    } else {
      call = butterBatch.withdrawFromBatch(batchId, amount, account);
    }
    await call
      .then((res) =>
        onContractSuccess(res, "Funds withdrawn!", () => {
          refetchButterBatchData();
        }),
      )
      .catch((err) => onContractError(err));
  }

  function getCurrentContractAddress(): string {
    if (butterPageState.instant) {
      return butterWhaleProcessing.address;
    }
    if (butterPageState.useZap) {
      return butterBatchZapper.address;
    }
    return butterBatch.address;
  }

  async function approve(contractKey: string): Promise<void> {
    toast.loading("Approving Token...");
    const selectedTokenContract = butterBatchData?.batchProcessTokens[contractKey].contract;
    await selectedTokenContract.approve(getCurrentContractAddress(), ethers.constants.MaxUint256).then(
      (res) =>
        onContractSuccess(res, "Token approved!", () => {
          refetchButterBatchData();
        }),
      (err) => onContractError(err),
    );
  }

  function getBatchProgressAmount(): BigNumber {
    if (!butterBatchData) {
      return BigNumber.from("0");
    }
    return butterPageState.redeeming
      ? butterBatchData?.currentBatches.redeem.suppliedTokenBalance
          .mul(butterBatchData?.batchProcessTokens?.butter.price)
          .div(parseEther("1"))
      : butterBatchData?.currentBatches.mint.suppliedTokenBalance
          .mul(butterBatchData?.batchProcessTokens?.threeCrv.price)
          .div(parseEther("1"));
  }

  function depositDisabled(): boolean {
    return butterPageState.useUnclaimedDeposits
      ? isDepositDisabled(
          butterPageState.depositAmount,
          butterPageState.batchToken[butterPageState.selectedToken.input].claimableBalance,
        )
      : isDepositDisabled(
          butterPageState.depositAmount,
          butterPageState.batchToken[butterPageState.selectedToken.input].balance,
        );
  }

  return (
    <>
      <div className="md:max-w-2xl mx-4 md:mx-0 text-center md:text-left">
        <h1 className="text-3xl font-bold">Butter - Yield Optimizer</h1>
        <p className="mt-2 text-lg text-gray-500">
          Mint BTR and earn interest on multiple stablecoins at once.
          <br />
          Stake your BTR to earn boosted APY.
        </p>
        <ButterStats butterData={butterBatchData} />
      </div>
      <div className="flex flex-col md:flex-row mt-10 mx-4 md:mx-0">
        <div className="order-2 md:order-1 md:w-1/3 mb-10">
          {!account && (
            <div className="px-5 pt-6 md:mr-8 bg-white border border-gray-200 rounded-3xl pb-14 laptop:pb-18 shadow-custom">
              <div className="w-full py-64 mt-1 mb-2 smlaptop:mt-2">
                <MainActionButton
                  label="Connect Wallet"
                  handleClick={() => {
                    connect();
                  }}
                />
              </div>
            </div>
          )}
          {account && loadingButterBatchData && (
            <ContentLoader viewBox="0 0 450 600">
              <rect x="0" y="0" rx="20" ry="20" width="400" height="600" />
            </ContentLoader>
          )}
          {account && !loadingButterBatchData && (
            <div className="md:pr-8">
              {butterBatchData && butterPageState.selectedToken && (
                <MintRedeemInterface
                  token={butterBatchData?.batchProcessTokens}
                  selectToken={selectToken}
                  deposit={handleMainAction}
                  approve={approve}
                  depositDisabled={depositDisabled()}
                  hasUnclaimedBalances={hasClaimableBalances()}
                  butterPageState={[butterPageState, setButterPageState]}
                />
              )}
            </div>
          )}
        </div>

        <div className="order-1 md:order-2 md:w-2/3 flex flex-col">
          <div className="flex flex-col md:flex-row">
            <div className="block md:hidden md:w-1/2 md:mr-2 mb-4 md:mb-0">
              <div
                className="flex flex-col justify-center h-full rounded-3xl border border-gray-200 shadow-custom w-full px-2 pt-2 pb-2 bg-primaryLight"
                onClick={() => {
                  dispatch(
                    setMobileFullScreenModal({
                      title: "",
                      children: <Tutorial />,
                      onDismiss: () => dispatch(setMobileFullScreenModal(false)),
                    }),
                  );
                }}
              >
                <div className="flex flex-row items-center justify-end mt-0.5">
                  <div className="w-full flex flex-row justify-center">
                    <div className="ml-4">
                      <h3 className="text-lg font-medium text-gray-900">Learn how it works</h3>
                    </div>
                  </div>
                  <div className="flex flex-row">
                    <div className="mr-2">
                      <img title="play-icon" src="/images/icons/IconPlay.svg" />
                    </div>
                  </div>
                  <div></div>
                </div>
              </div>
            </div>
            <div className="block md:hidden md:w-1/2 md:mr-2 mb-10 md:mb-0">
              <div
                className="flex flex-col justify-center h-full rounded-3xl border border-gray-200 shadow-custom w-full px-2 pt-2 pb-2 bg-green-100"
                onClick={() => {
                  dispatch(
                    setMobileFullScreenModal({
                      title: "",
                      children: (
                        <div className="flex flex-col px-8 text-left">
                          <div className="">
                            <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                              Mint
                            </h3>
                            <div className="my-4">
                              <p className="text-lg text-gray-500">
                                Mint BTR with 3CRV or stablecoins to earn interest on multiple Stablecoins at once. As
                                the value of the underlying assets increase, so does the redeemable value of Butter.
                                This process converts deposited funds into other stablecoins and deploys them in Yearn
                                to generate interest.
                              </p>
                            </div>
                          </div>
                          <div className="mt-14">
                            <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                              Redeem
                            </h3>
                            <div className="my-4">
                              <p className="text-lg text-gray-500">
                                Redeem your BTR to receive its value in 3CRV or stablecoins. We will convert all the
                                underlying tokens of BTR back into 3CRV or your desired stablecoin.
                              </p>
                            </div>
                          </div>
                        </div>
                      ),
                      onDismiss: () => dispatch(setMobileFullScreenModal(false)),
                    }),
                  );
                }}
              >
                <div className="flex flex-row items-center justify-end mt-0.5">
                  <div className="w-full flex flex-row justify-center">
                    <div className="ml-4">
                      <h3 className="text-lg font-medium text-gray-900">What is Mint & Redeem?</h3>
                    </div>
                  </div>
                  <div className="flex flex-row">
                    <div className="mr-2">
                      <img title="play-icon" src="/images/icons/IconPlay.svg" />
                    </div>
                  </div>
                  <div></div>
                </div>
              </div>
            </div>
            <div className="md:w-1/2 md:mr-2 mb-4 md:mb-0">
              <StatInfoCard
                title="Butter Value"
                content={`$ ${
                  butterBatchData?.batchProcessTokens?.butter
                    ? formatAndRoundBigNumber(butterBatchData?.batchProcessTokens?.butter?.price)
                    : "-"
                }`}
                icon={{ icon: "Money", color: "bg-blue-300" }}
              />
            </div>
            <div className="md:w-1/2 md:ml-2 mb-8 md:mb-0">
              <BatchProgress batchAmount={getBatchProgressAmount()} threshold={parseEther("100000")} />
            </div>
          </div>

          <div className="hidden md:flex w-full h-128 flex-row items-center pt-8 pb-6 pl-2 pr-2 mt-8 border border-gray-200 h-min-content smlaptop:pt-16 laptop:pt-12 lglaptop:pt-16 2xl:pt-12 smlaptop:pb-10 lglaptop:pb-12 2xl:pb-10 rounded-4xl shadow-custom bg-primaryLight">
            <Tutorial />
          </div>
        </div>
      </div>
      {butterBatchData?.accountBatches?.length > 0 && (
        <div className="w-full pb-12 mx-auto mt-10">
          <div className="mx-4 md:mx-0 p-2 overflow-hidden border border-gray-200 shadow-custom rounded-3xl">
            <ClaimableBatches
              batches={butterBatchData?.accountBatches}
              claim={claim}
              claimAndStake={claimAndStake}
              withdraw={withdraw}
              butterPageState={[butterPageState, setButterPageState]}
            />
          </div>
        </div>
      )}
    </>
  );
}