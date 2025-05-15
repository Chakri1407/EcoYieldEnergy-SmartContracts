// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract EYE is ERC20, Ownable {
    uint256 private constant TOTAL_SUPPLY = 1_000_000_000 * 10**18; // 1B $EYE
    bool public paused;

    constructor(address gnosisSafe) ERC20("EcoYield", "EYE") Ownable(gnosisSafe) {
        _mint(gnosisSafe, TOTAL_SUPPLY);
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused();
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused();
    }

    function _update(address from, address to, uint256 amount) internal override {
        require(!paused, "EYE: Token transfers paused");
        super._update(from, to, amount);
    }

    event Paused();
    event Unpaused();
}