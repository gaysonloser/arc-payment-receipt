// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title ArcReleaseEvidenceAnchor
/// @notice A one-time immutable Arc Testnet anchor for a public Arc Lab release packet.
/// @dev It deliberately accepts no payment, ERC-20 approval, ERP instruction, or follow-up call.
contract ArcReleaseEvidenceAnchor {
    error ZeroFingerprint();
    error NativeValueRejected();

    bytes32 public immutable releaseFingerprint;
    bytes32 public immutable releaseUnitId;
    address public immutable publisher;

    event ReleaseEvidenceAnchored(
        bytes32 indexed releaseFingerprint,
        bytes32 indexed releaseUnitId,
        address indexed publisher
    );

    constructor(bytes32 releaseFingerprint_, bytes32 releaseUnitId_) {
        if (releaseFingerprint_ == bytes32(0) || releaseUnitId_ == bytes32(0)) {
            revert ZeroFingerprint();
        }
        releaseFingerprint = releaseFingerprint_;
        releaseUnitId = releaseUnitId_;
        publisher = msg.sender;
        emit ReleaseEvidenceAnchored(releaseFingerprint_, releaseUnitId_, msg.sender);
    }

    receive() external payable {
        revert NativeValueRejected();
    }

    fallback() external payable {
        revert NativeValueRejected();
    }
}
