import React from "react";

const SecuritySection = () => {
  return (
    <section className="grid grid-cols-12 md:gap-14 px-6 md:px-8">
      <div className="col-span-12 md:col-span-3 pt-10 hidden md:block">
        <h1 className="text-6xl leading-12 pt-10">Security</h1>
        <p className="mt-4">Our smart contract has been audited by the best in the business.</p>
      </div>
      <div className="col-span-12 md:col-span-9 grid grid-cols-3 gap-8 mt-9">
        <div className="col-span-3 md:col-span-1">
          <div className=" bg-customRed rounded-lg p-14 h-80 w-full md:w-80 flex justify-center items-center">
            <img src="/images/zokyo.svg" alt="" className="rounded-lg" />
          </div>
          <p className="text-gray-900 text-3xl leading-9 mt-6 mb-4">Zokyo</p>
          <p className="text-customDarkGray leading-5">
            Zokyo is an end-to-end security resource that provides distinguishable security auditing and penetration
            testing services alongside prominent vulnerability assessments.
          </p>
        </div>

        <div className="col-span-3 md:col-span-1">
          <div className=" bg-customPurple rounded-lg p-14 h-80 w-full md:w-80 flex justify-center items-center">
            <img src="/images/g0.svg" alt="" className="rounded-lg" />
          </div>
          <p className="text-gray-900 text-3xl leading-9 mt-6 mb-4">g0</p>
          <p className="text-customDarkGray leading-5">
            Neque porro quisquam est qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit Lorem ipsum
            dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt.
          </p>
        </div>

        <div className="col-span-3 md:col-span-1">
          <div className=" bg-customGreen rounded-lg p-14 h-80 w-full md:w-80 flex justify-center items-center">
            <img src="/images/immunefi.svg" alt="" className="rounded-lg" />
          </div>
          <p className="text-gray-900 text-3xl leading-9 mt-6 mb-4">Immunefi</p>
          <p className="text-customDarkGray leading-5">Immunefi is the leading bug bounty platform for Web3.</p>
        </div>
      </div>
    </section>
  );
};

export default SecuritySection;