import ConnectDepositCard from "@popcorn/app/components/Common/ConnectDepositCard";
import SliderContainer from "@popcorn/app/components/Common/SliderContainer";
import SecondaryActionButton from "@popcorn/app/components/SecondaryActionButton";
import useWeb3 from "@popcorn/app/hooks/useWeb3";
import { NetworthCard } from "@popcorn/app/components/landing/NetworthCard";
import { TVLCard } from "@popcorn/app/components/landing/TVLCard";
import { useIsConnected } from "@popcorn/app/hooks/useIsConnected";

export default function Hero(): JSX.Element {
  const { connect } = useWeb3();
  const isConnected = useIsConnected();
  return (
    <section className="grid grid-cols-12 md:gap-8">
      <div className="col-span-12 md:col-span-3">
        <div className="grid grid-cols-12 w-full gap-4 md:gap-0">
          <TVLCard />
          <NetworthCard hidden={!isConnected} />
        </div>
        <div
          className={`rounded-lg md:border md:border-customLightGray px-0 pt-4 md:p-6 md:pb-0 mt-6 group ${
            isConnected ? "hidden" : ""
          }`}
          role="button"
          onClick={() => connect()}
        >
          <p className="text-gray-900 text-3xl leading-8 hidden md:block">Connect your wallet</p>
          <div className="border md:border-0 md:border-t border-customLightGray rounded-lg md:rounded-none px-6 md:px-0  py-6 md:py-2 md:mt-4">
            <div className="hidden md:block">
              <SecondaryActionButton label="Connect" />
            </div>
            <div className="md:hidden">
              <SecondaryActionButton label="Connect Wallet" />
            </div>
          </div>
        </div>
      </div>

      <div className="col-span-12 md:col-span-8 md:col-start-4 pt-6">
        <h6 className=" font-medium leading-6">Built With</h6>
        <SliderContainer slidesToShow={4}>
          <img src="/images/builtWithLogos/curve.svg" alt="" className="px-2 md:px-5 w-10 h-10 object-contain" />
          <img src="/images/builtWithLogos/synthetix.svg" alt="" className="px-2 md:px-5 w-10 h-10 object-contain" />
          <img src="/images/builtWithLogos/setLogo.svg" alt="" className="px-2 md:px-5 w-10 h-10 object-contain" />
          <img src="/images/builtWithLogos/yearn.svg" alt="" className="px-2 md:px-5 w-10 h-10 object-contain" />
          <img src="/images/builtWithLogos/uniswap.svg" alt="" className="px-2 md:px-5 w-10 h-10 object-contain" />
        </SliderContainer>
      </div>
    </section>
  );
}
