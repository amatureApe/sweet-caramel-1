import { PopLocker, Staking } from '@popcorn/hardhat/typechain';
import TokenIcon from 'components/TokenIcon';

interface ClaimCardProps {
  disabled: boolean;
  tokenName: string;
  claimAmount: number;
  handler: (pool: Staking | PopLocker, isPopLocker: boolean) => void;
  pool: Staking | PopLocker;
  isPopLocker?;
}

const ClaimCard: React.FC<ClaimCardProps> = ({
  disabled,
  tokenName,
  claimAmount,
  handler,
  pool,
  isPopLocker = false,
}) => {
  return (
    <div
      className={`flex flex-row items-center justify-between px-8 w-full h-48 mb-8 shadow-custom rounded-3xl border border-gray-200 ${
        disabled ? 'bg-gray-50' : 'bg-cardBg'
      }`}
    >
      <div className="flex flex-row items-center my-auto">
        <div className={disabled ? 'opacity-50' : 'opacity-100'}>
          <TokenIcon token={tokenName} />
        </div>
        <h1
          className={`text-3xl font-bold leading-none text-baseline mt-1 ml-8 ${
            disabled ? 'text-gray-400' : 'text-gray-800'
          }`}
        >
          {tokenName}
        </h1>
      </div>
      <div className="flex flex-row items-center my-auto">
        <h1
          className={`text-3xl font-bold leading-none mr-8 mt-1 ${
            disabled ? 'text-gray-400' : 'text-gray-800'
          }`}
        >
          {claimAmount.toLocaleString()} POP
        </h1>
        <button
          onClick={() => {
            handler(pool, isPopLocker);
          }}
          disabled={disabled}
          className="mx-auto my-auto bg-blue-600 rounded-full justify-self-center py-3 px-10 mb-1 leading-none cursor-pointer hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-default"
        >
          <p className="font-semibold text-lg text-white">Claim</p>
        </button>
      </div>
    </div>
  );
};

export default ClaimCard;