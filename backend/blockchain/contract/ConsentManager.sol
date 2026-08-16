// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ConsentManager {

    enum ConsentStatus {
        ACTIVE,
        REVOKED,
        EXPIRED
    }

    struct Consent {
        uint256 consentId;
        uint256 ownerId;
        uint256 organizationId;
        uint256 recordId;
        string purpose;
        string accessType;
        uint256 startTime;
        uint256 expiryTime;
        ConsentStatus status;
    }

    uint256 private nextConsentId = 1;

    mapping(uint256 => Consent) private consents;

    event ConsentCreated(
        uint256 indexed consentId,
        uint256 indexed ownerId,
        uint256 indexed organizationId,
        uint256 recordId,
        string purpose,
        string accessType,
        uint256 startTime,
        uint256 expiryTime
    );

    event ConsentUpdated(
        uint256 indexed consentId,
        uint256 expiryTime,
        string accessType
    );

    event ConsentRevoked(
        uint256 indexed consentId,
        uint256 revokedAt
    );

    event AccessRecorded(
        uint256 indexed consentId,
        uint256 indexed organizationId,
        uint256 indexed recordId,
        bool granted,
        uint256 timestamp
    );

    function createConsent(
        uint256 ownerId,
        uint256 organizationId,
        uint256 recordId,
        string calldata purpose,
        string calldata accessType,
        uint256 startTime,
        uint256 expiryTime
    ) external returns (uint256) {

        require(ownerId > 0, "Invalid owner");
        require(organizationId > 0, "Invalid organization");
        require(recordId > 0, "Invalid record");
        require(bytes(purpose).length > 0, "Purpose required");
        require(bytes(accessType).length > 0, "Access type required");
        require(startTime < expiryTime, "Invalid validity period");
        require(expiryTime > block.timestamp, "Consent already expired");

        uint256 consentId = nextConsentId++;

        consents[consentId] = Consent({
            consentId: consentId,
            ownerId: ownerId,
            organizationId: organizationId,
            recordId: recordId,
            purpose: purpose,
            accessType: accessType,
            startTime: startTime,
            expiryTime: expiryTime,
            status: ConsentStatus.ACTIVE
        });

        emit ConsentCreated(
            consentId,
            ownerId,
            organizationId,
            recordId,
            purpose,
            accessType,
            startTime,
            expiryTime
        );

        return consentId;
    }

    function updateConsent(
        uint256 consentId,
        string calldata accessType,
        uint256 expiryTime
    ) external {

        Consent storage consent = consents[consentId];

        require(consent.consentId != 0, "Consent not found");
        require(consent.status == ConsentStatus.ACTIVE, "Consent not active");
        require(expiryTime > block.timestamp, "Invalid expiry");
        require(expiryTime > consent.startTime, "Invalid expiry");

        consent.accessType = accessType;
        consent.expiryTime = expiryTime;

        emit ConsentUpdated(
            consentId,
            expiryTime,
            accessType
        );
    }

    function revokeConsent(uint256 consentId) external {

        Consent storage consent = consents[consentId];

        require(consent.consentId != 0, "Consent not found");
        require(consent.status == ConsentStatus.ACTIVE, "Consent not active");

        consent.status = ConsentStatus.REVOKED;

        emit ConsentRevoked(
            consentId,
            block.timestamp
        );
    }

    function checkConsent(
        uint256 consentId,
        uint256 organizationId,
        uint256 recordId,
        string calldata purpose,
        string calldata requestedAccessType
    ) external returns (bool) {

        Consent storage consent = consents[consentId];

        if (consent.consentId == 0) {
            return false;
        }

        if (consent.status == ConsentStatus.REVOKED) {
            emit AccessRecorded(
                consentId,
                organizationId,
                recordId,
                false,
                block.timestamp
            );

            return false;
        }

        if (block.timestamp > consent.expiryTime) {
            consent.status = ConsentStatus.EXPIRED;

            emit AccessRecorded(
                consentId,
                organizationId,
                recordId,
                false,
                block.timestamp
            );

            return false;
        }

        bool valid =
            consent.organizationId == organizationId &&
            consent.recordId == recordId &&
            keccak256(bytes(consent.purpose)) ==
                keccak256(bytes(purpose)) &&
            keccak256(bytes(consent.accessType)) ==
                keccak256(bytes(requestedAccessType)) &&
            block.timestamp >= consent.startTime &&
            block.timestamp <= consent.expiryTime;

        emit AccessRecorded(
            consentId,
            organizationId,
            recordId,
            valid,
            block.timestamp
        );

        return valid;
    }

    function getConsent(
        uint256 consentId
    )
        external
        view
        returns (
            uint256 ownerId,
            uint256 organizationId,
            uint256 recordId,
            string memory purpose,
            string memory accessType,
            uint256 startTime,
            uint256 expiryTime,
            ConsentStatus status
        )
    {
        Consent memory consent = consents[consentId];

        require(consent.consentId != 0, "Consent not found");

        ConsentStatus currentStatus = consent.status;

        if (
            currentStatus == ConsentStatus.ACTIVE &&
            block.timestamp > consent.expiryTime
        ) {
            currentStatus = ConsentStatus.EXPIRED;
        }

        return (
            consent.ownerId,
            consent.organizationId,
            consent.recordId,
            consent.purpose,
            consent.accessType,
            consent.startTime,
            consent.expiryTime,
            currentStatus
        );
    }
}