# Result Chains Database Schema - DBA Guide

## Overview

The Result Chains system is a game mechanic that assigns predefined board sequences to players based on their eligibility and RTP (Return to Player) strategy. This guide explains the database schema, data relationships, and common queries for operational support.

---

## Schema Architecture

### 1. **result_chains Collection**

**Purpose**: Stores predefined chain templates with board sequences used in the game.

```javascript
{
  _id: ObjectId,
  name: String,              // Unique identifier (e.g., "discovery-75boards-01")
  boardsData: Array,         // Array of board configurations for each cascade level
  volatility: Number,        // 1-5 scale (1=low, 5=high), default=2
  createdAt: Date,
  updatedAt: Date
}
```

**Key Fields Explanation**:

- **name**: Unique chain identifier combining pattern type and configuration

  - Pattern types: `discovery`, `cliffhanger`, `tease`, `wave`, `comeback`
  - Used for RTP categorization (HIGH RTP: discovery, cliffhanger; BALANCE RTP: tease, wave, comeback)

- **boardsData**: Array of board objects, each containing:

  - Board configuration (reels, symbols)
  - Win lines and payouts
  - Multipliers
  - Free spin triggers

- **volatility**: Risk/reward level
  - 1: Lowest volatility (more frequent small wins)
  - 5: Highest volatility (larger wins, less frequent)

**Sample Query**:

```javascript
db.result_chains.find({
  name: { $regex: "discovery|cliffhanger" }, // HIGH RTP chains
});
```

---

### 2. **player_chain_assignments Collection**

**Purpose**: Tracks individual player chain assignments, progress, and financial outcomes.

```javascript
{
  _id: ObjectId,

  // Player Identification
  playerId: String,          // Unique player identifier
  playerName: String,        // Player display name
  operatorId: String,        // Operator/site identifier
  gameId: String,            // Game identifier

  // Chain Information
  chainName: String,         // Reference to result_chains.name
  chainId: ObjectId,         // Reference to result_chains._id (optional)

  // Progress Tracking
  currentBoardIndex: Number, // 0-based index of current board
  totalBoards: Number,       // Total boards in the chain (50, 75, 100, etc.)

  // Financial Tracking
  balanceBeforeChain: Number,    // Player balance when chain was assigned
  balanceAfterChain: Number,     // Player balance when chain completed
  baseBetAmount: Number,         // Base bet per board (betLevel * coinValue)
  totalBetAmount: Number,        // Cumulative bets placed during chain
  totalWinAmount: Number,        // Cumulative wins during chain

  // Game Configuration
  betLevel: Number,          // Bet level (1, 2, 3, etc.)
  coinValue: Number,         // Coin value (0.01, 0.05, 0.1, etc.)
  currency: String,          // Player currency code

  // Status & Timing
  status: String,            // "active", "completed", "inactive"
  assignedAt: Date,          // When chain was assigned
  completedAt: Date,         // When chain was finished (null if active)
  lastActivityAt: Date,      // Last board played timestamp
  deactivatedAt: Date,       // When chain was deactivated (if applicable)

  // Metadata
  metadata: Object,          // Additional game-specific data

  createdAt: Date,           // Document creation timestamp
  updatedAt: Date            // Document last modified timestamp
}
```

---

## Key Metrics & Calculations

### Financial Outcome

```
Net Profit = balanceAfterChain - balanceBeforeChain
           = (totalWinAmount - totalBetAmount)
```

### Win Rate

```
Win Rate = totalWinAmount / totalBetAmount
Average per Board = totalWinAmount / totalBoards
```

### Chain Completion Status

```
Progress % = (currentBoardIndex / totalBoards) * 100
```

---

## Essential Queries for Operations

### 1. **Player Session Play History with Chain Data**

Get all chains played by a player in a session:

```javascript
db.player_chain_assignments
  .find({
    playerId: "player_123",
    operatorId: "operator_456",
    gameId: "cascading_slots_v1",
  })
  .sort({ assignedAt: -1 });
```

Detailed session analysis (completed chains only):

```javascript
db.player_chain_assignments.aggregate([
  {
    $match: {
      playerId: "player_123",
      status: "completed",
      completedAt: { $gte: new Date("2024-01-01") },
    },
  },
  {
    $group: {
      _id: "$playerId",
      totalChainsCompleted: { $sum: 1 },
      totalBet: { $sum: "$totalBetAmount" },
      totalWin: { $sum: "$totalWinAmount" },
      netProfit: { $sum: { $subtract: ["$totalWinAmount", "$totalBetAmount"] } },
      avgChainDuration: { $avg: { $subtract: ["$completedAt", "$assignedAt"] } },
    },
  },
]);
```

---

### 2. **Chain Assignment Effectiveness Tracking**

Overall chain performance metrics:

```javascript
db.player_chain_assignments.aggregate([
  {
    $match: {
      status: "completed",
      completedAt: {
        $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
      },
    },
  },
  {
    $group: {
      _id: "$chainName",
      assignmentCount: { $sum: 1 },
      completionRate: {
        $avg: {
          $cond: [{ $eq: ["$status", "completed"] }, 1, 0],
        },
      },
      avgBetAmount: { $avg: "$totalBetAmount" },
      avgWinAmount: { $avg: "$totalWinAmount" },
      avgNetProfit: {
        $avg: { $subtract: ["$totalWinAmount", "$totalBetAmount"] },
      },
      playerCount: { $sum: 1 },
    },
  },
  {
    $sort: { assignmentCount: -1 },
  },
]);
```

**Key Metrics**:

- Assignment count: How many players got this chain
- Completion rate: % of players who finished the chain
- Average net profit: Financial performance of the chain
- ROI: (totalWinAmount / totalBetAmount) - 1

---

### 3. **Win Streak Detection (3+ Days)**

Identify players with consecutive winning streaks:

```javascript
db.player_chain_assignments.aggregate([
  {
    $match: {
      status: "completed",
      totalWinAmount: { $gt: "$totalBetAmount" }, // Profitable chains
    },
  },
  {
    $group: {
      _id: "$playerId",
      chains: {
        $push: {
          chainName: "$chainName",
          date: { $dateToString: { format: "%Y-%m-%d", date: "$completedAt" } },
          profit: { $subtract: ["$totalWinAmount", "$totalBetAmount"] },
        },
      },
    },
  },
  {
    $project: {
      _id: 1,
      winStreakDays: {
        $size: {
          $setToArray: { $setUnion: ["$chains.date"] },
        },
      },
      chains: 1,
    },
  },
  {
    $match: {
      winStreakDays: { $gte: 3 }, // 3 or more days
    },
  },
]);
```

**Alternative - Using Lookup for Better Performance**:

```javascript
db.player_chain_assignments.aggregate([
  {
    $match: {
      status: "completed",
      completedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
  },
  {
    $addFields: {
      date: { $dateToString: { format: "%Y-%m-%d", date: "$completedAt" } },
      profit: { $subtract: ["$totalWinAmount", "$totalBetAmount"] },
    },
  },
  {
    $group: {
      _id: { playerId: "$playerId", date: "$date" },
      totalProfit: { $sum: "$profit" },
      chainCount: { $sum: 1 },
    },
  },
  {
    $match: {
      totalProfit: { $gt: 0 }, // Winning day
    },
  },
  {
    $group: {
      _id: "$_id.playerId",
      winningDays: {
        $push: {
          date: "$_id.date",
          totalProfit: "$totalProfit",
          chainCount: "$chainCount",
        },
      },
      consecutiveDays: { $sum: 1 },
    },
  },
  {
    $match: {
      consecutiveDays: { $gte: 3 },
    },
  },
  {
    $sort: { consecutiveDays: -1 },
  },
]);
```

---

### 4. **Dashboard Queries - Chain Effectiveness**

#### 4.1 Chain Popularity & Engagement

```javascript
db.player_chain_assignments.aggregate([
  {
    $match: {
      assignedAt: {
        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
      },
    },
  },
  {
    $facet: {
      popularity: [
        {
          $group: {
            _id: "$chainName",
            assignmentCount: { $sum: 1 },
            uniquePlayers: { $addToSet: "$playerId" },
            abandonment: {
              $sum: {
                $cond: [{ $eq: ["$status", "active"] }, 1, 0],
              },
            },
          },
        },
        {
          $project: {
            _id: 1,
            assignmentCount: 1,
            uniquePlayerCount: { $size: "$uniquePlayers" },
            abandonmentRate: {
              $divide: ["$abandonment", "$assignmentCount"],
            },
          },
        },
        { $sort: { assignmentCount: -1 } },
      ],
      profitability: [
        {
          $match: { status: "completed" },
        },
        {
          $group: {
            _id: "$chainName",
            avgWinAmount: { $avg: "$totalWinAmount" },
            avgBetAmount: { $avg: "$totalBetAmount" },
            avgNetProfit: {
              $avg: { $subtract: ["$totalWinAmount", "$totalBetAmount"] },
            },
            volatility: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 1,
            avgWinAmount: { $round: ["$avgWinAmount", 2] },
            avgBetAmount: { $round: ["$avgBetAmount", 2] },
            avgNetProfit: { $round: ["$avgNetProfit", 2] },
            winRate: {
              $round: [{ $multiply: [{ $divide: ["$avgWinAmount", "$avgBetAmount"] }, 100] }, 2],
            },
          },
        },
        { $sort: { avgNetProfit: -1 } },
      ],
    },
  },
]);
```

#### 4.2 Player Behavior Segmentation

```javascript
db.player_chain_assignments.aggregate([
  {
    $match: {
      status: "completed",
    },
  },
  {
    $group: {
      _id: "$playerId",
      chainCompleted: { $sum: 1 },
      totalBet: { $sum: "$totalBetAmount" },
      totalWin: { $sum: "$totalWinAmount" },
      avgBetLevel: { $avg: "$betLevel" },
      lastPlayDate: { $max: "$completedAt" },
    },
  },
  {
    $addFields: {
      netProfit: { $subtract: ["$totalWin", "$totalBet"] },
      roi: {
        $round: [{ $multiply: [{ $divide: [{ $subtract: ["$totalWin", "$totalBet"] }, "$totalBet"] }, 100] }, 2],
      },
      segment: {
        $cond: [{ $gte: [{ $subtract: ["$totalWin", "$totalBet"] }, 0] }, "Winner", "Loser"],
      },
    },
  },
  {
    $facet: {
      segment_summary: [
        {
          $group: {
            _id: "$segment",
            playerCount: { $sum: 1 },
            avgNetProfit: { $avg: "$netProfit" },
            avgRoi: { $avg: "$roi" },
          },
        },
      ],
      top_winners: [
        { $match: { segment: "Winner" } },
        { $sort: { netProfit: -1 } },
        { $limit: 10 },
        { $project: { _id: 1, chainCompleted: 1, netProfit: 1, roi: 1 } },
      ],
    },
  },
]);
```

---

## Recommended Indexes

To optimize query performance, create these indexes:

```javascript
// Index 1: Player lookup with status and date
db.player_chain_assignments.createIndex({
  playerId: 1,
  status: 1,
  completedAt: -1,
});

// Index 2: Chain performance analytics
db.player_chain_assignments.createIndex({
  chainName: 1,
  status: 1,
  completedAt: -1,
});

// Index 3: Time-range queries
db.player_chain_assignments.createIndex({
  completedAt: -1,
  status: 1,
});

// Index 4: Win streak detection
db.player_chain_assignments.createIndex({
  playerId: 1,
  completedAt: -1,
  totalWinAmount: 1,
  totalBetAmount: 1,
});

// Index 5: Operator/Game/Player combo
db.player_chain_assignments.createIndex({
  operatorId: 1,
  gameId: 1,
  playerId: 1,
  assignedAt: -1,
});

// Compound index for result chains
db.result_chains.createIndex({
  name: 1,
  volatility: 1,
});
```

---

## Alert Configuration - Win Streak Detection

### Setup MongoDB Change Streams or Scheduled Job:

```javascript
// Option 1: Scheduled aggregation (Run daily)
db.player_chain_assignments.aggregate([
  {
    $match: {
      completedAt: {
        $gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // Last 3 days
        $lt: new Date(),
      },
      status: "completed",
    },
  },
  {
    $addFields: {
      date: { $dateToString: { format: "%Y-%m-%d", date: "$completedAt" } },
      profit: { $subtract: ["$totalWinAmount", "$totalBetAmount"] },
    },
  },
  {
    $group: {
      _id: { playerId: "$playerId", date: "$date" },
      dayProfit: { $sum: "$profit" },
      chainCount: { $sum: 1 },
    },
  },
  {
    $match: {
      dayProfit: { $gt: 0 },
    },
  },
  {
    $group: {
      _id: "$_id.playerId",
      winningDates: { $push: "$_id.date" },
      winningDayCount: { $sum: 1 },
      totalWinProfit: { $sum: "$dayProfit" },
    },
  },
  {
    $match: {
      winningDayCount: { $gte: 3 },
    },
  },
  {
    $out: "streak_alerts", // Save to collection
  },
]);
```

---

## Data Retention & Archival

**Recommendation**:

- Keep active assignments in main collection
- Archive completed assignments > 90 days old to separate collection
- Maintain materialized views for dashboard queries

```javascript
// Archive query (run monthly)
db.player_chain_assignments.aggregate([
  {
    $match: {
      status: "completed",
      completedAt: { $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    },
  },
  {
    $out: "player_chain_assignments_archive",
  },
]);
```

---

## Troubleshooting Common Issues

| Issue                        | Query                                                                                                                     | Action                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Missing `balanceBeforeChain` | `db.player_chain_assignments.find({ balanceBeforeChain: null })`                                                          | Backfill with estimated values    |
| Orphaned assignments         | `db.player_chain_assignments.find({ chainId: { $eq: null } })`                                                            | Verify chain still exists         |
| Incomplete chains            | `db.player_chain_assignments.find({ status: "active", lastActivityAt: { $lt: new Date(Date.now() - 7*24*60*60*1000) } })` | Consider auto-marking as inactive |

---

## Support & Questions

This schema supports:

- ✅ Player session play history with chain tracking
- ✅ Ticket/support lookups (chain progress, financial disputes)
- ✅ Chain effectiveness dashboards (ROI, completion rates)
- ✅ Win streak alerts (3+ consecutive days)
- ✅ Fraud detection (unusual winning patterns)
- ✅ Compliance reporting (session details)
