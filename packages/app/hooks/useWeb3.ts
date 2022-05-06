import { getChainRelevantContracts } from "@popcorn/hardhat/lib/utils/getContractAddresses";
import { ethers } from "@popcorn/hardhat/node_modules/ethers/lib";
import { useConnectWallet, useSetChain, useWallets } from "@web3-onboard/react";
import { setNetworkChangePromptModal } from "context/actions";
import { store } from "context/store";
import { ChainId, PRC_PROVIDERS } from "context/Web3/connectors";
import { getStorage, removeStorage, setStorage } from "helper/safeLocalstorageAccess";
import toTitleCase from "helper/toTitleCase";
import useWeb3Callbacks from "helper/useWeb3Callbacks";
import { useRouter } from "next/router";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";

export default function useWeb3() {
  const router = useRouter();
  const [{ connecting, wallet }, connect, disconnect] = useConnectWallet();
  const [{ chains, connectedChain, settingChain }, setChain] = useSetChain();
  const [awaitingChainChange, setAwaitingChainChange] = useState<number | false>(false);

  const walletProvider = useMemo(
    () => (wallet?.provider ? new ethers.providers.Web3Provider(wallet?.provider, "any") : null),
    [wallet?.provider],
  );
  const signer = useMemo(() => (walletProvider ? walletProvider.getSigner() : null), [walletProvider]);

  const signerOrProvider = signer || getCurrentRpcProvider();
  const connectedAccount = wallet?.accounts[0];
  const accountAddress = connectedAccount?.address;
  const contractAddresses = useMemo(() => getChainRelevantContracts(getChainId()), [getChainId()]);
  const wallets = useWallets();
  const { onSuccess: onContractSuccess, onError: onContractError } = useWeb3Callbacks(getChainId());

  const { dispatch } = useContext(store);

  useEffect(() => {
    // Eagerconnect
    if (!wallet && previouslyConnectedWallets?.length > 0) {
      handleConnect();
    }
  }, []);
  useEffect(() => {
    // Track Connected wallets for eagerconnect
    if (wallets?.length > 0) {
      setStorage("connectedWallets", JSON.stringify(wallets.map(({ label }) => label)));
    }
  }, [wallets]);

  useEffect(() => {
    // Detect and alert mismatch between connected chain and URL

    if (
      connectedChain?.id &&
      typeof router?.query?.network === "string" &&
      ChainId[Number(connectedChain.id)] !== toTitleCase(router.query.network)
    ) {
      alertChainInconsistency(router?.query?.network, ChainId[Number(connectedChain.id)]);
    }
  }, [router?.query?.network, wallet, connectedChain?.id]);

  useEffect(() => {
    // Navigate to new URL after chain is switched in wallet
    if (awaitingChainChange) {
      if (connectedChain.id === idToHex(awaitingChainChange)) {
        pushNetworkChange(ChainId[awaitingChainChange], true);
      }
      setAwaitingChainChange(false);
    }
  }, [connectedChain?.id]);

  const pushWithinChain = useCallback(
    (url, shallow = false) =>
      router.push({ pathname: `/${router?.query?.network}${url}` }, undefined, {
        shallow: shallow,
      }),
    [router, router?.query?.network],
  );

  const previouslyConnectedWallets = JSON.parse(getStorage("connectedWallets"));

  return {
    account: accountAddress,
    chainId: getChainId(),
    connect: handleConnect,
    disconnect: handleDisconnect,
    connecting,
    signerOrProvider,
    rpcProvider: getCurrentRpcProvider(),
    signer: !signerOrProvider || "getSigner" in signerOrProvider ? null : signerOrProvider,
    contractAddresses,
    onContractSuccess,
    onContractError,
    chains,
    setChain: (newChainId) => setChainFromNumber(newChainId),
    settingChain,
    wallet,
    pushWithinChain,
  };

  async function handleDisconnect(): Promise<void> {
    removeStorage("connectedWallets");
    await disconnect({ label: wallet?.label });
  }

  async function handleConnect(): Promise<void> {
    return previouslyConnectedWallets
      ? await connect({ autoSelect: previouslyConnectedWallets[0] })
      : await connect({});
  }

  function getNonWalletChain(): string {
    return typeof router?.query?.network === "string" ? toTitleCase(router.query.network) : process.env.DEFAULT_CHAIN;
  }

  function getChainId(): number {
    return Number(connectedChain?.id) || ChainId[getNonWalletChain()];
  }

  async function setChainFromNumber(newChainId: number): Promise<void> {
    if (wallet) {
      await setChain({ chainId: idToHex(newChainId) }).then(() => setAwaitingChainChange(newChainId));
    } else {
      await pushNetworkChange(ChainId[newChainId], true);
    }
  }

  function getCurrentRpcProvider() {
    return PRC_PROVIDERS[getChainId()];
  }

  function idToHex(newChainId: number): string {
    return ethers.utils.hexStripZeros(ethers.utils.hexlify(newChainId));
  }

  async function pushNetworkChange(network: string, shallow: boolean): Promise<boolean> {
    return router.push(
      { pathname: router.pathname, query: { ...router.query, network: network.toLowerCase() } },
      undefined,
      {
        shallow: shallow,
      },
    );
  }

  function alertChainInconsistency(intendedChain: string, actualChain: string): void {
    dispatch(
      setNetworkChangePromptModal({
        content: `You are viewing a page on ${toTitleCase(intendedChain)} but your wallet is set to ${toTitleCase(
          actualChain,
        )}.`,
        title: "Network Inconsistency",
        type: "error",
        onChangeUrl: {
          label: `Continue on ${toTitleCase(actualChain)}`,
          onClick: () => {
            pushNetworkChange(toTitleCase(actualChain), true);
            dispatch(setNetworkChangePromptModal(false));
          },
        },
        onChangeNetwork: {
          label: `Switch to ${toTitleCase(intendedChain)}`,
          onClick: () => {
            setChainFromNumber(ChainId[toTitleCase(intendedChain)]).then((res) =>
              dispatch(setNetworkChangePromptModal(false)),
            );
          },
        },
        onDisconnect: {
          label: "Disconnect Wallet",
          onClick: async () => {
            await handleDisconnect();
            dispatch(setNetworkChangePromptModal(false));
          },
        },
      }),
    );
  }
}
