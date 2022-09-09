// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { Test } from "forge-std/Test.sol";
import "../../../contracts/core/defi/zapper/ZeroXSwapZapOut.sol";

address constant AFFILIATE = address(0);

address constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
address constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
address constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

address constant ZEROX_ROUTER = 0xDef1C0ded9bec7F1a1670819833240f027b25EfF;
address constant NOT_ZEROX_ROUTER = 0xdef1c0dEd9bec7f1a1670819833240F027B24eFF;

// Fork Block 15440734
contract ZeroXSwapZapOutTest is Test {
  ZeroXSwapZapOut internal zapOut;

  function setUp() public {
    zapOut = new ZeroXSwapZapOut();
    deal(address(this), 1 ether);
    deal(DAI, address(this), 100 ether);
  }

  function test_zap_out_dai_to_usdt() public {
    uint256 daiBalanceBefore = IERC20(DAI).balanceOf(address(this));
    uint256 usdtBalanceBefore = IERC20(USDT).balanceOf(address(this));
    IERC20(DAI).approve(address(zapOut), 100 ether);
    // https://api.0x.org/swap/v1/quote?buyToken=USDT&sellToken=0x6B175474E89094C44Da98b954EedeAC495271d0F&sellAmount=100000000000000000000&slippagePercentage=0.03
    zapOut.ZapOut(
      address(0),
      100 ether,
      DAI,
      USDT,
      99_000_000,
      ZEROX_ROUTER,
      hex"d9627aa400000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000056bc75e2d631000000000000000000000000000000000000000000000000000000000000005c3027b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020000000000000000000000006b175474e89094c44da98b954eedeac495271d0f000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec7869584cd00000000000000000000000010000000000000000000000000000000000000110000000000000000000000000000000000000000000000d6be23fc7d630e16d1",
      AFFILIATE,
      true
    );
    uint256 daiBalanceAfter = IERC20(DAI).balanceOf(address(this));
    uint256 usdtBalanceAfter = IERC20(USDT).balanceOf(address(this));
    assertEq(daiBalanceBefore, 100 ether);
    assertEq(daiBalanceAfter, 0);
    assertEq(usdtBalanceBefore, 0);
    assertEq(usdtBalanceAfter, 99_655_913);
  }

  function test_zap_out_eth_to_usdt() public {
    uint256 ethBalanceBefore = address(this).balance;
    uint256 usdtBalanceBefore = IERC20(USDT).balanceOf(address(this));
    // https://api.0x.org/swap/v1/quote?buyToken=USDT&sellToken=ETH&sellAmount=1000000000000000000&slippagePercentage=0.03
    zapOut.ZapOut{ value: 1 ether }(
      address(0),
      1 ether,
      address(0),
      USDT,
      1567_000_000,
      ZEROX_ROUTER,
      hex"3598d8ab0000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000005aa092d40000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002bc02aaa39b223fe8d0a0e5c4f27ead9083c756cc20001f4dac17f958d2ee523a2206206994597c13d831ec7000000000000000000000000000000000000000000869584cd00000000000000000000000010000000000000000000000000000000000000110000000000000000000000000000000000000000000000beb94efc24630e16c9",
      AFFILIATE,
      true
    );
    uint256 ethBalanceAfter = address(this).balance;
    uint256 usdtBalanceAfter = IERC20(USDT).balanceOf(address(this));
    assertEq(ethBalanceBefore, 1 ether);
    assertEq(ethBalanceAfter, 0);
    assertEq(usdtBalanceBefore, 0);
    assertEq(usdtBalanceAfter, 1567_497_720);
  }

  function test_zap_out_eth_to_weth() public {
    uint256 ethBalanceBefore = address(this).balance;
    uint256 wethBalanceBefore = IERC20(WETH).balanceOf(address(this));
    // https://api.0x.org/swap/v1/quote?buyToken=WETH&sellToken=ETH&sellAmount=1000000000000000000&slippagePercentage=0.03
    zapOut.ZapOut{ value: 1 ether }(address(0), 1 ether, address(0), WETH, 1 ether, WETH, hex"", AFFILIATE, true);
    uint256 ethBalanceAfter = address(this).balance;
    uint256 wethBalanceAfter = IERC20(WETH).balanceOf(address(this));
    assertEq(ethBalanceBefore, 1 ether);
    assertEq(ethBalanceAfter, 0);
    assertEq(wethBalanceBefore, 0);
    assertEq(wethBalanceAfter, 1 ether);
  }

  function test_zap_out_dai_to_usdt_reverts_low_slippage() public {
    IERC20(DAI).approve(address(zapOut), 100 ether);
    // https://api.0x.org/swap/v1/quote?buyToken=USDT&sellToken=0x6B175474E89094C44Da98b954EedeAC495271d0F&sellAmount=100000000000000000000&slippagePercentage=0.03
    vm.expectRevert("High Slippage");
    zapOut.ZapOut(
      address(0),
      100 ether,
      DAI,
      USDT,
      100_000_000,
      ZEROX_ROUTER,
      hex"d9627aa400000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000056bc75e2d631000000000000000000000000000000000000000000000000000000000000005c3027b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020000000000000000000000006b175474e89094c44da98b954eedeac495271d0f000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec7869584cd00000000000000000000000010000000000000000000000000000000000000110000000000000000000000000000000000000000000000d6be23fc7d630e16d1",
      AFFILIATE,
      true
    );
  }

  function test_zap_out_dai_to_usdt_reverts_insufficient_allowance() public {
    IERC20(DAI).approve(address(zapOut), 90 ether);
    // https://api.0x.org/swap/v1/quote?buyToken=USDT&sellToken=0x6B175474E89094C44Da98b954EedeAC495271d0F&sellAmount=100000000000000000000&slippagePercentage=0.03
    vm.expectRevert("Dai/insufficient-allowance");
    zapOut.ZapOut(
      address(0),
      100 ether,
      DAI,
      USDT,
      99_000_000,
      ZEROX_ROUTER,
      hex"d9627aa400000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000056bc75e2d631000000000000000000000000000000000000000000000000000000000000005c3027b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020000000000000000000000006b175474e89094c44da98b954eedeac495271d0f000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec7869584cd00000000000000000000000010000000000000000000000000000000000000110000000000000000000000000000000000000000000000d6be23fc7d630e16d1",
      AFFILIATE,
      true
    );
  }

  function test_zap_out_dai_to_usdt_reverts_insufficient_balance() public {
    IERC20(DAI).approve(address(zapOut), 150 ether);
    // https://api.0x.org/swap/v1/quote?buyToken=USDT&sellToken=0x6B175474E89094C44Da98b954EedeAC495271d0F&sellAmount=100000000000000000000&slippagePercentage=0.03
    vm.expectRevert("Dai/insufficient-balance");
    zapOut.ZapOut(
      address(0),
      150 ether,
      DAI,
      USDT,
      149_000_000,
      ZEROX_ROUTER,
      hex"d9627aa400000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000056bc75e2d631000000000000000000000000000000000000000000000000000000000000005c3027b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020000000000000000000000006b175474e89094c44da98b954eedeac495271d0f000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec7869584cd00000000000000000000000010000000000000000000000000000000000000110000000000000000000000000000000000000000000000d6be23fc7d630e16d1",
      AFFILIATE,
      true
    );
  }

  function test_zap_out_dai_to_usdt_reverts_with_eth_sent() public {
    IERC20(DAI).approve(address(zapOut), 100 ether);
    // https://api.0x.org/swap/v1/quote?buyToken=USDT&sellToken=0x6B175474E89094C44Da98b954EedeAC495271d0F&sellAmount=100000000000000000000&slippagePercentage=0.03
    vm.expectRevert("Eth sent with token");
    zapOut.ZapOut{ value: 1 ether }(
      address(0),
      100 ether,
      DAI,
      USDT,
      99_000_000,
      ZEROX_ROUTER,
      hex"d9627aa400000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000056bc75e2d631000000000000000000000000000000000000000000000000000000000000005c3027b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020000000000000000000000006b175474e89094c44da98b954eedeac495271d0f000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec7869584cd00000000000000000000000010000000000000000000000000000000000000110000000000000000000000000000000000000000000000d6be23fc7d630e16d1",
      AFFILIATE,
      true
    );
  }

  function test_zap_out_dai_to_usdt_reverts_wrong_swap_target() public {
    IERC20(DAI).approve(address(zapOut), 100 ether);
    // https://api.0x.org/swap/v1/quote?buyToken=USDT&sellToken=0x6B175474E89094C44Da98b954EedeAC495271d0F&sellAmount=100000000000000000000&slippagePercentage=0.03
    vm.expectRevert("Target not Authorized");
    zapOut.ZapOut(
      address(0),
      100 ether,
      DAI,
      USDT,
      99_000_000,
      NOT_ZEROX_ROUTER,
      hex"d9627aa400000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000056bc75e2d631000000000000000000000000000000000000000000000000000000000000005c3027b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020000000000000000000000006b175474e89094c44da98b954eedeac495271d0f000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec7869584cd00000000000000000000000010000000000000000000000000000000000000110000000000000000000000000000000000000000000000d6be23fc7d630e16d1",
      AFFILIATE,
      true
    );
  }

  function test_zap_out_dai_to_usdt_reverts_wrong_swap_data() public {
    IERC20(DAI).approve(address(zapOut), 100 ether);
    // https://api.0x.org/swap/v1/quote?buyToken=USDT&sellToken=0x6B175474E89094C44Da98b954EedeAC495271d0F&sellAmount=100000000000000000000&slippagePercentage=0.03
    vm.expectRevert("Error Swapping Tokens");
    zapOut.ZapOut(
      address(0),
      100 ether,
      DAI,
      USDT,
      99_000_000,
      ZEROX_ROUTER,
      hex"d9627aa400000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000056bc75e2d631000000000000000000000000000000000000000000000000000000000000005c3027b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020000000000000000000000006b175474e89094c44da98b954efdeac495271d0f000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec7869584cd00000000000000000000000010000000000000000000000000000000000000110000000000000000000000000000000000000000000000d6be23fc7d630e16d1",
      AFFILIATE,
      true
    );
  }
}
