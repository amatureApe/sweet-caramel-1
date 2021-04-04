import { useState } from 'react';
import { useEffect } from 'react';
import { useWeb3React } from '@web3-react/core';
import { Web3Provider } from '@ethersproject/providers';
import { connectors } from '../../containers/Web3/connectors';
import { Contract } from '@ethersproject/contracts';
import GrantRegistryAbi from '../../abis/GrantRegistry.json';
import BeneficiaryRegistryAbi from '../../abis/BeneficiaryRegistry.json';
import beneficiaryFixture from '../../fixtures/beneficiaries.json';
import activeElections from '../../fixtures/activeElections.json';
import closedElections from '../../fixtures/closedElections.json';
import createGrantRounds from 'utils/createGrantRounds';
import ElectionSection from 'containers/GrantElections/ElectionSection';
import createElectionName from 'utils/createElectionName';
import getBeneficiariesForElection from 'utils/getBeneficiariesForElection';
import Navbar from 'components/Navbar';

interface GrantElection {
  id: string;
  startTime: string;
  endTime: string;
  grantTerm: number;
  grantShareType: string;
  awardeesCount: number;
  awardees: string[];
  description: string;
  active: boolean;
}

export interface IGrantRoundFilter {
  active: boolean;
  closed: boolean;
}

export interface IVote {
  address: string;
  votes: number;
}

export interface IElectionVotes {
  votes: IVote[];
}

export default function GrantOverview() {
  const context = useWeb3React<Web3Provider>();
  const {
    connector,
    library,
    chainId,
    account,
    activate,
    deactivate,
    active,
    error,
  } = context;
  const [maxVotes, setMaxVotes] = useState<number>(0);
  const [votes, setVotes] = useState<any[]>([]);
  const [activeGrantElections, setActiveGrantElections] = useState<
    GrantElection[]
  >([]);
  const [closedGrantElections, setClosedGrantElections] = useState<
    GrantElection[]
  >([]);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [grantRegistry, setGrantRegistry] = useState<Contract>();
  const [beneficiaryRegistry, setBeneficiaryRegistry] = useState<Contract>();
  const [activeGrantRound, scrollToGrantRound] = useState<string>();
  const [grantRoundFilter, setGrantRoundFilter] = useState<IGrantRoundFilter>({
    active: true,
    closed: true,
  });

  useEffect(() => {
    //Get Demo Data
    setActiveGrantElections(
      activeElections.map((election) => ({
        ...election,
        id: `active-${election.grantTerm}-${election.startTime}`,
        active: true,
      })),
    );
    setClosedGrantElections(
      closedElections.map((election) => ({
        ...election,
        id: `closed-${election.grantTerm}-${election.startTime}`,
        active: false,
      })),
    );
    setBeneficiaries(beneficiaryFixture);
    setMaxVotes(550);
    const tempVotes = [[], [], []];
    activeElections.forEach(
      (election) =>
        (tempVotes[election.grantTerm] = election.awardees.map((awardee) => ({
          address: awardee,
          votes: 0,
        }))),
    );
    setVotes(tempVotes);
  }, []);

  useEffect(() => {
    if (!active) {
      activate(connectors.Network);
      if (library?.connection?.url === 'metamask' && chainId === 31337) {
        //TODO get pop -> to tell the user to either lock them or buy some
        //TODO get locked pop -> to vote or tell the user to lock pop
        //TODO swap the contract provider to signer so the user can vote
        grantRegistry.connect(library.getSigner());
      }
    }
  }, [active]);

  useEffect(() => {
    if (!library) {
      return;
    }
    setGrantRegistry(
      new Contract(
        process.env.NEXT_PUBLIC_GRANT_REGISTRY_ADDRESS,
        GrantRegistryAbi.abi,
        library,
      ),
    );
    setBeneficiaryRegistry(
      new Contract(
        process.env.NEXT_PUBLIC_BENEFICIARY_REGISTRY_ADDRESS,
        BeneficiaryRegistryAbi.abi,
        library,
      ),
    );
  }, [library]);

  useEffect(() => {
    if (!grantRoundFilter.active && !grantRoundFilter.closed) {
      setGrantRoundFilter({ active: true, closed: true });
    }
  }, [grantRoundFilter]);

  useEffect(() => {
    if (!grantRegistry && !beneficiaryRegistry) {
      return;
    }
    //DEMOING Contracts
    grantRegistry.getActiveGrant(1).then((activeGrant) => {
      console.log(activeGrant[0].toNumber());
      setClosedGrantElections([
        {
          startTime: String(activeGrant[0].toNumber()),
          endTime: String(activeGrant[1].toNumber()),
          id: `closed-1-${activeGrant[0].toNumber() * 1000}`,
          grantTerm: 1,
          grantShareType: activeGrant[3],
          awardees: [''],
          awardeesCount: activeGrant[4],
          description: 'A description that will later be pulled from IPFS',
          active: false,
        },
      ]);
    });
    grantRegistry.getActiveAwardees(1).then((activeAwardees) =>
      setClosedGrantElections((prevState) => [
        ...prevState.filter((election) => election.grantTerm !== 1),
        {
          ...prevState.find((election) => election.grantTerm === 1),
          awardees: activeAwardees,
        },
      ]),
    );
  }, [grantRegistry, beneficiaryRegistry]);

  useEffect(() => {
    if (!beneficiaryRegistry) {
      return;
    }
    //Go through each election and call the function per beneficiary
    beneficiaryRegistry
      .getBeneficiary('0x22f5413C075Ccd56D575A54763831C4c27A37Bdb')
      .then((res) => console.log('beneficiary ipfs-hash', res));
  }, [activeGrantElections, closedGrantElections]);

  function connectWallet() {
    activate(connectors.Injected);
  }

  function submitVotes() {
    console.log('SUBMIT VOTES');
    console.log(
      votes.map((election) =>
        election.map((awardee) => [awardee.address, awardee.votes]),
      ),
    );
    console.log('__________________');
  }

  function assignVotes(grantTerm: number, vote: IVote): void {
    console.log('grantTerm', grantTerm);
    console.log('vote', vote);
    const votesCopy = [...votes];
    const updatedElection = [
      ...votesCopy[grantTerm].filter(
        (awardee) => awardee.address !== vote.address,
      ),
      vote,
    ];
    votesCopy.splice(grantTerm, 1, updatedElection);
    setVotes(votesCopy);
  }

  return (
    <div className="w-full">
      <Navbar />
      {[...activeGrantElections, ...closedGrantElections]
        .filter(
          (election) =>
            (election.active && grantRoundFilter.active) ||
            (!election.active && grantRoundFilter.closed),
        )
        .sort(
          (election1, election2) =>
            Number(election2.startTime) - Number(election1.startTime),
        )
        .map((election) => (
          <ElectionSection
            key={election.id}
            id={election.id}
            title={createElectionName(election)}
            description={election.description}
            grantTerm={election.grantTerm}
            isActiveElection={election.active}
            beneficiaries={getBeneficiariesForElection(
              beneficiaries,
              election.awardees,
            )}
            maxVotes={maxVotes}
            votes={election.active ? votes[election.grantTerm] : null}
            grantRounds={createGrantRounds(activeElections, closedElections)}
            isWalletConnected={library?.connection?.url === 'metamask'}
            grantRoundFilter={grantRoundFilter}
            assignVotes={assignVotes}
            connectWallet={connectWallet}
            submitVotes={submitVotes}
            scrollToGrantRound={scrollToGrantRound}
            setGrantRoundFilter={setGrantRoundFilter}
            scrollToMe={election.id === activeGrantRound}
            quadratic={false}
          />
        ))}
    </div>
  );
}
