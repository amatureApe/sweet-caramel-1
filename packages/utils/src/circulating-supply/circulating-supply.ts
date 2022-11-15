import { BigNumber, constants, Contract } from "ethers/lib/ethers";
import { Multicall } from "./multicall";
import { formatEther } from "ethers/lib/utils";
import { PROVIDERS } from "./providers";
import { EXCLUDED_ADDRESSES, POP } from "./config";
import { JsonRpcProvider } from "@ethersproject/providers";
import { cache } from "./cache";

const START_BLOCK = undefined; // set to 0 to do small test run of 5000 blocks, otherwise set to undefined to check all blocks since genesis

const getHolders = async (tokenAddress, startBlock, provider: JsonRpcProvider[]) => {
  startBlock = startBlock === 0 ? (await provider[0].getBlockNumber()) - 5000 : startBlock;
  const network = await provider[0].getNetwork();
  startBlock = cache.exists(network.chainId) ? cache.get(network.chainId).lastBlock + 1 : startBlock;

  const currentBlock = await provider[0].getBlockNumber();
  console.log({ currentBlock });

  const contract = () =>
    new Contract(
      tokenAddress,
      [
        network.chainId == 1
          ? "event Transfer(address indexed _from, address indexed _to, uint256 _amount)"
          : "event Transfer(address indexed from, address indexed to, uint256 value)",
      ],
      currentBlock % 2 ? provider[0] : provider[1],
    );

  const getHolderBatch = async (_startBlock) => {
    let errors = false;
    let holders = [];
    const batchSize = 2000;
    const endBlock = _startBlock + batchSize > currentBlock ? currentBlock : _startBlock + batchSize;
    const batches = Math.ceil((currentBlock - startBlock) / batchSize);
    console.log("batch ", Math.ceil((currentBlock - _startBlock) / batchSize), " of ", batches);

    await contract()
      .queryFilter(contract().filters.Transfer(), _startBlock, endBlock)
      .then((events) => {
        events.map((event) => {
          const to = event?.args?._to || event?.args?.to;
          to && !EXCLUDED_ADDRESSES[to.toLowerCase()] && holders.push(to.toLowerCase());
        });
      })
      .catch((e) => {
        errors = true;
        console.log(e);
      });

    if (errors) return getHolderBatch(_startBlock);

    cache.write([...new Set([...cache.get(network.chainId).holders, ...holders])], network.chainId, endBlock);

    // await new Promise((resolve) => setTimeout(resolve, 50));

    if (endBlock != currentBlock) {
      return getHolderBatch(endBlock);
    }

    return cache.get(network.chainId).holders;
  };
  return getHolderBatch(startBlock);
};

const holders = {
  ethereum: (startBlock?) => getHolders(POP.ethereum.address, startBlock ?? POP.ethereum.genesis, PROVIDERS.ethereum),
  polygon: (startBlock?) => getHolders(POP.polygon.address, startBlock ?? POP.polygon.genesis, PROVIDERS.polygon),
  arbitrum: (startBlock?) => getHolders(POP.arbitrum.address, startBlock ?? POP.arbitrum.genesis, PROVIDERS.arbitrum),
  bnb: (startBlock?) => getHolders(POP.bnb.address, startBlock ?? POP.bnb.genesis, PROVIDERS.bnb),
};

const multicall = (address, provider) => {
  return new Multicall({
    address: "0xcA11bde05977b3631167028862bE2a173976CA11",
    targets: [
      [
        "pop",
        new Contract(
          address == POP.ethereum.address ? "0x50a7c5a2aA566eB8AAFc80ffC62E984bFeCe334F" : address, // use token manager to get spendableBalanceOf if pop on ethereum
          address == POP.ethereum.address
            ? ["function spendableBalanceOf(address) view returns (uint256)"]
            : ["function balanceOf(address) view returns (uint256)"],
          provider,
        ),
      ],
    ],
  });
};

const cs = async (network, provider, token) => {
  console.log(`calculating ${network} circulating supply ...`);
  const _multicall = multicall(token, provider);
  await holders[network](START_BLOCK).then((_holders) =>
    _holders.map(
      (holder) =>
        !EXCLUDED_ADDRESSES[holder] &&
        _multicall.push("pop", network == "ethereum" ? "spendableBalanceOf" : "balanceOf", [holder]),
    ),
  );
  const balances = (await _multicall.call(provider)) as BigNumber[][];
  return balances.reduce((_balances, balance) => {
    return _balances.add(balance[0]);
  }, constants.Zero);
};

const main = async () => {
  const ethereum_cs = await cs("ethereum", PROVIDERS.ethereum[0], POP.ethereum.address);
  const bnb_cs = await cs("bnb", PROVIDERS.bnb[0], POP.bnb.address);
  const arbitrum_cs = await cs("arbitrum", PROVIDERS.arbitrum[1], POP.arbitrum.address);
  const polygon_cs = await cs("polygon", PROVIDERS.polygon[0], POP.polygon.address);

  console.log("total circulating supply: ", formatEther(ethereum_cs.add(polygon_cs).add(arbitrum_cs).add(bnb_cs)));
};

main()
  .catch((e) => console.error(e))
  .then(() => process.exit(0));
