import { Web3Provider } from '@ethersproject/providers';
import { parseEther } from '@ethersproject/units';
import { bigNumberToNumber, formatAndRoundBigNumber } from '@popcorn/utils';
import { useWeb3React } from '@web3-react/core';
import BatchProgress from 'components/BatchButter/BatchProgress';
import ClaimableBatches from 'components/BatchButter/ClaimableBatches';
import MintRedeemInterface from 'components/BatchButter/MintRedeemInterface';
import StatInfoCard from 'components/BatchButter/StatInfoCard';
import { BatchProcessToken } from 'components/BatchButter/TokenInput';
import Tutorial from 'components/BatchButter/Tutorial';
import MainActionButton from 'components/MainActionButton';
import Navbar from 'components/NavBar/NavBar';
import { setDualActionWideModal, setSingleActionModal } from 'context/actions';
import { store } from 'context/store';
import { ChainId, connectors } from 'context/Web3/connectors';
import {
  ButterDependencyContracts,
  Contracts,
  ContractsContext,
} from 'context/Web3/contracts';
import { switchNetwork } from 'context/Web3/networkSwitch';
import { BigNumber, Contract, utils } from 'ethers';
import useThreeCurveVirtualPrice from 'hooks/useThreeCurveVirtualPrice';
import router from 'next/router';
import { useContext, useEffect, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import {
  AccountBatch,
  BatchType,
  ComponentMap,
  CurrentBatches,
} from '../../hardhat/lib/adapters';
import ButterBatchAdapter from '../../hardhat/lib/adapters/ButterBatchAdapter';

interface HotSwapParameter {
  batchIds: String[];
  amounts: BigNumber[];
}

interface ClaimableBatches {
  mint: AccountBatch[];
  redeem: AccountBatch[];
}

export interface SelectedToken {
  input: BatchProcessToken;
  output: BatchProcessToken;
}

export interface BatchProcessTokens {
  butter: BatchProcessToken;
  threeCrv: BatchProcessToken;
  dai: BatchProcessToken;
  usdc: BatchProcessToken;
  usdt: BatchProcessToken;
}

const TOKEN_INDEX = { dai: 0, usdc: 1, usdt: 2 };

function getClaimableBalance(claimableBatches: AccountBatch[]): BigNumber {
  return claimableBatches.reduce(
    (acc: BigNumber, batch: AccountBatch) =>
      acc.add(batch.accountClaimableTokenBalance),
    BigNumber.from('0'),
  );
}

function isDepositDisabled(
  depositAmount: BigNumber,
  inputTokenBalance: BigNumber,
): boolean {
  return depositAmount.gt(inputTokenBalance);
}

async function getBatchProcessToken(
  butterBatchAdapter: ButterBatchAdapter,
  contracts: Contracts,
  butterDependencyContracts: ButterDependencyContracts,
  account: string,
): Promise<BatchProcessTokens> {
  const batchProcessTokens = {
    butter: {
      name: 'BTR',
      key: 'butter',
      balance: await contracts.butter.balanceOf(account),
      allowance: await contracts.butter.allowance(
        account,
        contracts.butterBatch.address,
      ),
      claimableBalance: BigNumber.from('0'),
      price: await ButterBatchAdapter.getButterValue(
        butterDependencyContracts.setBasicIssuanceModule,
        {
          [butterDependencyContracts.yMim.address.toLowerCase()]: {
            metaPool: butterDependencyContracts.crvMimMetapool,
            yPool: butterDependencyContracts.yMim,
          },
          [butterDependencyContracts.yFrax.address.toLowerCase()]: {
            metaPool: butterDependencyContracts.crvFraxMetapool,
            yPool: butterDependencyContracts.yFrax,
          },
        } as ComponentMap,
        contracts.butter?.address,
      ),
      img: 'butter.png',
    },
    threeCrv: {
      name: '3CRV',
      key: 'threeCrv',
      balance: await contracts.threeCrv.balanceOf(account),
      allowance: await contracts.threeCrv.allowance(
        account,
        contracts.butterBatch.address,
      ),
      claimableBalance: BigNumber.from('0'),
      price: await butterBatchAdapter.getThreeCrvPrice(
        butterDependencyContracts.threePool,
      ),
      img: '3crv.png',
    },
    dai: {
      name: 'DAI',
      key: 'dai',
      balance: await contracts.dai.balanceOf(account),
      allowance: await contracts.dai.allowance(
        account,
        contracts.butterBatchZapper.address,
      ),
      price: await butterBatchAdapter.getStableCoinPrice(
        butterDependencyContracts.threePool,
        [parseEther('1'), BigNumber.from('0'), BigNumber.from('0')],
      ),
      img: 'dai.webp',
    },
    usdc: {
      name: 'USDC',
      key: 'usdc',
      balance: (await contracts.usdc.balanceOf(account)).mul(
        BigNumber.from(1e12),
      ),
      allowance: await contracts.usdc.allowance(
        account,
        contracts.butterBatchZapper.address,
      ),
      price: await butterBatchAdapter.getStableCoinPrice(
        butterDependencyContracts.threePool,
        [BigNumber.from('0'), BigNumber.from(1e6), BigNumber.from('0')],
      ),
      img: 'usdc.webp',
    },
    usdt: {
      name: 'USDT',
      key: 'usdt',
      balance: (await contracts.usdt.balanceOf(account)).mul(
        BigNumber.from(1e12),
      ),
      allowance: await contracts.usdt.allowance(
        account,
        contracts.butterBatchZapper.address,
      ),
      price: await butterBatchAdapter.getStableCoinPrice(
        butterDependencyContracts.threePool,
        [BigNumber.from('0'), BigNumber.from('0'), BigNumber.from(1e6)],
      ),
      img: 'usdt.webp',
    },
  };
  return batchProcessTokens;
}

function adjustDepositDecimals(
  depositAmount: BigNumber,
  tokenKey: string,
): BigNumber {
  if (tokenKey === 'usdc' || tokenKey === 'usdt') {
    return depositAmount.div(BigNumber.from(1e12));
  } else {
    return depositAmount;
  }
}

function getZapDepositAmount(
  depositAmount: BigNumber,
  tokenKey: string,
): [BigNumber, BigNumber, BigNumber] {
  switch (tokenKey) {
    case 'dai':
      return [depositAmount, BigNumber.from('0'), BigNumber.from('0')];
    case 'usdc':
      return [BigNumber.from('0'), depositAmount, BigNumber.from('0')];
    case 'usdt':
      return [BigNumber.from('0'), BigNumber.from('0'), depositAmount];
  }
}

export default function Butter(): JSX.Element {
  const context = useWeb3React<Web3Provider>();
  const { library, account, activate, chainId } = context;
  const { contracts, butterDependencyContracts } = useContext(ContractsContext);
  const { dispatch } = useContext(store);
  const [batchProcessTokens, setBatchProcessTokens] =
    useState<BatchProcessTokens>();
  const [selectedToken, setSelectedToken] = useState<SelectedToken>();
  const [useZap, setUseZap] = useState<Boolean>(false);
  const [depositAmount, setDepositAmount] = useState<BigNumber>(
    BigNumber.from('0'),
  );
  const [redeeming, setRedeeming] = useState<Boolean>(false);
  const [useUnclaimedDeposits, setUseUnclaimedDeposits] =
    useState<Boolean>(false);
  const [butterBatchAdapter, setButterBatchAdapter] =
    useState<ButterBatchAdapter>();
  const [batches, setBatches] = useState<AccountBatch[]>();
  const [claimableBatches, setClaimableBatches] = useState<ClaimableBatches>();
  const [slippage, setSlippage] = useState<number>(3);
  const [currentBatches, setCurrentBatches] = useState<CurrentBatches>();
  const [butterSupply, setButterSupply] = useState<BigNumber>();
  const [apy, setApy] = useState<number>();
  const virtualPrice = useThreeCurveVirtualPrice(
    butterDependencyContracts?.threePool?.address,
  );

  useEffect(() => {
    if (contracts?.butterBatch && !butterBatchAdapter) {
      setButterBatchAdapter(new ButterBatchAdapter(contracts.butterBatch));
    }
  }, [contracts]);

  useEffect(() => {
    if (!library || !contracts) {
      return;
    }
    if (
      ![ChainId.Hardhat, ChainId.Localhost, ChainId.Ethereum].includes(chainId)
    ) {
      dispatch(
        setDualActionWideModal({
          title: 'Coming Soon',
          content:
            'Currently, Butter is only on Ethereum. Please switch to Ethereum to use Butter.',
          onConfirm: {
            label: 'Switch Network',
            onClick: () => {
              if (
                [ChainId.Hardhat, ChainId.Localhost].includes(
                  parseInt(process.env.CHAIN_ID),
                )
              ) {
                console.log(
                  'switching network ',
                  parseInt(process.env.CHAIN_ID),
                );
                switchNetwork(parseInt(process.env.CHAIN_ID), dispatch);
              } else {
                switchNetwork(ChainId.Ethereum, dispatch);
              }
              dispatch(setDualActionWideModal(false));
            },
          },
          onDismiss: {
            label: 'Go Back',
            onClick: () => {
              router.back();
              dispatch(setDualActionWideModal(false));
            },
          },
        }),
      );
      return;
    }
    fetch('https://api.yearn.finance/v1/chains/1/vaults/all')
      .then((res) => res.json())
      .then((res) =>
        setApy(
          ((res.find(
            (vault) =>
              vault?.token?.address ===
              '0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B', // crvFRAX
          )?.apy?.net_apy +
            res.find(
              (vault) =>
                vault?.token?.address ===
                '0x5a6A4D54456819380173272A5E8E9B9904BdF41B', // crvMIM
            )?.apy?.net_apy) /
            2) *
            100,
        ),
      );
  }, [library, account, chainId]);

  useEffect(() => {
    if (!contracts || !butterBatchAdapter || !account) {
      return;
    }
    getBatchProcessToken(
      butterBatchAdapter,
      contracts,
      butterDependencyContracts,
      account,
    ).then((res) => {
      setBatchProcessTokens(res);
      setSelectedToken({ input: res.threeCrv, output: res.butter });
    });
    butterBatchAdapter.getBatches(account).then((res) => setBatches(res));
    butterBatchAdapter
      .getCurrentBatches()
      .then((res) => setCurrentBatches(res));
    butterBatchAdapter
      .getTokenSupply(contracts.butter)
      .then((res) => setButterSupply(res));
  }, [butterBatchAdapter, account]);

  const getMinMintAmount = async (
    depositAmount: BigNumber,
    tokenKey: string,
    slippage: number,
  ) => {
    slippage = slippage * 100;
    const denominator = 10000;

    const virtual_price = await virtualPrice();

    const normalizedTokenUnits = ['usdc', 'usdt'].includes(tokenKey)
      ? depositAmount.mul(BigNumber.from(1e12))
      : depositAmount;

    const lpTokenAmount = normalizedTokenUnits
      .mul(parseEther('1'))
      .div(virtual_price);

    const delta = lpTokenAmount.mul(slippage).div(denominator);

    return lpTokenAmount.sub(delta);
  };

  useEffect(() => {
    if (!batches || !batchProcessTokens || claimableBatches) {
      return;
    }
    const claimableMintBatches = batches.filter(
      (batch) => batch.batchType == BatchType.Mint && batch.claimable,
    );
    const claimableRedeemBatches = batches.filter(
      (batch) => batch.batchType == BatchType.Redeem && batch.claimable,
    );
    const newBatchProcessTokens = { ...batchProcessTokens };
    newBatchProcessTokens.butter.claimableBalance =
      getClaimableBalance(claimableMintBatches);
    newBatchProcessTokens.threeCrv.claimableBalance = getClaimableBalance(
      claimableRedeemBatches,
    );
    setBatchProcessTokens(newBatchProcessTokens);
    setClaimableBatches({
      mint: claimableMintBatches,
      redeem: claimableRedeemBatches,
    });
  }, [batches, batchProcessTokens]);

  useEffect(() => {
    if (!batchProcessTokens) {
      return;
    }
    if (redeeming) {
      setSelectedToken({
        input: batchProcessTokens.butter,
        output: batchProcessTokens.threeCrv,
      });
    } else {
      setSelectedToken({
        input: batchProcessTokens.threeCrv,
        output: batchProcessTokens.butter,
      });
    }
    setUseZap(false);
  }, [redeeming]);

  function selectToken(token: BatchProcessToken): void {
    const zapToken = ['dai', 'usdc', 'usdt'];
    const newSelectedToken = { ...selectedToken };
    if (redeeming) {
      newSelectedToken.output = token;
    } else {
      newSelectedToken.input = token;
    }
    if (
      zapToken.includes(newSelectedToken.output.key) ||
      zapToken.includes(newSelectedToken.input.key)
    ) {
      setUseZap(true);
    } else {
      setUseZap(false);
    }
    setSelectedToken(newSelectedToken);
  }

  function prepareHotSwap(
    batches: AccountBatch[],
    depositAmount: BigNumber,
  ): HotSwapParameter {
    let cumulatedBatchAmounts = BigNumber.from('0');
    const batchIds: String[] = [];
    const amounts: BigNumber[] = [];
    batches.forEach((batch) => {
      if (cumulatedBatchAmounts < depositAmount) {
        const missingAmount = depositAmount.sub(cumulatedBatchAmounts);
        const amountOfBatch = batch.accountClaimableTokenBalance.gt(
          missingAmount,
        )
          ? missingAmount
          : batch.accountClaimableTokenBalance;
        cumulatedBatchAmounts = cumulatedBatchAmounts.add(amountOfBatch);
        const shareValue = batch.accountClaimableTokenBalance
          .mul(parseEther('1'))
          .div(batch.accountSuppliedTokenBalance);

        batchIds.push(batch.batchId);
        amounts.push(
          amountOfBatch.eq(batch.accountClaimableTokenBalance)
            ? batch.accountSuppliedTokenBalance
            : amountOfBatch.mul(parseEther('1')).div(shareValue),
        );
      }
    });
    return { batchIds: batchIds, amounts: amounts };
  }

  async function hotswap(
    depositAmount: BigNumber,
    batchType: BatchType,
  ): Promise<void> {
    if (batchType === BatchType.Mint) {
      batchType = BatchType.Redeem;
    } else {
      batchType = BatchType.Mint;
    }
    const hotSwapParameter = prepareHotSwap(
      claimableBatches[BatchType[batchType].toLowerCase()],
      depositAmount,
    );
    toast.loading('Depositing Funds...');
    await contracts.butterBatch
      .connect(library.getSigner())
      .moveUnclaimedDepositsIntoCurrentBatch(
        hotSwapParameter.batchIds as string[],
        hotSwapParameter.amounts,
        batchType,
      )
      .then((res) => {
        res.wait().then((res) => {
          toast.dismiss();
          toast.success('Funds deposited!');
          butterBatchAdapter.getBatches(account).then((res) => setBatches(res));
          getBatchProcessToken(
            butterBatchAdapter,
            contracts,
            butterDependencyContracts,
            account,
          ).then((res) => setBatchProcessTokens(res));
          butterBatchAdapter
            .getCurrentBatches()
            .then((res) => setCurrentBatches(res));
        });
      })
      .catch((err) => {
        toast.dismiss();
        if (err.data === undefined) {
          toast.error('An error occured');
        } else {
          toast.error(err.data.message.split("'")[1]);
        }
      });
  }

  async function deposit(
    depositAmount: BigNumber,
    batchType: BatchType,
  ): Promise<void> {
    depositAmount = adjustDepositDecimals(
      depositAmount,
      selectedToken.input.key,
    );

    console.log('adjusted deposit decimals', depositAmount);
    console.log('depositAmount', depositAmount);
    if (batchType === BatchType.Mint) {
      console.log(
        'useZap?',
        useZap,
        useZap
          ? contracts.butterBatchZapper.address
          : contracts.butterBatch.address,
      );
      const allowance = await contracts[selectedToken.input.key].allowance(
        account,
        useZap
          ? contracts.butterBatchZapper.address
          : contracts.butterBatch.address,
      );
      console.log('allowance is', useZap, allowance);
      if (allowance.lt(depositAmount)) {
        approve(contracts[selectedToken.input.key]);
      } else {
        toast.loading(`Depositing ${selectedToken.input.name} ...`);
        let mintCall;
        if (useZap) {
          const minMintAmount = await getMinMintAmount(
            depositAmount,
            selectedToken.input.key,
            slippage,
          );
          console.log(
            'zapDepositAmount',
            getZapDepositAmount(depositAmount, selectedToken.input.key),
          );
          mintCall = contracts.butterBatchZapper
            .connect(library.getSigner())
            .zapIntoBatch(
              getZapDepositAmount(depositAmount, selectedToken.input.key),
              minMintAmount,
            );
        } else {
          mintCall = contracts.butterBatch
            .connect(library.getSigner())
            .depositForMint(depositAmount, account);
        }

        await mintCall
          .then((res) => {
            res.wait().then((res) => {
              toast.dismiss();
              toast.success(`${selectedToken.input.name} deposited!`);
              butterBatchAdapter
                .getBatches(account)
                .then((res) => setBatches(res));
              getBatchProcessToken(
                butterBatchAdapter,
                contracts,
                butterDependencyContracts,
                account,
              ).then((res) => setBatchProcessTokens(res));
              butterBatchAdapter
                .getCurrentBatches()
                .then((res) => setCurrentBatches(res));
              if (!localStorage.getItem('mintModal')) {
                dispatch(
                  setSingleActionModal({
                    title: 'Your first mint',
                    content:
                      'You have successfully added your fund into the current batch cycle. Check-in on the Batch module under the Mint & Redeem panel for the latest batch progress.',
                    image: (
                      <img src="images/butter/modal-1.png" className="px-6" />
                    ),
                    onConfirm: {
                      label: 'Close',
                      onClick: () => dispatch(setSingleActionModal(false)),
                    },
                  }),
                );
                localStorage.setItem('mintModal', 'true');
              }
            });
          })
          .catch((err) => {
            toast.dismiss();
            if (err.data === undefined) {
              toast.error('An error occured');
            } else {
              toast.error(err.data.message.split("'")[1]);
            }
          });
      }
    } else {
      const allowance = await contracts.butter.allowance(
        account,
        contracts.butterBatch.address,
      );
      if (allowance.gt(depositAmount)) {
        toast.loading('Depositing Butter...');
        await contracts.butterBatch
          .connect(library.getSigner())
          .depositForRedeem(depositAmount)
          .then((res) => {
            res.wait().then((res) => {
              toast.dismiss();
              toast.success('Butter deposited!');
              butterBatchAdapter
                .getBatches(account)
                .then((res) => setBatches(res));
              getBatchProcessToken(
                butterBatchAdapter,
                contracts,
                butterDependencyContracts,
                account,
              ).then((res) => setBatchProcessTokens(res));
              butterBatchAdapter
                .getCurrentBatches()
                .then((res) => setCurrentBatches(res));
              if (!localStorage.getItem('mintModal')) {
                dispatch(
                  setSingleActionModal({
                    title: 'Your first redemption',
                    content:
                      'You have successfully deposited into the current batch cycle. Check beneath the Mint & Redeem panel to monitor batches pending your action.',
                    image: (
                      <img src="images/butter/modal-1.png" className="px-6" />
                    ),
                    onConfirm: {
                      label: 'Close',
                      onClick: () => dispatch(setSingleActionModal(false)),
                    },
                  }),
                );
                localStorage.setItem('mintModal', 'true');
              }
            });
          })
          .catch((err) => {
            toast.dismiss();
            if (err.data === undefined) {
              toast.error('An error occured');
            } else {
              toast.error(err.data.message.split("'")[1]);
            }
          });
      } else {
        approve(contracts.butter);
      }
    }
  }

  async function claim(
    batchId: string,
    useZap?: boolean,
    outputToken?: string,
  ): Promise<void> {
    toast.loading('Claiming Batch...');
    let call;
    if (useZap) {
      call = contracts.butterBatchZapper
        .connect(library.getSigner())
        .claimAndSwapToStable(
          batchId,
          TOKEN_INDEX[outputToken],
          adjustDepositDecimals(
            batches
              .find((batch) => batch.batchId === batchId)
              .accountClaimableTokenBalance.mul(
                batchProcessTokens.threeCrv.price,
              )
              .div(batchProcessTokens[outputToken].price),
            outputToken,
          )
            .mul(100 - slippage)
            .div(100),
        );
    } else {
      call = contracts.butterBatch
        .connect(library.getSigner())
        .claim(batchId, account);
    }
    await call
      .then((res) => {
        res.wait().then((res) => {
          toast.dismiss();
          toast.success('Batch claimed!');
        });
        butterBatchAdapter.getBatches(account).then((res) => setBatches(res));
        getBatchProcessToken(
          butterBatchAdapter,
          contracts,
          butterDependencyContracts,
          account,
        ).then((res) => setBatchProcessTokens(res));
        if (!localStorage.getItem('claimModal')) {
          dispatch(
            setSingleActionModal({
              title: 'You claimed your Butter',
              children: (
                <p className="text-sm text-gray-500">
                  Your tokens are now in your wallet. To see them make sure to
                  import Butter into your wallet.
                  <br />
                  <a
                    onClick={async () =>
                      await window.ethereum.request({
                        method: 'wallet_watchAsset',
                        params: {
                          type: 'ERC20',
                          options: {
                            address: contracts.butter?.address,
                            symbol: 'BTR',
                            decimals: 18,
                          },
                        },
                      })
                    }
                    className="text-blue-600 cursor-pointer"
                  >
                    Add Butter to your Wallet
                  </a>
                </p>
              ),
              image: <img src="images/butter/modal-2.png" className="px-6" />,
              onConfirm: {
                label: 'Close',
                onClick: () => dispatch(setSingleActionModal(false)),
              },
            }),
          );
          localStorage.setItem('claimModal', 'true');
        }
      })
      .catch((err) => {
        toast.dismiss();
        if (err.data === undefined) {
          toast.error('An error occured');
        } else {
          toast.error(err.data.message.split("'")[1]);
        }
      });
  }

  async function withdraw(
    batchId: string,
    amount: BigNumber,
    useZap?: boolean,
    outputToken?: string,
  ): Promise<void> {
    toast.loading('Withdrawing from Batch...');
    let call;
    if (useZap) {
      call = contracts.butterBatchZapper
        .connect(library.getSigner())
        .zapOutOfBatch(
          batchId,
          amount,
          TOKEN_INDEX[outputToken],
          adjustDepositDecimals(amount, outputToken)
            .mul(100 - slippage)
            .div(100),
        );
    } else {
      call = contracts.butterBatch
        .connect(library.getSigner())
        .withdrawFromBatch(batchId, amount, account);
    }
    await call
      .then((res) => {
        res.wait().then((res) => {
          toast.dismiss();
          toast.success('Funds withdrawn!');
          butterBatchAdapter.getBatches(account).then((res) => setBatches(res));
          getBatchProcessToken(
            butterBatchAdapter,
            contracts,
            butterDependencyContracts,
            account,
          ).then((res) => setBatchProcessTokens(res));
          butterBatchAdapter
            .getCurrentBatches()
            .then((res) => setCurrentBatches(res));
        });
      })
      .catch((err) => {
        toast.dismiss();
        if (err.data === undefined) {
          toast.error('An error occured');
        } else {
          toast.error(err.data.message.split("'")[1]);
        }
      });
  }

  async function approve(contract: Contract): Promise<void> {
    toast.loading('Approving Token...');
    await contract
      .connect(library.getSigner())
      .approve(
        useZap
          ? contracts.butterBatchZapper.address
          : contracts.butterBatch.address,
        utils.parseEther('100000000'),
      )
      .then((res) => {
        res.wait().then((res) => {
          toast.dismiss();
          toast.success('Token approved!');
        });
      })
      .catch((err) => {
        toast.dismiss();
        if (err.data === undefined) {
          toast.error('An error occured');
        } else {
          toast.error(err.data.message.split("'")[1]);
        }
      });
  }

  return (
    <div className="w-full h-screen">
      <Navbar />
      <Toaster position="top-right" />
      <div className="">
        <div className="mx-auto lg:w-11/12 lglaptop:w-9/12 2xl:max-w-7xl mt-14">
          <div className="w-6/12">
            <h1 className="text-3xl font-bold">Popcorn Yield Optimizer</h1>
            <p className="mt-2 text-lg text-gray-500">
              Deposit your stablecoins to earn yield
            </p>
            <div className="flex flex-row items-center mt-2">
              <div className="pr-6 border-r-2 border-gray-200">
                <p className="text-base font-light text-gray-500 uppercase">
                  Est. APY
                </p>
                <p className="text-xl font-medium text-green-600">
                  {apy ? apy.toLocaleString() : '-'} %
                </p>
              </div>
              <div className="px-6 border-r-2 border-gray-200">
                <p className="text-base font-light text-gray-500 uppercase">
                  TVL
                </p>
                <p className="text-xl font-medium ">
                  $
                  {batchProcessTokens?.butter && butterSupply
                    ? formatAndRoundBigNumber(
                        butterSupply
                          .mul(batchProcessTokens?.butter.price)
                          .div(parseEther('1')),
                      ).toLocaleString()
                    : ' -'}{' '}
                </p>
              </div>
              <div className="pl-6">
                <p className="text-base font-light text-gray-500 uppercase">
                  Social Impact
                </p>
                <p className="text-lg font-medium text-gray-300">Coming Soon</p>
              </div>
            </div>
          </div>
          <div className="flex flex-row mt-10">
            <div className="w-1/3">
              {claimableBatches ? (
                <MintRedeemInterface
                  token={batchProcessTokens}
                  selectedToken={selectedToken}
                  selectToken={selectToken}
                  redeeming={redeeming}
                  setRedeeming={setRedeeming}
                  depositAmount={depositAmount}
                  setDepositAmount={setDepositAmount}
                  deposit={useUnclaimedDeposits ? hotswap : deposit}
                  depositDisabled={
                    useUnclaimedDeposits
                      ? isDepositDisabled(
                          depositAmount,
                          selectedToken.input.claimableBalance,
                        )
                      : isDepositDisabled(
                          depositAmount,
                          selectedToken.input.balance,
                        )
                  }
                  useUnclaimedDeposits={useUnclaimedDeposits}
                  setUseUnclaimedDeposits={setUseUnclaimedDeposits}
                  slippage={slippage}
                  setSlippage={setSlippage}
                />
              ) : (
                <div className="px-5 pt-6 mr-8 bg-white border border-gray-200 rounded-3xl pb-14 laptop:pb-10 shadow-custom">
                  <div className="w-full py-64 mt-1 mb-2 smlaptop:mt-2">
                    <MainActionButton
                      label="Connect Wallet"
                      handleClick={() => activate(connectors.Injected)}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="w-2/3">
              <div className="flex flex-row">
                <div className="w-1/2 mr-2">
                  <StatInfoCard
                    title="Butter Value"
                    content={`$ ${
                      batchProcessTokens?.butter
                        ? formatAndRoundBigNumber(
                            batchProcessTokens?.butter?.price,
                          )
                        : '-'
                    }`}
                    icon={{ icon: 'Money', color: 'bg-blue-300' }}
                  />
                </div>
                <div className="w-1/2 ml-2">
                  <BatchProgress
                    batchAmount={
                      currentBatches?.mint && batchProcessTokens?.butter
                        ? redeeming
                          ? bigNumberToNumber(
                              currentBatches.redeem.suppliedTokenBalance
                                .div(parseEther('1'))
                                .mul(batchProcessTokens?.butter.price),
                            )
                          : bigNumberToNumber(
                              currentBatches.mint.suppliedTokenBalance
                                .div(parseEther('1'))
                                .mul(batchProcessTokens?.threeCrv.price),
                            )
                        : 0
                    }
                    threshold={100000}
                  />
                </div>
              </div>

              <div className="w-full pt-8 pb-6 pl-2 pr-2 mt-8 border border-gray-200 h-min-content smlaptop:pt-16 laptop:pt-12 lglaptop:pt-16 2xl:pt-12 smlaptop:pb-10 lglaptop:pb-12 2xl:pb-10 rounded-4xl shadow-custom bg-primaryLight">
                <Tutorial />
              </div>
            </div>
          </div>
          {batches?.length > 0 && (
            <div className="w-full pb-12 mx-auto mt-10">
              <div className="p-2 overflow-hidden border border-gray-200 shadow-custom rounded-3xl">
                <ClaimableBatches
                  batches={batches}
                  claim={claim}
                  withdraw={withdraw}
                  slippage={slippage}
                  setSlippage={setSlippage}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
