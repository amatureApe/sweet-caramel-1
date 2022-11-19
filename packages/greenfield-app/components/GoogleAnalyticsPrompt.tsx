import { Transition } from "@headlessui/react";
import MainActionButton from "@popcorn/app/components/MainActionButton";
import React, { useState } from "react";
import TertiaryActionButton from "@popcorn/app/components/TertiaryActionButton";
import { useFeatures } from "@popcorn/app/hooks/useFeatures";

type WindowWithDataLayer = Window & {
  dataLayer: Record<string, any>[];
};

declare const window: WindowWithDataLayer;

const GoogleAnalyticsPrompt = ({ acceptGoogleAnalytics }) => {
  const {
    features: { optin_analytics: visible },
  } = useFeatures();

  const [openAnalyticsPrompt, setOpenAnalyticsPrompt] = useState(true);

  const handleAccept = () => {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: "pageView",
      url: window.location.pathname,
    });
    acceptGoogleAnalytics();
    setOpenAnalyticsPrompt(false);
  };

  const handleDecline = () => {
    setOpenAnalyticsPrompt(false);
  };

  if (!visible) {
    return <></>;
  }

  return (
    <Transition show={openAnalyticsPrompt}>
      <Transition.Child
        enter="transition ease-out duration-300 transform"
        enterFrom="opacity-0 translate-y-full"
        enterTo="opacity-100 translate-y-0"
        leave="transition transform ease-in duration-300"
        leaveFrom="opacity-100 translate-y-0"
        leaveTo="opacity-0 translate-y-full"
      >
        <div className="bg-white w-full py-6 px-8 rounded-t-lg shadow-custom flex flex-col md:flex-row items-center justify-center space-y-6 md:space-y-0 md:space-x-10 fixed bottom-0 left-0 z-40">
          <p className="text-primaryDark">
            Popcorn uses Google analytics to enhance your experience, understand site usage, <br /> and assist in our
            marketing efforts.
          </p>
          <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-6 w-full md:w-auto">
            <MainActionButton label="Accept" handleClick={handleAccept} />
            <TertiaryActionButton label="Decline" handleClick={handleDecline} />
          </div>
        </div>
      </Transition.Child>
    </Transition>
  );
};

export default GoogleAnalyticsPrompt;
