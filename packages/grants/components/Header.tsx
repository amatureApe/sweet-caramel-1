import { Dialog, Menu, Transition } from "@headlessui/react";
import { DocumentAddIcon } from "@heroicons/react/outline";
import { ChevronDownIcon } from "@heroicons/react/solid";
import BeneficiaryFilter from "components/Beneficiaries/BeneficiaryFilter";
import Link from "next/link";
import { Fragment, useState } from "react";
import MobileBeneficiaryFilter from "./Beneficiaries/MobileBeneficiaryFilter";
import Button from "./CommonComponents/Button";
import WalletIcon from "./Svgs/WalletIcon";

const Header = () => {
  const [menuVisible, toggleMenu] = useState<boolean>(false);
  const filterList = [
    {
      name: "Beneficiary Applications",
    },
    {
      name: "Reported Beneficiaries",
    },
    {
      name: "Grant Rounds",
    },
  ];

  const switchFilter = (filter) => {
    console.log(filter);
  };
  return (
    <header className="container mx-auto flex justify-between py-4 md:py-5">
      <div className="pl-5 md:pl-10 flex gap-10 items-center">
        <Link href="/" passHref>
          <a>
            <img src="/images/smallLogo.svg" alt="Logo" className="h-10 flex-shrink-0 flex-grow-0" />
          </a>
        </Link>
        <Menu>
          <Menu.Button className="cursor-pointer hidden lg:flex relative">
            <p className="text-gray-500 font-semibold">Vote Now</p>
            <ChevronDownIcon className="w-5 h-5" aria-hidden="true" />
            <BeneficiaryFilter
              filterList={filterList}
              switchFilter={switchFilter}
              position="absolute top-10 left-1/2 transform -translate-x-1/2"
              width="w-60"
            />
          </Menu.Button>
        </Menu>
        <Link href="/" passHref>
          <a>
            <p className="text-gray-500 font-semibold hidden lg:block">Eligible Beneficiaries</p>
          </a>
        </Link>
        <Link href="/" passHref>
          <a>
            <p className="text-gray-500 font-semibold hidden lg:block">FAQ</p>
          </a>
        </Link>
      </div>

      <div className="pr-5 md:pr-10 flex items-center gap-5 md:gap-10">
        <Button variant="primary" className="md:w-44 py-3 px-8 md:px-0">
          <span className="hidden md:inline">Create Proposal</span>
          <DocumentAddIcon className="text-white md:hidden w-6 h-6" />
        </Button>
        <Button variant="secondary" className="md:w-44 py-3 px-8 md:px-0">
          <span className="hidden md:inline">Connect Wallet</span>
          <span className="md:hidden">
            <WalletIcon />
          </span>
        </Button>
        <button
          className="lg:hidden text-gray-500 w-5 h-5 relative focus:outline-none bg-white"
          onClick={() => toggleMenu(!menuVisible)}
        >
          <div className="block w-5 absolute">
            <span
              aria-hidden="true"
              className={`block absolute h-0.5 w-5 bg-current transform transition duration-500 ease-in-out ${
                menuVisible ? "rotate-45" : "-translate-y-1.5"
              }`}
            ></span>
            <span
              aria-hidden="true"
              className={`block absolute h-0.5 w-5 bg-current transform transition duration-500 ease-in-out ${
                menuVisible ? "opacity-0" : "opacity-100"
              }`}
            ></span>
            <span
              aria-hidden="true"
              className={`block absolute h-0.5 w-5 bg-current transform transition duration-500 ease-in-out ${
                menuVisible ? "-rotate-45" : "translate-y-1.5"
              }`}
            ></span>
          </div>
        </button>
      </div>
      <Transition.Root show={menuVisible} as={Fragment}>
        <Dialog as="div" className="fixed inset-0 overflow-hidden" onClose={() => toggleMenu(false)}>
          <div className="absolute inset-0 overflow-hidden">
            <Dialog.Overlay className="absolute inset-0" />

            <div className="fixed inset-x-0 top-20 bottom-0 max-w-full flex bg-white border border-gray-200">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-500 sm:duration-700"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-500 sm:duration-700"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <div className="w-screen">
                  <div className="h-full w-full flex flex-col pt-1 px-5 md:px-10 shadow-xl bg-white overflow-y-scroll">
                    <div className="flex flex-col divide-y divide-gray-200 w-full">
                      <Menu>
                        <Menu.Button className="cursor-pointer relative py-4">
                          <div className="flex gap-2">
                            <p className="text-gray-500 font-semibold">Vote Now</p>
                            <ChevronDownIcon className="w-5 h-5" aria-hidden="true" />
                          </div>
                          <MobileBeneficiaryFilter
                            filterList={filterList}
                            switchFilter={switchFilter}
                            position=""
                            width="w-60"
                          />
                        </Menu.Button>
                      </Menu>
                      <Link href="/" passHref>
                        <a>
                          <p className="text-gray-500 font-semibold py-4">Eligible Beneficiaries</p>
                        </a>
                      </Link>
                      <Link href="/" passHref>
                        <a>
                          <p className="text-gray-500 font-semibold py-4">FAQ</p>
                        </a>
                      </Link>
                    </div>
                  </div>
                </div>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>
    </header>
  );
};

export default Header;