import { InformationCircleIcon } from '@heroicons/react/outline';
import { ArrowSmDownIcon, ArrowSmUpIcon } from '@heroicons/react/solid';
import React from 'react';
import ReactTooltip from 'react-tooltip';

export interface StatCardData {
  change: string;
  changeType: 'increase' | 'decrease';
  icon: Icon | ((props: React.ComponentProps<'svg'>) => JSX.Element);
  id: number;
  name: string;
  statCur: number;
  statPrev: number;
}

interface StatCardProps {
  data: StatCardData;
  iconCol: string;
  showChange: boolean;
}

function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

export const StatCard: React.FC<StatCardProps> = ({
  data,
  iconCol,
  showChange,
}): JSX.Element => {
  return (
    <div
      key={data.name}
      className="relative h-24 bg-white pt-5 px-4 pb-12 sm:pt-6 sm:px-6 shadow rounded-lg overflow-hidden mr-4 mb-4"
      style={{ width: '20rem' }}
    >
      <dt>
        <div
          className={`absolute rounded-md p-3`}
          style={{ background: iconCol }}
        >
          <data.icon className="h-6 w-6 text-white" aria-hidden="true" />
        </div>
        <div className="flex flex-row justify-between">
          <p className="ml-16 text-sm font-light text-gray-500 truncate">
            {data.name}
          </p>
          <InformationCircleIcon
            data-tip
            data-for={data.name}
            className="h-6 w-6 text-gray-500"
          />
        </div>
      </dt>
      <dd className="ml-16 pb-6 flex items-baseline sm:pb-7">
        <p className="text-2xl font-semibold text-gray-900">
          {'$' + (Math.round(data.statCur * 100) / 100).toLocaleString()}
        </p>
        {showChange && (
          <p
            className={classNames(
              data.changeType === 'increase'
                ? 'text-green-600'
                : 'text-red-600',
              'ml-2 flex items-baseline text-sm font-semibold',
            )}
          >
            {data.changeType === 'increase' ? (
              <ArrowSmUpIcon
                className="self-center flex-shrink-0 h-5 w-5 text-green-500"
                aria-hidden="true"
              />
            ) : (
              <ArrowSmDownIcon
                className="self-center flex-shrink-0 h-5 w-5 text-red-500"
                aria-hidden="true"
              />
            )}
            <span className="sr-only">
              {data.changeType === 'increase' ? 'Increased' : 'Decreased'} by
            </span>
            {data.change}
          </p>
        )}
      </dd>

      <ReactTooltip
        id={data.name}
        place="bottom"
        effect="solid"
        type="light"
        className="rounded-lg shadow-lg border border-gray-50 p-1 w-72 "
      >
        <p className="text-center text-md justify-self-center font-bold mb-1">
          {data.name}
        </p>
        <p className="text-sm font-light text-gray-500 ">
          {data.name === 'Total Balance' &&
            'Total acquisition of deposits, HYSI and pending withdrawls'}
          {data.name === 'HYSI' && 'HYSI desc'}
          {data.name === 'Claimable HYSI' && 'Claimable HYSI desc'}
          {data.name === 'Pending Withdraw' && 'Pending withdrawl desc'}
        </p>
      </ReactTooltip>
    </div>
  );
};
