# Cascading Slot Result Chains & Player Tracking Guide

## Overview

This comprehensive guide covers the complete result chains system for cascading slot games, including:

1. **Result Chains Feature** - Pre-defined game board sequences for controlled outcomes
2. **Player Chain Assignment Tracking** - Persistent tracking of player progress through chains
3. **AssignmentRepository Setup** - Database repository for chain assignment persistence
4. **Integration Guide** - Complete setup instructions for your service

## Table of Contents

- [Feature Overview](#feature-overview)
- [Prerequisites](#prerequisites)
- [Setup Guide](#setup-guide)
- [Database Setup](#database-setup)
- [AssignmentRepository Setup](#assignmentrepository-setup)
- [Integration Guide](#integration-guide)
- [API Usage](#api-usage)
- [Schema Reference](#schema-reference)
- [Usage Examples](#usage-examples)
- [Performance & Reliability](#performance--reliability)
- [Monitoring & Maintenance](#monitoring--maintenance)
- [Troubleshooting](#troubleshooting)
- [Migration Guide](#migration-guide)

## Feature Overview

### Result Chains System

The Result Chains feature enables:

- **Deterministic game outcomes** for testing and controlled RTP
- **Pre-defined board sequences** instead of random generation
- **Advanced analytics and AB testing** capabilities
- **Specific gameplay scenarios** for promotions or events

### Player Chain Assignment Tracking

The tracking system provides:

- **Comprehensive progress monitoring** through assigned chains
- **Persistent state management** across sessions and reconnections
- **Financial tracking** of bets, wins, and balances
- **Multi-bet configuration support** (different bet levels per player)
- **Real-time analytics** and reporting capabilities

## Prerequisites

- Existing cascading slot service using this library
- MongoDB database with appropriate permissions
- Node.js with Mongoose support
- Admin authentication system (for control endpoints)
- **DBA coordination** for database index creation and management

## Setup Guide

### 1. Database Setup

#### Create Required Collections

```bash
# Connect to your MongoDB instance
mongo your-database

# Create result_chains collection
db.createCollection("result_chains")

# Create player_chain_assignments collection
db.createCollection("player_chain_assignments")
```

#### Required Indexes (DBA Managed)

The following indexes should be created by your DBA for optimal performance:

```bash
# CRITICAL: Unique index to prevent duplicate active assignments
db.player_chain_assignments.createIndex(
  { "playerId": 1, "betLevel": 1, "coinValue": 1 },
  {
    unique: true,
    partialFilterExpression: { "status": "active" },
    name: "unique_active_assignment"
  }
)

# Performance indexes for common queries
db.player_chain_assignments.createIndex({ "playerId": 1 })
db.player_chain_assignments.createIndex({ "gameId": 1 })
db.player_chain_assignments.createIndex({ "status": 1 })
db.player_chain_assignments.createIndex({ "assignedAt": -1 })
db.player_chain_assignments.createIndex({ "lastActivityAt": 1 })

# Optional compound indexes for complex queries
db.player_chain_assignments.createIndex({ "playerId": 1, "status": 1 })
db.player_chain_assignments.createIndex({ "status": 1, "lastActivityAt": 1 })
```

#### Add Sample Chain Data

```javascript
// Insert a sample result chain
db.result_chains.insertOne({
  name: "wave-100boards-sample",
  boardsData: [
    {
      board: [
        /* 30 symbols array */
      ],
      multipliers: [1, 1, 1, 1, 1, 1],
      isFreeSpin: false,
      remainingFreeSpins: 0,
      settlementResult: {
        totalWin: 10,
        winningIcons: [],
        // ... other settlement data
      },
    },
    // ... more boards
  ],
  metadata: {
    createdAt: new Date(),
    description: "Sample 100-board wave chain",
  },
});
```

## AssignmentRepository Setup

Update your `CascadingSlotContainerRegistry` class:

```javascript
// Add import for the new repository
import PlayerChainAssignmentRepository from "./repositories/player-chain-assignment-repository.js";

export default class CascadingSlotContainerRegistry extends SlotContainerRegistry {
  // Add repository registration
  registerModels() {
    const definition = this.container.resolve("definition");

    super.registerModels();
    this.container.register({
      roundsRepository: asValue(rounds(definition.configName)),
      freeSpinsRepository: asValue(freeSpins(definition.configName)),
      totalMultiplierRepository: asValue(totalMultipliers(definition.configName)),
      resultChainRepository: asValue(resultChains(definition.configName)),
      // Add the new repository
      assignmentRepository: asClass(resultChains(definition.configName)),
    });
  }

  // Update existing ChainManager registration in registerBoardUtilities
  registerBoardUtilities() {
    this.container.register({
      boardSettings: asValue(defaultDefinition.boardSettings),
    });

    this.container.register({
      tumbleCalculator: asClass(TumbleCalculator),
      roundCalculator: asClass(RoundCalculator).proxy(),
      boardGenerator: asClass(CascadingBoardGenerator).singleton(),
      // ChainManager will automatically receive assignmentRepository via dependency injection
      resultChainManager: asClass(ChainManager).singleton(),
    });
  }
}
```

## Integration Guide

### 1. Container Registry Integration

The `ChainManager` now requires the `assignmentRepository` parameter. With your existing `CascadingSlotContainerRegistry`, this is handled automatically through constructor dependency injection.

**No changes needed to existing registrations!** Awilix automatically:

1. Detects that `ChainManager` constructor expects `assignmentRepository`
2. Finds `assignmentRepository` in the container
3. Injects it when creating the `ChainManager` instance

### 2. Enable Feature Configuration

```javascript
// In your app configuration
const appConfigs = {
  resultChains: {
    enabled: false, // Start disabled for safety
  },
  // ... other configs
};
```

### 3. Event Consumer Integration

The `SettleGameRoundConsumer` automatically receives the updated `ChainManager` through your existing container registry. No additional configuration needed.

## API Usage

### Admin Endpoints

#### Enable Result Chains

```bash
POST /api/admin/result-chains/toggle
Content-Type: application/json
Authorization: Bearer <admin-token>

{
    "enabled": true
}
```

#### Check System Status

```bash
GET /api/admin/result-chains/status
Authorization: Bearer <admin-token>
```

Response:

```json
{
  "enabled": true,
  "availableChains": 2,
  "activeAssignments": 15,
  "chains": [
    {
      "name": "wave-100boards-1757053424315",
      "boardCount": 100,
      "metadata": {
        "createdAt": "2025-01-20T10:30:00Z"
      }
    }
  ]
}
```

### Player Tracking Endpoints

#### Get Current Assignment

```bash
GET /api/player/{playerId}/chains/current
Authorization: Bearer <token>
```

#### Get Assignment History

```bash
GET /api/player/{playerId}/chains/history?page=1&limit=10
Authorization: Bearer <token>
```

#### Get Game Statistics

```bash
GET /api/game/{gameId}/chains/stats
Authorization: Bearer <admin-token>
```

## Schema Reference

### ResultChain Collection

```javascript
{
    name: String,              // Unique chain identifier
    boardsData: [              // Array of pre-defined boards
        {
            board: [Number],           // 30-element symbol array
            multipliers: [Number],     // Multiplier values per reel
            isFreeSpin: Boolean,       // Free spin indicator
            remainingFreeSpins: Number, // Remaining free spins
            settlementResult: {        // Pre-calculated results
                totalWin: Number,
                winningIcons: Array,
                // ... other settlement data
            }
        }
    ],
    metadata: Object           // Additional chain information
}
```

### PlayerChainAssignment Collection

```javascript
{
    // Player Identification
    playerId: String,           // Required - unique player identifier
    playerName: String,         // Required - player display name
    operatorId: String,         // Required - operator context
    gameId: String,             // Required - game identifier

    // Chain Information
    chainName: String,          // Required - references result_chains.name
    chainId: ObjectId,          // Optional - references result_chains._id

    // Progress Tracking
    currentBoardIndex: Number,  // Current position (0-based)
    totalBoards: Number,        // Total boards in chain

    // Financial Tracking
    balanceBeforeChain: Number, // Starting balance (set on first spin)
    balanceAfterChain: Number,  // Ending balance (set on completion)
    currency: String,           // Required - currency code

    // Status & Timing
    status: String,             // "active" | "completed"
    assignedAt: Date,           // Assignment timestamp
    completedAt: Date,          // Completion timestamp (if completed)
    lastActivityAt: Date,       // Last update timestamp

    // Financial Metrics
    totalWinAmount: Number,     // Accumulated winnings
    totalBetAmount: Number,     // Accumulated bets

    // Game Configuration
    betLevel: Number,           // Required - bet level used
    coinValue: Number,          // Required - coin value used
}
```

### Key Indexes

```javascript
// Unique active assignment per player/bet configuration
{ playerId: 1, betLevel: 1, coinValue: 1 } // unique, partial: status = "active"

// Query performance indexes
{ playerId: 1 }           // Player queries
{ gameId: 1 }             // Game-specific queries
{ status: 1 }             // Status filtering
{ assignedAt: -1 }        // Chronological sorting
{ lastActivityAt: 1 }     // Cleanup operations
```

## Usage Examples

### Basic Chain Assignment

```javascript
// Chain assignment happens automatically via ChainInterceptor
// when shouldAssignChain() returns true

// Access through container
const resultChainManager = container.resolve("resultChainManager");

await resultChainManager.assignChain(playerName, {
  playerId: player.UID,
  operatorId: player.session.operatorId,
  gameId: "cascading-slot-v1",
  currency: "USD",
  betLevel: 5,
  coinValue: 0.1,
});
```

### Progress Tracking

```javascript
// After round calculation, update progress
const resultChainManager = container.resolve("resultChainManager");
const playerChain = resultChainManager.gameData.playerChains[playerName];

if (playerChain) {
  await resultChainManager.updateChainProgress({
    playerId: player.UID,
    betLevel: round.betLevel,
    coinValue: round.coinValue,
    roundBetAmount: round.totalAmount,
    roundWinAmount: round.betwin || 0,
    currentBoardIndex: playerChain.currentIndex,
    totalBoards: playerChain.boards.length,
  });
}
```

### Query Operations

```javascript
// Get active assignment
const activeAssignment = await assignmentRepository.findOne(
  {
    playerId: "player123",
    status: "active",
  },
  { sort: { assignedAt: -1 } }
);

// Get completion statistics
const stats = await assignmentRepository.aggregate([
  { $match: { gameId: "cascading-slot-v1" } },
  {
    $group: {
      _id: "$status",
      count: { $sum: 1 },
      avgWin: { $avg: "$totalWinAmount" },
      avgBet: { $avg: "$totalBetAmount" },
    },
  },
]);
```

## Performance & Reliability

### 🚀 **Key Features**

- **Atomic MongoDB Operations**: Uses `$inc` for safe, concurrent updates
- **Session-Independent**: Chain progress persists across reconnections
- **Race Condition Safe**: Multiple concurrent spins won't corrupt data
- **Precise Filtering**: betLevel/coinValue prevent cross-player interference
- **Single Database Operation**: Optimized `findOneAndUpdate` calls
- **Clean Logic**: Simple "if chain result exists, track progress"

### 🎯 **Accurate Timing**

Progress tracking happens **AFTER** round calculation to ensure accuracy:

```javascript
// Implementation Flow
selectPreGeneratedResult()  // Get predetermined board
├── processSpinning()       // Calculate actual wins/losses
└── updateChainProgress()   // Track with real data
```

### 🔒 **Data Integrity**

- **Unique Constraints**: One active assignment per player/bet configuration
- **Atomic Updates**: Prevents data corruption during concurrent operations
- **Fail-Safe Design**: Game continues if tracking fails
- **Input Validation**: All required parameters validated

## Troubleshooting

### Common Issues

#### 1. Chains Not Loading

- **Check**: `appConfigs.resultChains.enabled` is `true`
- **Verify**: Database connection and `result_chains` collection exists
- **Test**: Query `db.result_chains.find()` returns data

#### 2. Players Not Getting Chain Results

- **Ensure**: `ChainInterceptor` is registered in event system
- **Check**: `shouldAssignChain()` returns `true` for target players
- **Verify**: `availableChains.length > 0` in status endpoint

#### 3. Assignment Tracking Failures

- **Verify**: `assignmentRepository` is properly injected into `ChainManager`
- **Check**: Required indexes exist (coordinate with DBA)
- **Monitor**: Error logs for database connection issues

#### 4. Duplicate Assignment Errors

- **Solution**: Unique index prevents duplicates - this is expected behavior
- **Check**: Player isn't already assigned to active chain for same bet config
- **Verify**: Previous assignments are properly completed

#### 5. Progress Not Updating

- **Verify**: `updateChainProgress` is called with correct parameters
- **Check**: `betLevel` and `coinValue` match the assignment
- **Ensure**: Parameters are not `undefined` (will cause filter mismatch)

### Testing Migration

```bash
# Test chain assignment
curl -X POST /api/admin/result-chains/toggle \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"enabled": true}'

# Verify status
curl -X GET /api/admin/result-chains/status \
  -H "Authorization: Bearer <token>"

# Test gameplay and check assignment creation
# Then verify in database:
db.player_chain_assignments.find().sort({assignedAt: -1}).limit(5);
```

## Deployment Checklist

- [ ] MongoDB `result_chains` and `player_chain_assignments` collections created
- [ ] **DBA**: All required indexes created and verified (especially unique constraint)
- [ ] AssignmentRepository implemented and registered in `CascadingSlotContainerRegistry`
- [ ] Container registry updated to include `assignmentRepository` in `registerModels()`
- [ ] Chain data uploaded to database and validated
- [ ] Admin routes properly secured with authentication
- [ ] Feature flag defaults to `disabled` in production
- [ ] All tests passing (especially chain-manager tests)

## Best Practices

1. **Start Small**: Begin with single test chain and few players
2. **Monitor Closely**: Track assignment creation, progress, and completion rates
3. **Document Chains**: Maintain metadata about chain purpose and characteristics
4. **Test Thoroughly**: Verify edge cases like chain completion, reconnection, concurrent play
5. **Plan Rollback**: Keep feature flag easily accessible for quick disable
6. **Performance**: Monitor memory usage and database query performance with large chains
7. **Security**: Protect admin endpoints with proper authentication and rate limiting
8. **Data Retention**: Plan for assignment data archival and cleanup policies

This comprehensive system provides robust, scalable result chain management with complete player progress tracking for cascading slot games.
