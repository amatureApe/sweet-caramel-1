import { Menu, Transition } from '@headlessui/react';
import { store } from 'context/store';
import React, { Fragment, useContext } from 'react';
import { ChainId } from '../../context/Web3/connectors';
import NetworkOptionsMenuItem from './NetworkOptionsMenuItem';

interface NetworkOptionsMenuProps {
  currentChain: number;
  switchNetwork: (chainId: number, dispatch: React.Dispatch<any>) => void;
}

const NetworkOptionsMenu: React.FC<NetworkOptionsMenuProps> = ({
  currentChain,
  switchNetwork,
  ...props
}) => {
  const { dispatch } = useContext(store);

  return (
    <Transition
      as={Fragment}
      enter="transition ease-out duration-100"
      enterFrom="transform opacity-0 scale-95"
      enterTo="transform opacity-100 scale-100"
      leave="transition ease-in duration-75"
      leaveFrom="transform opacity-100 scale-100"
      leaveTo="transform opacity-0 scale-95"
    >
      <Menu.Items className="absolute top-14 w-48 bg-white rounded-3xl shadow-md border-gray-200 border-solid border focus:outline-none ">
        <p className="text-center align-middle text-md font-light leading-none h-16 rounded-t-3xl border-b border-solid border-gray-200 pt-6 pb-3 ">
          Select a Network{' '}
        </p>

        <NetworkOptionsMenuItem
          chainId={ChainId.Ethereum}
          switchNetwork={(chainId) => switchNetwork(chainId, dispatch)}
          currentChainId={currentChain}
        />

        <NetworkOptionsMenuItem
          chainId={ChainId.Polygon}
          switchNetwork={(chainId) => switchNetwork(chainId, dispatch)}
          currentChainId={currentChain}
        />

        {[ChainId.Hardhat, ChainId.Localhost].includes(
          parseInt(process.env.CHAIN_ID),
        ) && [
          <NetworkOptionsMenuItem
            chainId={ChainId.Hardhat}
            switchNetwork={(chainId) => switchNetwork(chainId, dispatch)}
            currentChainId={currentChain}
            key={ChainId.Hardhat}
          />,
          <NetworkOptionsMenuItem
            chainId={ChainId.Rinkeby}
            switchNetwork={(chainId) => switchNetwork(chainId, dispatch)}
            currentChainId={currentChain}
            key={ChainId.Rinkeby}
          />,
        ]}

        <NetworkOptionsMenuItem
          chainId={ChainId.Arbitrum}
          switchNetwork={(chainId) => switchNetwork(chainId, dispatch)}
          currentChainId={currentChain}
          last={true}
        />
      </Menu.Items>
    </Transition>
  );
};

export default NetworkOptionsMenu;