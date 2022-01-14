import { BigNumber } from '@ethersproject/bignumber';
import MainActionButton from 'components/MainActionButton';
import TertiaryActionButton from 'components/TertiaryActionButton';
import { Dispatch, useState } from 'react';
import OutputToken from './OutputToken';
import SlippageSettings from './SlippageSettings';

interface ZapModalProps {
  slippage: number;
  setSlippage: Dispatch<number>;
  closeModal: Function;
  withdraw: Function;
  claim: Function;
  batchId: string;
  withdrawAmount: BigNumber;
  isWithdraw?: boolean;
}

const OUTPUT_TOKEN = ['3CRV', 'DAI', 'USDC', 'USDT'];

export default function ZapModal({
  slippage,
  setSlippage,
  closeModal,
  withdraw,
  claim,
  batchId,
  withdrawAmount,
  isWithdraw = false,
}: ZapModalProps): JSX.Element {
  const [selectedToken, selectToken] = useState<string>('3CRV');

  return (
    <div className="flex flex-col mt-4">
      <OutputToken
        outputToken={OUTPUT_TOKEN}
        selectToken={selectToken}
        selectedToken={selectedToken}
      />
      <div className="mt-4">
        <SlippageSettings slippage={slippage} setSlippage={setSlippage} />
      </div>
      <div className="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-4 sm:grid-flow-row-dense">
        <TertiaryActionButton
          label={'Cancel'}
          handleClick={() => {
            closeModal();
          }}
        ></TertiaryActionButton>
        <MainActionButton
          label={isWithdraw ? 'Withdraw' : 'Claim'}
          handleClick={() => {
            isWithdraw
              ? withdraw(
                  batchId,
                  withdrawAmount,
                  selectedToken !== '3CRV',
                  selectedToken.toLowerCase(),
                )
              : claim(
                  batchId,
                  selectedToken !== '3CRV',
                  selectedToken.toLowerCase(),
                );
            closeModal();
          }}
        ></MainActionButton>
      </div>
    </div>
  );
}