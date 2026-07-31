// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title ArcReleaseDeliveryAttestation
/// @notice Immutable zero-value attestation that binds a delivery-verifier release to the release it verifies.
/// @dev It records no payment, platform credential, ERP instruction or mutable follow-up state.
contract ArcReleaseDeliveryAttestation {
    error ZeroFingerprint();
    error NativeValueRejected();

    bytes32 public immutable attestationFingerprint;
    bytes32 public immutable attestedReleaseFingerprint;
    bytes32 public immutable receiptSetHash;
    address public immutable publisher;

    event ReleaseDeliveryAttested(
        bytes32 indexed attestationFingerprint,
        bytes32 indexed attestedReleaseFingerprint,
        bytes32 indexed receiptSetHash,
        address publisher
    );

    constructor(bytes32 attestationFingerprint_, bytes32 attestedReleaseFingerprint_, bytes32 receiptSetHash_) {
        if (attestationFingerprint_ == bytes32(0) || attestedReleaseFingerprint_ == bytes32(0) || receiptSetHash_ == bytes32(0)) {
            revert ZeroFingerprint();
        }
        attestationFingerprint = attestationFingerprint_;
        attestedReleaseFingerprint = attestedReleaseFingerprint_;
        receiptSetHash = receiptSetHash_;
        publisher = msg.sender;
        emit ReleaseDeliveryAttested(attestationFingerprint_, attestedReleaseFingerprint_, receiptSetHash_, msg.sender);
    }

    receive() external payable {
        revert NativeValueRejected();
    }

    fallback() external payable {
        revert NativeValueRejected();
    }
}
