// SPDX-License-Identifier: GPL-3.0
// Docgen-SOLC: 0.8.0
pragma solidity ^0.8.0;

import { SafeERC20 } from "openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import { Math } from "openzeppelin-contracts/utils/math/Math.sol";
import { Owned } from "./Owned.sol";
import { ContractRegistryAccess, IContractRegistry } from "./ContractRegistryAccess.sol";
import { KeeperIncentivized, IKeeperIncentiveV2 } from "./KeeperIncentivized.sol";

contract MultiRewardsEscrow is Owned, ContractRegistryAccess, KeeperIncentivized {
  using SafeERC20 for IERC20;

  /*//////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

  constructor(IContractRegistry contractRegistry) Owned(msg.sender) ContractRegistryAccess(contractRegistry) {}

  /*//////////////////////////////////////////////////////////////
                            GET ESCROW VIEWS
    //////////////////////////////////////////////////////////////*/

  /**
   * @notice Returns all userEscrowIds
   * @param account user
   */
  function getEscrowIdsByUser(address account) external view returns (bytes32[] memory) {
    return userEscrowIds[account];
  }

  /**
   * @notice Returns all userEscrowIds by token
   * @param account user
   * @param token rewardsToken
   */
  function getEscrowIdsByUserAndToken(address account, IERC20 token) external view returns (bytes32[] memory) {
    return userEscrowIdsByToken[account][token];
  }

  /**
   * @notice Returns an array of Escrows
   * @param escrowIds array of escrow ids
   * @dev there is no check to ensure that all escrows are owned by the same account. Make sure to account for this either by only sending ids for a specific account or by filtering the Escrows by account later on.
   */
  function getEscrows(bytes32[] calldata escrowIds) external view returns (Escrow[] memory) {
    Escrow[] memory selectedEscrows = new Escrow[](escrowIds.length);
    for (uint256 i = 0; i < escrowIds.length; i++) {
      selectedEscrows[i] = escrows[escrowIds[i]];
    }
    return selectedEscrows;
  }

  /*//////////////////////////////////////////////////////////////
                            LOCK LOGIC
    //////////////////////////////////////////////////////////////*/

  struct Escrow {
    IERC20 token;
    uint256 start;
    uint256 lastUpdateTime;
    uint256 end;
    uint256 initialBalance;
    uint256 balance;
    address account;
  }

  // EscrowId => Escrow
  mapping(bytes32 => Escrow) public escrows;

  // User => Escrows
  mapping(address => bytes32[]) public userEscrowIds;
  // User => RewardsToken => Escrows
  mapping(address => mapping(IERC20 => bytes32[])) public userEscrowIdsByToken;

  uint256 internal nonce;

  event Locked(IERC20 indexed token, address indexed account, uint256 amount, uint256 duration, uint256 offset);

  error ZeroAddress();
  error ZeroAmount();

  /**
   * @notice Locks funds for escrow
   * @dev This creates a separate escrow structure which can later be iterated upon to unlock the escrowed funds
   */
  function lock(IERC20 token, address account, uint256 amount, uint256 duration, uint256 offset) external {
    if (token == IERC20(address(0))) revert ZeroAddress();
    if (account == address(0)) revert ZeroAddress();
    if (amount == 0) revert ZeroAmount();
    if (duration == 0) revert ZeroAmount();

    nonce++;

    bytes32 id = keccak256(abi.encodePacked(token, account, amount, nonce));

    uint256 feePerc = feePercs[token];
    if (feePerc > 0) {
      uint256 fee = Math.mulDiv(amount, feePerc, 1e18);

      amount -= fee;
      fees[token] += fee;
    }

    uint256 start = block.timestamp + offset;

    escrows[id] = Escrow({
      token: token,
      start: start,
      lastUpdateTime: start,
      end: start + duration,
      initialBalance: amount,
      balance: amount,
      account: account
    });

    userEscrowIds[account].push(id);
    userEscrowIdsByToken[account][token].push(id);

    token.safeTransferFrom(msg.sender, address(this), amount);

    emit Locked(token, account, amount, duration, offset);
  }

  /*//////////////////////////////////////////////////////////////
                            CLAIM LOGIC
    //////////////////////////////////////////////////////////////*/

  error NotClaimable(bytes32 escrowId);

  event RewardsClaimed(IERC20 indexed token, address indexed account, uint256 amount);

  /**
   * @notice Returns whether the escrow is claimable
   * @param escrowId Bytes32 escrow ID
   */
  function isClaimable(bytes32 escrowId) external view returns (bool) {
    return escrows[escrowId].lastUpdateTime != 0 && escrows[escrowId].balance > 0;
  }

  /**
   * @notice Returns claimable amount for a given escrow
   * @param escrowId Bytes32 escrow ID
   */
  function getClaimableAmount(bytes32 escrowId) external view returns (uint256) {
    return _getClaimableAmount(escrows[escrowId]);
  }

  /**
   * @notice Claim rewards for multiple escrows
   * @param escrowIds array of escrow ids
   * @dev Uses the vaultIds at the specified indices of userEscrows.
   * @dev This function is used when a user wants to claim multiple escrowVaults at once (probably most of the time)
   * @dev prevention for gas overflow should be handled in the frontend
   */
  function claimRewards(bytes32[] memory escrowIds) external {
    for (uint256 i = 0; i < escrowIds.length; i++) {
      bytes32 escrowId = escrowIds[i];
      Escrow memory escrow = escrows[escrowId];

      uint256 claimable = _getClaimableAmount(escrow);
      if (claimable == 0) revert NotClaimable(escrowId);

      escrows[escrowId].balance -= claimable;
      escrows[escrowId].lastUpdateTime = block.timestamp;

      escrow.token.safeTransfer(escrow.account, claimable);
      emit RewardsClaimed(escrow.token, escrow.account, claimable);
    }
  }

  function _getClaimableAmount(Escrow memory escrow) internal view returns (uint256) {
    if (escrow.lastUpdateTime == 0 || escrow.end == 0 || escrow.balance == 0) {
      return 0;
    }
    return
      Math.min(
        (escrow.balance * (block.timestamp - escrow.lastUpdateTime)) / (escrow.end - escrow.lastUpdateTime),
        escrow.balance
      );
  }

  /*//////////////////////////////////////////////////////////////
                            FEE LOGIC
    //////////////////////////////////////////////////////////////*/

  // escrowToken => feeAmount
  mapping(IERC20 => uint256) public fees;

  // escrowToken => feePerc
  mapping(IERC20 => uint256) public feePercs;

  uint256 public keeperPerc;

  error ArraysNotMatching(uint256 length1, uint256 length2);
  error DontGetGreedy(uint256 fee);
  error NoFee(IERC20 token);

  event FeeSet(IERC20 indexed token, uint256 amount);
  event KeeperPercUpdated(uint256 oldPerc, uint256 newPerc);
  event FeeClaimed(IERC20 indexed token, uint256 amount);

  /**
   * @notice Set fees for multiple tokens
   * @param tokens that we want to take fees on
   * @param fees in 1e18. (1e18 = 100%, 1e14 = 1 BPS)
   */
  function setFees(IERC20[] memory tokens, uint256[] memory fees) external onlyOwner {
    if (tokens.length != fees.length) revert ArraysNotMatching(tokens.length, fees.length);

    for (uint256 i = 0; i < tokens.length; i++) {
      if (fees[i] >= 1e17) revert DontGetGreedy(fees[i]);

      feePercs[tokens[i]] = fees[i];
      emit FeeSet(tokens[i], fees[i]);
    }
  }

  /**
   * @notice Change keeperPerc
   */
  function setKeeperPerc(uint256 perc) external onlyOwner {
    if (perc >= 1e18) revert DontGetGreedy(perc);

    emit KeeperPercUpdated(keeperPerc, perc);

    keeperPerc = perc;
  }

  /**
   * @notice Claim fees
   * @param tokens that have accrued fees
   */
  function claimFees(IERC20[] memory tokens) external keeperIncentive(0) {
    address feeRecipient = _getContract(FEE_RECIPIENT);
    IKeeperIncentiveV2 keeperIncentive = IKeeperIncentiveV2(_getContract(KEEPER_INCENTIVE));
    uint256 incentiveVig = keeperPerc;

    for (uint256 i = 0; i < tokens.length; i++) {
      uint256 fee = fees[tokens[i]];

      if (fee == 0) revert NoFee(tokens[i]);

      uint256 tipAmount = (fee * incentiveVig) / 1e18;

      fee -= tipAmount;

      fees[tokens[i]] = 0;

      tokens[i].approve(address(keeperIncentive), tipAmount);

      keeperIncentive.tip(address(tokens[i]), msg.sender, 0, tipAmount);

      tokens[i].safeTransfer(feeRecipient, fee);

      emit FeeClaimed(tokens[i], fee);
    }
  }

  /*//////////////////////////////////////////////////////////////
                    CONTRACT REGISTRY ACCESS LOGIC
    //////////////////////////////////////////////////////////////*/

  bytes32 constant FEE_RECIPIENT = keccak256("FeeRecipient");

  /**
   * @notice Override for ACLAuth and ContractRegistryAccess.
   */
  function _getContract(
    bytes32 _name
  ) internal view override(ContractRegistryAccess, KeeperIncentivized) returns (address) {
    return super._getContract(_name);
  }
}