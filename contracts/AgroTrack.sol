// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AgroTrack {
    enum ProductStatus {
        Created,
        HarvestedAndPacked,
        ShippedToWarehouse,
        ReceivedAtWarehouse,
        ShippedToSupermarket,
        Completed
    }

    struct BatchItem {
        string fruitName;
        uint256 quantityKg;
    }

    struct ProductBatch {
        uint256 batchId;
        string trackingNumber;
        address plantation;
        address warehouse;
        address supermarket;
        ProductStatus status;
        string offChainDocHash;
        uint256 createdAt;
        uint256 updatedAt;
    }

    struct TrackingLog {
        ProductStatus status;
        string location;
        string notes;
        address actor;
        uint256 timestamp;
    }

    uint256 private batchCounter;
    mapping(string => uint256) private trackingToId;
    mapping(uint256 => ProductBatch) public batches;
    mapping(uint256 => BatchItem[]) private batchItems;
    mapping(uint256 => TrackingLog[]) private batchLogs;

    event BatchCreated(uint256 indexed batchId, string trackingNumber, address indexed plantation);
    event StatusUpdated(uint256 indexed batchId, string trackingNumber, ProductStatus status, address indexed actor);

    function createBatch(
        string memory _trackingNumber,
        address _warehouse,
        address _supermarket,
        string[] memory _fruitNames,
        uint256[] memory _quantitiesKg,
        string memory _docHash,
        string memory _notes
    ) external {
        require(trackingToId[_trackingNumber] == 0, "Tracking number already exists");
        require(_fruitNames.length == _quantitiesKg.length && _fruitNames.length > 0, "Invalid items");

        batchCounter++;
        uint256 newId = batchCounter;
        trackingToId[_trackingNumber] = newId;

        batches[newId] = ProductBatch({
            batchId: newId,
            trackingNumber: _trackingNumber,
            plantation: msg.sender,
            warehouse: _warehouse,
            supermarket: _supermarket,
            status: ProductStatus.Created,
            offChainDocHash: _docHash,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });

        for (uint256 i = 0; i < _fruitNames.length; i++) {
            batchItems[newId].push(BatchItem({
                fruitName: _fruitNames[i],
                quantityKg: _quantitiesKg[i]
            }));
        }

        batchLogs[newId].push(TrackingLog({
            status: ProductStatus.Created,
            location: "Perkebunan A",
            notes: _notes,
            actor: msg.sender,
            timestamp: block.timestamp
        }));

        emit BatchCreated(newId, _trackingNumber, msg.sender);
    }

    function updateBatchStatus(
        string memory _trackingNumber,
        ProductStatus _newStatus,
        string memory _location,
        string memory _notes,
        string memory _newDocHash
    ) external {
        uint256 id = trackingToId[_trackingNumber];
        require(id != 0, "Batch not found");

        ProductBatch storage batch = batches[id];
        batch.status = _newStatus;
        batch.updatedAt = block.timestamp;
        if (bytes(_newDocHash).length > 0) {
            batch.offChainDocHash = _newDocHash;
        }

        batchLogs[id].push(TrackingLog({
            status: _newStatus,
            location: _location,
            notes: _notes,
            actor: msg.sender,
            timestamp: block.timestamp
        }));

        emit StatusUpdated(id, _trackingNumber, _newStatus, msg.sender);
    }

    function getBatchItems(string memory _trackingNumber) external view returns (BatchItem[] memory) {
        uint256 id = trackingToId[_trackingNumber];
        require(id != 0, "Batch not found");
        return batchItems[id];
    }

    function getTrackingLogs(string memory _trackingNumber) external view returns (TrackingLog[] memory) {
        uint256 id = trackingToId[_trackingNumber];
        require(id != 0, "Batch not found");
        return batchLogs[id];
    }
}