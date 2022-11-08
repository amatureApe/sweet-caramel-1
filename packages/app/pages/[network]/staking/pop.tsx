import SuccessfulStakingModal from "@popcorn/app/components/staking/SuccessfulStakingModal";
import { ChainId } from "@popcorn/utils";
import StakeInterface, { defaultForm, InteractionType } from "@popcorn/app/components/staking/StakeInterface";
import StakeInterfaceLoader from "@popcorn/app/components/staking/StakeInterfaceLoader";
import TermsContent from "@popcorn/app/components/staking/TermsModalContent";
import { setMultiChoiceActionModal, setSingleActionModal } from "@popcorn/app/context/actions";
import { store } from "@popcorn/app/context/store";
import useBalanceAndAllowance from "@popcorn/app/hooks/staking/useBalanceAndAllowance";
import usePopLocker from "@popcorn/app/hooks/staking/usePopLocker";
import useTokenPrice from "@popcorn/app/hooks/useTokenPrice";
import useWeb3 from "@popcorn/app/hooks/useWeb3";
import { useChainIdFromUrl } from "@popcorn/app/hooks/useChainIdFromUrl";
import { useDeployment } from "@popcorn/app/hooks/useDeployment";
import { useRouter } from "next/router";
import React, { useContext, useEffect, useState } from "react";
import usePushWithinChain from "@popcorn/app/hooks/usePushWithinChain";
import { useTransaction } from "@popcorn/app/hooks/useTransaction";
import { ethers } from "ethers";

export default function PopStakingPage(): JSX.Element {
  const { account, signer, onContractSuccess, onContractError } = useWeb3();
  const chainId = useChainIdFromUrl();
  const { popStaking } = useDeployment(chainId);
  const { dispatch } = useContext(store);
  const router = useRouter();
  const pushWithinChain = usePushWithinChain();

  useEffect(() => {
    if ([ChainId.Arbitrum, ChainId.BNB].includes(chainId)) {
      pushWithinChain("staking");
    }
  }, [chainId]);

  const [form, setForm] = useState(defaultForm);
  const { data: stakingPool } = usePopLocker(popStaking, chainId);
  const balances = useBalanceAndAllowance(stakingPool?.stakingToken.address, account, popStaking, chainId);
  const stakingToken = stakingPool?.stakingToken;
  const transaction = useTransaction(chainId);
  const tokenPrice = useTokenPrice(stakingToken?.address, chainId);

  useEffect(() => {
    if (router?.query?.action === "withdraw") {
      setForm({ ...form, type: InteractionType.Withdraw });
    }
  }, [router?.query?.action]);

  function stake(): void {
    transaction(
      () => stakingPool?.contract
        .connect(signer)
        .lock(account, form.amount, 0),
      "Staking POP ...",
      "POP staked!",
      () => {
        balances.revalidate();
        setForm(defaultForm);
        if (!localStorage.getItem("hideStakeSuccessPopover")) {
          dispatch(
            setMultiChoiceActionModal({
              title: "Successfully staked POP",
              children: SuccessfulStakingModal,
              image: <img src="/images/modalImages/successfulStake.svg" />,
              onConfirm: {
                label: "Continue",
                onClick: () => dispatch(setMultiChoiceActionModal(false)),
              },
              onDontShowAgain: {
                label: "Do not remind me again",
                onClick: () => {
                  localStorage.setItem("hideStakeSuccessPopover", "true");
                  dispatch(setMultiChoiceActionModal(false));
                },
              },
              onDismiss: {
                onClick: () => {
                  dispatch(setMultiChoiceActionModal(false));
                },
              },
            }),
          );
        }
      }
    )
  }

  function withdraw(): void {
    transaction(
      () => stakingPool?.contract
        .connect(signer)
      ["processExpiredLocks(bool)"](false),
      "Withdrawing POP ...",
      "POP withdrawn!",
      () => {
        balances.revalidate();
        setForm({ ...defaultForm, type: InteractionType.Withdraw });
      })
  }

  function restake(): void {
    transaction(
      () => stakingPool.contract
        .connect(signer)
      ["processExpiredLocks(bool)"](true),
      "Restaking POP ...",
      "POP Restaked!",
      () => {
        balances.revalidate();
        setForm(defaultForm);
      }
    )
  }

  const openTermsModal = () => {
    dispatch(
      setSingleActionModal({
        title: "Terms & Conditions",
        isTerms: true,
        children: <TermsContent restake={restake} />,
      }),
    );
  };


  function approve(): void {
    transaction(
      () => stakingToken.contract.connect(signer).approve(stakingPool.address, ethers.constants.MaxUint256),
      `Approving POP ...`,
      `POPapproved!`,
      () => balances.revalidate(),
    );
  }

  return (
    <>
      {!stakingPool || !tokenPrice ? (
        <StakeInterfaceLoader />
      ) : (
        <StakeInterface
          stakingPool={stakingPool}
          user={balances}
          form={[form, setForm]}
          stake={stake}
          withdraw={withdraw}
          approve={approve}
          restake={openTermsModal}
          onlyView={!account}
          chainId={chainId}
          isPopLocker
          stakedTokenPrice={tokenPrice}
        />
      )}
    </>
  );
}
