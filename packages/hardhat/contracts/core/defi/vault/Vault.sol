// SPDX-License-Identifier: GPL-3.0
// Docgen-SOLC: 0.8.0
pragma solidity ^0.8.0;

import "openzeppelin-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "openzeppelin-upgradeable/security/PausableUpgradeable.sol";
import "openzeppelin-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../utils/ACLAuth.sol";
import "../../utils/ContractRegistryAccessUpgradeable.sol";
import "../../utils/KeeperIncentivized.sol";
import "../../interfaces/IERC4626.sol";
import "../../interfaces/IContractRegistry.sol";
import "../../interfaces/IVaultFeeController.sol";
import "../../interfaces/IKeeperIncentiveV2.sol";
import "../../interfaces/IVaultsV1.sol";

contract Vault is
  IERC4626,
  ERC20Upgradeable,
  ReentrancyGuardUpgradeable,
  PausableUpgradeable,
  ACLAuth,
  KeeperIncentivized,
  ContractRegistryAccessUpgradeable
{
  // Fees are set in 1e18 for 100% (1 BPS = 1e14)
  // Raise Fees in BPS by 1e14 to get an accurate value
  struct FeeStructure {
    uint256 deposit;
    uint256 withdrawal;
    uint256 management;
    uint256 performance;
  }

  bytes32 public contractName;

  uint256 constant MINUTES_PER_YEAR = 525_600;
  bytes32 constant FEE_CONTROLLER_ID = keccak256("VaultFeeController");
  bytes32 constant VAULTS_CONTROLLER = keccak256("VaultsController");

  /* ========== STATE VARIABLES ========== */
  ERC20 internal asset;
  IERC4626 public strategy;
  FeeStructure public feeStructure;
  bool public useLocalFees;
  uint256 public vaultShareHWM = 1e18;
  uint256 public assetsCheckpoint;
  uint256 public feesUpdatedAt;
  KeeperConfig public keeperConfig;

  /* ========== EVENTS ========== */

  event WithdrawalFee(address indexed to, uint256 amount);
  event PerformanceFee(uint256 amount);
  event ManagementFee(uint256 amount);
  event FeesUpdated(FeeStructure previousFees, FeeStructure newFees);
  event UseLocalFees(bool useLocalFees);
  event UnstakedAndWithdrawn(uint256 amount, address owner, address receiver);

  /* ========== INITIALIZE ========== */

  function initialize(
    ERC20 asset_,
    IERC4626 strategy_,
    IContractRegistry contractRegistry_,
    FeeStructure memory feeStructure_,
    KeeperConfig memory keeperConfig_
  ) external initializer {
    __ERC20_init(
      string(abi.encodePacked("Popcorn ", asset_.name(), " Vault")),
      string(abi.encodePacked("pop-", asset_.symbol()))
    );
    __ContractRegistryAccess_init(contractRegistry_);

    asset = asset_;
    strategy = strategy_;

    feesUpdatedAt = block.timestamp;
    feeStructure = feeStructure_;
    contractName = keccak256(abi.encodePacked("Popcorn ", asset_.name(), " Vault"));
    keeperConfig = keeperConfig_;
  }

  /* ========== VIEWS ========== */
  /**
   * @return Address of the underlying `asset` token managed by vault.
   */
  function asset() external view override returns (address) {
    return address(asset);
  }

  /**
   * @return Total amount of underlying `asset` token managed by vault.
   */
  function totalAssets() public view override(IERC4626) returns (uint256) {
    return strategy.totalAssets();
  }

  /**
   * @notice Amount of assets the vault would exchange for given amount of shares, in an ideal scenario.
   * @param shares Exact amount of shares
   * @return Exact amount of assets
   */
  function convertToAssets(uint256 shares) external view override returns (uint256) {
    return _convertToAssets(shares, 0);
  }

  /**
   * @notice Amount of shares the vault would exchange for given amount of assets, in an ideal scenario.
   * @param assets Exact amount of assets
   * @return Exact amount of shares
   */
  function convertToShares(uint256 assets) external view override returns (uint256) {
    return _convertToShares(assets, 0);
  }

  /* ========== VIEWS ( PREVIEWS ) ========== */

  /**
   * @notice Simulate the effects of a deposit at the current block, given current on-chain conditions.
   * @param assets Exact amount of underlying `asset` token to deposit
   * @return shares of the vault issued in exchange to the user for `assets`
   * @dev This method accounts for issuance of accrued fee shares.
   */
  function previewDeposit(uint256 assets) public view override returns (uint256 shares) {
    shares = _convertToShares(
      assets - ((assets * getDepositFee()) / 1e18),
      accruedManagementFee() + accruedPerformanceFee()
    );
  }

  /**
   * @notice Simulate the effects of a mint at the current block, given current on-chain conditions.
   * @param shares Exact amount of vault shares to mint.
   * @return assets quantity of underlying needed in exchange to mint `shares`.
   * @dev This method accounts for issuance of accrued fee shares.
   */
  function previewMint(uint256 shares) public view override returns (uint256 assets) {
    uint256 depositFee = getDepositFee();

    shares += (shares * depositFee) / (1e18 - depositFee);

    assets = _convertToAssets(shares, accruedManagementFee() + accruedPerformanceFee());
  }

  /**
   * @notice Simulate the effects of a withdrawal at the current block, given current on-chain conditions.
   * @param assets Exact amount of `assets` to withdraw
   * @return shares to be burned in exchange for `assets`
   * @dev This method accounts for both issuance of fee shares and withdrawal fee.
   */
  function previewWithdraw(uint256 assets) external view override returns (uint256 shares) {
    uint256 withdrawalFee = getWithdrawalFee();

    assets += (assets * withdrawalFee) / (1e18 - withdrawalFee);

    shares = _convertToShares(assets, accruedManagementFee() + accruedPerformanceFee());
  }

  /**
   * @notice Simulate the effects of a redemption at the current block, given current on-chain conditions.
   * @param shares Exact amount of `shares` to redeem
   * @return assets quantity of underlying returned in exchange for `shares`.
   * @dev This method accounts for both issuance of fee shares and withdrawal fee.
   */
  function previewRedeem(uint256 shares) public view override returns (uint256 assets) {
    assets = _convertToAssets(shares, accruedManagementFee() + accruedPerformanceFee());

    assets -= (assets * getWithdrawalFee()) / 1e18;
  }

  /* ========== VIEWS ( FEES ) ========== */

  /**
   * @notice Management fee that has accrued since last fee harvest.
   * @return Accrued management fee in underlying `asset` token.
   * @dev Management fee is annualized per minute, based on 525,600 minutes per year. Total assets are calculated using
   *  the average of their current value and the value at the previous fee harvest checkpoint. This method is similar to
   *  calculating a definite integral using the trapezoid rule.
   */
  function accruedManagementFee() public view returns (uint256) {
    uint256 managementFee = useLocalFees ? feeStructure.management : _feeController().getManagementFee();

    uint256 area = (totalAssets() + assetsCheckpoint) * ((block.timestamp - feesUpdatedAt) / 1 minutes);
    return (((managementFee * area) / 2) / MINUTES_PER_YEAR) / 1e18;
  }

  /**
   * @notice Performance fee that has accrued since last fee harvest.
   * @return Accrued performance fee in underlying `asset` token.
   * @dev Performance fee is based on a vault share high water mark value. If vault share value has increased above the
   *   HWM in a fee period, issue fee shares to the vault equal to the performance fee.
   */
  function accruedPerformanceFee() public view returns (uint256) {
    uint256 shareValue = _convertToAssets(1 ether, 0);

    if (shareValue > vaultShareHWM) {
      uint256 performanceFee = useLocalFees ? feeStructure.performance : _feeController().getPerformanceFee();

      return (performanceFee * (shareValue - vaultShareHWM) * totalSupply()) / 1e36;
    } else {
      return 0;
    }
  }

  function getDepositFee() internal view returns (uint256) {
    return useLocalFees ? feeStructure.deposit : _feeController().getDepositFee();
  }

  function getWithdrawalFee() internal view returns (uint256) {
    return useLocalFees ? feeStructure.withdrawal : _feeController().getWithdrawalFee();
  }

  /* ========== VIEWS ( MAX ) ========== */

  /**
   * @return Maximum amount of underlying `asset` token that may be deposited for a given address.
   */
  function maxDeposit(address) public view override returns (uint256) {}

  /**
   * @return Maximum amount of vault shares that may be minted to given address.
   */
  function maxMint(address) external view override returns (uint256) {
    return previewDeposit(maxDeposit(address(0)));
  }

  /**
   * @return Maximum amount of underlying `asset` token that can be withdrawn by `caller` address.
   */
  function maxWithdraw(address caller) external view override returns (uint256) {
    return previewRedeem(balanceOf(caller));
  }

  /**
   * @return Maximum amount of shares that may be redeemed by `caller` address.
   */
  function maxRedeem(address caller) external view override returns (uint256) {
    return balanceOf(caller);
  }

  /* ========== MUTATIVE FUNCTIONS ========== */

  /**
   * @notice Deposit exactly `assets` amount of tokens, issuing vault shares to caller.
   * @param assets Quantity of tokens to deposit.
   * @return Quantity of vault shares issued to caller.
   * @dev This overrides `deposit(uint256)` from the parent `AffiliateToken` contract. It therefore needs to be public since the `AffiliateToken` function is public
   */
  function deposit(uint256 assets) public returns (uint256) {
    return deposit(assets, msg.sender);
  }

  /**
   * @notice Deposit exactly `assets` amount of tokens, issuing vault shares to `receiver`.
   * @param assets Quantity of tokens to deposit.
   * @param receiver Receiver of issued vault shares.
   * @return shares of the vault issued to `receiver`.
   */
  function deposit(uint256 assets, address receiver)
    public
    override
    nonReentrant
    whenNotPaused
    takeFees
    returns (uint256 shares)
  {
    require(receiver != address(0), "Invalid receiver");

    uint256 feeShares = _convertToShares((assets * getDepositFee()) / 1e18, 0);

    shares = _convertToShares(assets, 0) - feeShares;

    strategy.deposit(assets, address(this));

    _mint(receiver, shares);

    _mint(address(this), feeShares);

    emit Deposit(msg.sender, receiver, assets, shares);
  }

  /**
   * @notice Mint exactly `shares` vault shares to `msg.sender`. Caller must approve a sufficient number of underlying
   *   `asset` tokens to mint the requested quantity of vault shares.
   * @param shares Quantity of shares to mint.
   * @return assets of underlying that have been deposited.
   */
  function mint(uint256 shares) external returns (uint256) {
    return mint(shares, msg.sender);
  }

  /**
   * @notice Mint exactly `shares` vault shares to `receiver`. Caller must approve a sufficient number of underlying
   *   `asset` tokens to mint the requested quantity of vault shares.
   * @param shares Quantity of shares to mint.
   * @param receiver Receiver of issued vault shares.
   * @return assets of underlying that have been deposited.
   */
  function mint(uint256 shares, address receiver)
    public
    override
    nonReentrant
    whenNotPaused
    takeFees
    returns (uint256 assets)
  {
    require(receiver != address(0), "Invalid receiver");

    uint256 depositFee = getDepositFee();

    uint256 feeShares = (shares * depositFee) / (1e18 - depositFee);

    assets = _convertToAssets(shares + feeShares, 0);

    strategy.deposit(assets, address(this));

    _mint(receiver, shares);

    _mint(address(this), feeShares);

    emit Deposit(msg.sender, receiver, assets, shares);
  }

  /**
   * @notice Burn shares from caller in exchange for exactly `assets` amount of underlying token.
   * @param assets Quantity of underlying `asset` token to withdraw.
   * @return shares of vault burned in exchange for underlying `asset` tokens.
   * @dev This overrides `withdraw(uint256)` from the parent `AffiliateToken` contract.
   */
  function withdraw(uint256 assets) public returns (uint256) {
    return withdraw(assets, msg.sender, msg.sender);
  }

  /**
   * @notice Burn shares from caller in exchange for `assets` amount of underlying token. Send underlying to caller.
   * @param assets Quantity of underlying `asset` token to withdraw.
   * @param receiver Receiver of underlying token.
   * @param owner Owner of burned vault shares.
   * @return shares of vault burned in exchange for underlying `asset` tokens.
   */
  function withdraw(
    uint256 assets,
    address receiver,
    address owner
  ) public override nonReentrant takeFees returns (uint256 shares) {
    require(receiver != address(0), "Invalid receiver");

    shares = _convertToShares(assets, 0);

    uint256 withdrawalFee = getWithdrawalFee();

    uint256 feeShares = (shares * withdrawalFee) / (1e18 - withdrawalFee);

    if (msg.sender != owner) _approve(owner, msg.sender, allowance(owner, msg.sender) - (shares + feeShares));

    _transfer(owner, address(this), (shares + feeShares));

    _burn(address(this), shares);

    strategy.withdraw(assets, receiver, owner);

    emit Withdraw(msg.sender, receiver, owner, assets, shares);
  }

  /**
   * @notice Burn exactly `shares` vault shares from owner and send underlying `asset` tokens to `receiver`.
   * @param shares Quantity of vault shares to exchange for underlying tokens.
   * @return assets of underlying sent to `receiver`.
   */
  function redeem(uint256 shares) external returns (uint256) {
    return redeem(shares, msg.sender, msg.sender);
  }

  /**
   * @notice Burn exactly `shares` vault shares from owner and send underlying `asset` tokens to `receiver`.
   * @param shares Quantity of vault shares to exchange for underlying tokens.
   * @param receiver Receiver of underlying tokens.
   * @param owner Owner of burned vault shares.
   * @return assets of underlying sent to `receiver`.
   */
  function redeem(
    uint256 shares,
    address receiver,
    address owner
  ) public override nonReentrant takeFees returns (uint256 assets) {
    require(receiver != address(0), "Invalid receiver");

    if (msg.sender != owner) _approve(owner, msg.sender, allowance(owner, msg.sender) - shares);

    _transfer(owner, address(this), shares);

    uint256 feeShares = (shares * getWithdrawalFee()) / 1e18;

    assets = _convertToAssets(shares - feeShares, 0);

    _burn(address(this), shares - feeShares);

    strategy.withdraw(assets, receiver, owner);

    emit Withdraw(msg.sender, receiver, owner, assets, shares);
  }

  /**
   * @notice Collect management and performance fees and update vault share high water mark.
   */
  function takeManagementAndPerformanceFees() external nonReentrant takeFees {}

  /* ========== RESTRICTED FUNCTIONS ========== */

  /**
   * @notice Set fees in BPS. Caller must have DAO_ROLE or VAULTS_CONTROlLER from ACLRegistry.
   * @param newFees New `feeStructure`.
   * @dev Value is in 1e18, e.g. 100% = 1e18 - 1 BPS = 1e12
   */
  function setFees(FeeStructure memory newFees) external onlyRole(VAULTS_CONTROLLER) {
    // prettier-ignore
    require(
      newFees.deposit < 1e18 &&
      newFees.withdrawal < 1e18 &&
      newFees.management < 1e18 &&
      newFees.performance < 1e18,
      "Invalid FeeStructure"
    );
    emit FeesUpdated(feeStructure, newFees);
    feeStructure = newFees;
  }

  /**
   * @notice Set whether to use locally configured fees. Caller must have VAULTS_CONTROLLER from ACLRegistry.
   * @param _useLocalFees `true` to use local fees, `false` to use the VaultFeeController contract.
   */
  function setUseLocalFees(bool _useLocalFees) external onlyRole(VAULTS_CONTROLLER) {
    emit UseLocalFees(_useLocalFees);
    useLocalFees = _useLocalFees;
  }

  /**
   * @notice Change keeper config. Caller must have VAULTS_CONTROLLER from ACLRegistry.
   */
  function setKeeperConfig(KeeperConfig memory _config) external onlyRole(VAULTS_CONTROLLER) {
    require(_config.incentiveVigBps < 1e18, "invalid vig");
    require(_config.minWithdrawalAmount > 0, "invalid min withdrawal");
    emit KeeperConfigUpdated(keeperConfig, _config);

    keeperConfig = _config;
  }

  /**
   * @notice Pause deposits. Caller must have VAULTS_CONTROLLER from ACLRegistry.
   */
  function pauseContract() external onlyRole(VAULTS_CONTROLLER) {
    _pause();
  }

  /**
   * @notice Unpause deposits. Caller must have VAULTS_CONTROLLER from ACLRegistry.
   */
  function unpauseContract() external onlyRole(VAULTS_CONTROLLER) {
    _unpause();
  }

  /**
   * @notice Transfer accrued fees to rewards manager contract. Caller must be a registered keeper.
   * @dev we send funds now to the feeRecipient which is set on the feeController. We must make sure that this is not address(0) before withdrawing fees
   */
  function withdrawAccruedFees() external keeperIncentive(0) takeFees nonReentrant {
    uint256 balance = balanceOf(address(this));
    uint256 accruedFees = _convertToAssets(balance, 0);
    uint256 minWithdrawalAmount = keeperConfig.minWithdrawalAmount;
    uint256 incentiveVig = keeperConfig.incentiveVigBps;

    require(accruedFees >= minWithdrawalAmount, "insufficient withdrawal amount");

    IERC20 assetToken = IERC20(IERC4626(address(this)).asset());

    uint256 preBal = assetToken.balanceOf(address(this));
    uint256 tipAmount = (accruedFees * incentiveVig) / 1e18;

    //TODO check this calculation
    strategy.withdraw((accruedFees * 1e18 - incentiveVig) / 1e18, _feeController().feeRecipient(), address(this));
    strategy.withdraw(tipAmount, address(this), address(this));

    uint256 postBal = assetToken.balanceOf(address(this));

    require(postBal >= preBal, "insufficient tip balance");

    // from test postBal = 2
    // from test tipAmount = 238

    IKeeperIncentiveV2 keeperIncentive = IKeeperIncentiveV2(_getContract(keccak256("KeeperIncentive")));

    assetToken.approve(address(keeperIncentive), postBal);

    keeperIncentive.tip(address(assetToken), msg.sender, 0, postBal);

    _burn(address(this), balance);
  }

  /* ========== INTERNAL FUNCTIONS ========== */

  function _convertToShares(uint256 assets, uint256 fees) internal view returns (uint256) {
    uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply() is non-zero.
    uint256 currentAssets = totalAssets();
    if (fees >= currentAssets && currentAssets != 0) {
      fees = currentAssets - 1;
    }
    return supply == 0 ? assets : (assets * supply) / (currentAssets - fees);
  }

  function _convertToAssets(uint256 shares, uint256 fees) internal view returns (uint256) {
    uint256 currentAssets = totalAssets();
    if (currentAssets == 0) {
      fees = 0;
    }
    if (fees >= currentAssets && currentAssets != 0) {
      fees = currentAssets - 1;
    }
    uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply() is non-zero.
    return supply == 0 ? shares : (shares * (currentAssets - fees)) / supply;
  }

  /**
   * @notice Return current fee controller.
   * @return Current fee controller registered in contract registry.
   */
  function _feeController() internal view returns (IVaultFeeController) {
    return IVaultFeeController(_getContract(FEE_CONTROLLER_ID));
  }

  /**
   * @notice Override for ACLAuth and ContractRegistryAccess.
   */
  function _getContract(bytes32 _name)
    internal
    view
    override(ACLAuth, KeeperIncentivized, ContractRegistryAccessUpgradeable)
    returns (address)
  {
    return super._getContract(_name);
  }

  /* ========== MODIFIERS ========== */

  modifier takeFees() {
    uint256 managementFee = accruedManagementFee();
    uint256 totalFee = managementFee + accruedPerformanceFee();
    uint256 currentAssets = totalAssets();
    uint256 shareValue = _convertToAssets(1 ether, 0);

    if (shareValue > vaultShareHWM) vaultShareHWM = shareValue;

    if (totalFee > 0 && currentAssets > 0) {
      uint256 supply = totalSupply();
      if (totalFee >= currentAssets) {
        totalFee = currentAssets - 1;
      }
      _mint(address(this), supply == 0 ? totalFee : (totalFee * supply) / (currentAssets - totalFee));
    }

    if (managementFee > 0 || currentAssets == 0) {
      feesUpdatedAt = block.timestamp;
    }
    _;
    assetsCheckpoint = totalAssets();
  }
}
