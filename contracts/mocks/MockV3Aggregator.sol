// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockV3Aggregator {
    uint8 public decimals;
    int256 public latestPrice;
    uint256 public latestTimestamp;

    constructor(uint8 _decimals, int256 _initialPrice) {
        decimals = _decimals;
        latestPrice = _initialPrice;
        latestTimestamp = block.timestamp;
    }

    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (0, latestPrice, 0, latestTimestamp, 0);
    }

    function setPrice(int256 _price) external {
        latestPrice = _price;
        latestTimestamp = block.timestamp;
    }
}