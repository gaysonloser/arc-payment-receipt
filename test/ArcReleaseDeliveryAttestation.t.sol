// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ArcReleaseDeliveryAttestation} from "../src/ArcReleaseDeliveryAttestation.sol";

interface Vm {
    function expectRevert(bytes calldata revertData) external;
}

contract ArcReleaseDeliveryAttestationTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function testStoresAllImmutableAttestationFingerprints() public {
        bytes32 attestation = keccak256("delivery-attestation");
        bytes32 release = keccak256("attested-release");
        bytes32 receipts = keccak256("receipt-set");
        ArcReleaseDeliveryAttestation target = new ArcReleaseDeliveryAttestation(attestation, release, receipts);
        require(target.attestationFingerprint() == attestation, "attestation mismatch");
        require(target.attestedReleaseFingerprint() == release, "release mismatch");
        require(target.receiptSetHash() == receipts, "receipt set mismatch");
        require(target.publisher() == address(this), "publisher mismatch");
    }

    function testRejectsNativeValue() public {
        ArcReleaseDeliveryAttestation target = new ArcReleaseDeliveryAttestation(bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(3)));
        vm.expectRevert(abi.encodeWithSelector(ArcReleaseDeliveryAttestation.NativeValueRejected.selector));
        payable(address(target)).transfer(1);
    }
}
