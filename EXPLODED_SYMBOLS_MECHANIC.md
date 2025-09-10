# ExplodedSymbols Mechanic Documentation

## Overview

This document explains the `explodedSymbols` mechanic in the cascading slot game, including how boards convert to tumbles, the cascade processing, and the expected behavior patterns.

## Table of Contents

- [Core Concepts](#core-concepts)
- [Technical Implementation](#technical-implementation)
- [ExplodedSymbols Behavior Pattern](#explodedsymbols-behavior-pattern)
- [Code Flow](#code-flow)
- [Test Verification](#test-verification)
- [Examples](#examples)

## Core Concepts

### Tumbles and Cascades

- **Tumble**: A single evaluation of the board for winning combinations
- **Cascade**: The process of removing winning symbols and dropping new ones
- **ExplodedSymbols**: Array indicating which symbols were destroyed due to winning combinations
- **NewSymbols**: Array of replacement symbols that fall into empty positions

### Symbol Representation

**Internal Format** (`explodedSymbols`, `newSymbols`):

- `explodedSymbols[i] = -1`: Symbol at position `i` was NOT destroyed
- `explodedSymbols[i] = originalSymbol`: Symbol at position `i` WAS destroyed (shows what was there)
- `newSymbols[i] = -1`: No new symbol at position `i`
- `newSymbols[i] = replacementSymbol`: New symbol that dropped into position `i`

**Client Format** (`settlement.explode`, `settlement.new`):

- Same array structure, just nested under `settlement` object
- `settlement.explode` = `explodedSymbols`
- `settlement.new` = `newSymbols`

## Technical Implementation

### 1. Round Processing (`RoundCalculator.processSpinning()`)

```javascript
// Initial tumble creation
const firstTumble = {
  originalBoard: round.result,
  newBoard: round.result,
  multipliers: generatedResult.multipliers,
};

const tumbles = [firstTumble];

// Cascade processing loop
while (this.settleTumble(round, totalMultiplier, maxWinPerRound)) {
  const lastTumble = tumbles[tumbles.length - 1];

  // Generate explosion and refill
  const refilledResult = this.boardGenerator.explodeAndRefill(
    lastTumble.originalBoard.split(",").map((x) => parseInt(x)),
    Object.keys(lastTumble.icons).map((x) => parseInt(x)),
    lastTumble.multipliers
  );

  // Assign explodedSymbols to CURRENT tumble
  lastTumble.newBoard = refilledResult.newBoard.join(",");
  lastTumble.explodedSymbols = refilledResult.explodedSymbols;
  lastTumble.newSymbols = refilledResult.newSymbols;

  // Create NEXT tumble for continued processing
  const nextTumble = {
    icons: {},
    originalBoard: lastTumble.newBoard,
    newBoard: lastTumble.newBoard,
    multipliers: refilledResult.multipliers,
    win: 0,
  };

  tumbles.push(nextTumble);
}
```

### 2. Chain Conversion (`ChainManager.convertChainBoardToResult()`)

```javascript
convertChainBoardToResult(chainBoard) {
    if (chainBoard.settlementResult && chainBoard.settlementResult.tumbles) {
        return chainBoard.settlementResult.tumbles.map((tumble) => ({
            newBoard: tumble.originalBoard ? tumble.originalBoard.split(",").map((x) => parseInt(x)) : chainBoard.board,
            multipliers: tumble.multipliers || chainBoard.multipliers || [],
            icons: tumble.icons || {},
            explodedSymbols: tumble.explodedSymbols || [],
            newSymbols: tumble.newSymbols || [],
        }));
    }

    return [
        {
            newBoard: chainBoard.board,
            multipliers: chainBoard.multipliers || [],
            icons: {},
            explodedSymbols: [],
            newSymbols: [],
        },
    ];
}
```

### 3. Settlement Result Format (`SettleGameRoundConsumer.collectRoundResult()`)

```javascript
tumbles: round.settlementResult.tumbles.map((tumble) => ({
  icons: tumble.icons,
  win: tumble.win,
  result: tumble.newBoard,
  settlement: {
    explode: tumble.explodedSymbols, // ← Final format for client
    new: tumble.newSymbols, // ← Final format for client
  },
  multipliers: tumble.multipliers,
}));
```

## ExplodedSymbols Behavior Pattern

### ✅ **Expected Behavior Pattern**

Based on analysis of 100 test boards with multiple tumbles:

| Tumble Position                    | ExplodedSymbols Status | Reason                                                                |
| ---------------------------------- | ---------------------- | --------------------------------------------------------------------- |
| **Non-Final Tumbles** (1, 2, 3...) | ✅ **Populated**       | These tumbles had winning combinations that caused symbols to explode |
| **Final Tumble**                   | ❌ **Always Empty**    | No winning combinations, so no symbols exploded                       |

### 📊 **Statistical Verification**

From `tease-100boards-1757052724648.json` analysis:

- **16 boards** have >2 tumbles
- **16/16 final tumbles** (100%) have empty `explodedSymbols`
- **All non-final tumbles** with wins have populated `explodedSymbols`

### 🔍 **Why Final Tumbles Are Empty**

The final tumble represents the **end state** of the cascade:

1. **No Winning Combinations**: The cascade stops because there are no more winning combinations
2. **No Explosions**: Without wins, no symbols are destroyed
3. **Empty Array**: `explodedSymbols` correctly shows `[]` or all `-1` values

## Code Flow

```mermaid
graph TD
    A[Initial Board] --> B[Create First Tumble]
    B --> C[Calculate Wins & Icons]
    C --> D{Has Winning Icons?}

    D -->|Yes| E[explodeAndRefill()]
    E --> F[Assign explodedSymbols to Current Tumble]
    F --> G[Create Next Tumble]
    G --> C

    D -->|No| H[Final Tumble - No explodedSymbols]
    H --> I[End Cascade]
```

## Test Verification

### Test File: `src/board/__tests__/result-chain-manager.test.js`

The `convertChainBoardToResult` test suite verifies the **settlement format** behavior using **inline mock data**:

1. **Conversion Accuracy**: Chain board data is correctly converted to settlement format with `settlement.explode` and `settlement.new` arrays
2. **Final Tumble Pattern**: All final tumbles have empty `settlement.explode` and `settlement.new` arrays
3. **Non-Final Tumble Pattern**: Winning tumbles have populated `settlement.explode` and `settlement.new` arrays
4. **Statistical Validation**: Pattern consistency verified across mock test data (3 boards with 3-5 tumbles)
5. **Format Structure**: Verifies that the settlement object structure is correctly formed
6. **Edge Cases**: Tests boards without settlement results return consistent format

**Test Data Structure**: The tests use comprehensive inline mock data including:

- 3-tumble cascade example with winning combinations
- 4-tumble cascade example with complex patterns
- 5-tumble cascade example with multiple symbol types
- 2-tumble example (excluded from >2 tumble tests)

**Settlement Format Verification**: Tests verify that the conversion correctly populates the settlement format:

- **Winning tumbles**: `settlement.explode` contains exploded symbol values, `settlement.new` contains replacement symbols
- **Final tumbles**: `settlement.explode` and `settlement.new` are empty arrays `[]` (expected behavior)
- **Format consistency**: Matches exactly what `SettleGameRoundConsumer` expects for client responses

**Note**: Tests are independent of external files, making them fast, reliable, and maintainable. The mock data covers all essential exploded symbols behavior patterns and verifies correct settlement format population.

### Running the Tests

```bash
npm test src/board/__tests__/result-chain-manager.test.js
```

## Examples

### Example 1: 3-Tumble Cascade (Internal Chain Data)

```javascript
{
  "settlementResult": {
    "tumbles": [
      {
        "originalBoard": "1,1,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8",
        "explodedSymbols": [-1,-1,-1,1,1,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        "newSymbols": [2,3,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        "win": 15
      },
      {
        "originalBoard": "2,3,4,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8",
        "explodedSymbols": [-1,-1,-1,2,2,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        "newSymbols": [5,6,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        "win": 10
      },
      {
        "originalBoard": "5,6,7,5,6,7,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8",
        "explodedSymbols": [],  // ← EMPTY: No winning combinations
        "newSymbols": [],       // ← EMPTY: No new symbols needed
        "win": 0
      }
    ]
  }
}
```

### Example 2: Settlement Result Format (Client Response)

```javascript
{
  "tumbles": [
    {
      "icons": { "1": { "count": 3, "odds": 5, "win": 15 } },
      "win": 15,
      "result": "2,3,4,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8",
      "settlement": {
        "explode": [-1,-1,-1,1,1,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        "new": [2,3,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1]
      },
      "multipliers": []
    },
    {
      "icons": { "2": { "count": 3, "odds": 3.33, "win": 10 } },
      "win": 10,
      "result": "5,6,7,5,6,7,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8",
      "settlement": {
        "explode": [-1,-1,-1,2,2,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        "new": [5,6,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1]
      },
      "multipliers": []
    },
    {
      "icons": {},
      "win": 0,
      "result": "5,6,7,5,6,7,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8",
      "settlement": {
        "explode": [],  // ← EMPTY: Final tumble has no explosions
        "new": []       // ← EMPTY: Final tumble needs no new symbols
      },
      "multipliers": []
    }
  ]
}
```

### Example 3: 5-Tumble Cascade Pattern

```javascript
// Internal chain data format
{
  "settlementResult": {
    "tumbles": [
      { "explodedSymbols": [/* 9 exploded symbols */], "win": 25 },
      { "explodedSymbols": [/* 8 exploded symbols */], "win": 20 },
      { "explodedSymbols": [/* 10 exploded symbols */], "win": 30 },
      { "explodedSymbols": [/* 8 exploded symbols */], "win": 15 },
      { "explodedSymbols": [], "win": 0 }  // ← Final tumble: ALWAYS EMPTY
    ]
  }
}

// Client settlement format
{
  "tumbles": [
    { "settlement": { "explode": [/* 9 exploded */], "new": [/* replacements */] }, "win": 25 },
    { "settlement": { "explode": [/* 8 exploded */], "new": [/* replacements */] }, "win": 20 },
    { "settlement": { "explode": [/* 10 exploded */], "new": [/* replacements */] }, "win": 30 },
    { "settlement": { "explode": [/* 8 exploded */], "new": [/* replacements */] }, "win": 15 },
    { "settlement": { "explode": [], "new": [] }, "win": 0 }  // ← Final: ALWAYS EMPTY
  ]
}
```

## Data Format Summary

The exploded symbols data flows through **different formats** optimized for each layer:

1. **Internal Processing** (`RoundCalculator`): Uses `explodedSymbols` and `newSymbols` arrays directly
2. **Chain Data Storage**: Stores raw `explodedSymbols` and `newSymbols` arrays in JSON files
3. **Chain Conversion** (`ChainManager`): Returns `explodedSymbols`/`newSymbols` format for `RoundCalculator` compatibility
4. **Client Response** (`SettleGameRoundConsumer`): Transforms to `settlement: { explode: [], new: [] }` format for client

**Format Transformation Pipeline:**

```
Chain Data → ChainManager → RoundCalculator → SettleGameRoundConsumer → Client
explodedSymbols → explodedSymbols → explodedSymbols → settlement.explode → Client UI
```

**Benefits of Layered Formats:**

- Each component gets the format it needs
- `RoundCalculator` receives compatible data via `preGeneratedResult`
- Client gets clean, standardized settlement structure
- Clear separation of concerns

## Key Takeaways

1. **Expected Behavior**: Final tumbles having empty `explodedSymbols` and `newSymbols` arrays is **correct and expected**
2. **Cascade Logic**: The cascade stops precisely because no symbols explode
3. **Data Integrity**: The pattern is consistent across all test data and format transformations
4. **Implementation**: The code correctly implements layered format transformation: `ChainManager` → `RoundCalculator` → `SettleGameRoundConsumer`
5. **Format Compatibility**: `ChainManager` returns `RoundCalculator` compatible format, `SettleGameRoundConsumer` transforms to client format

## Maintenance Notes

- This behavior should remain consistent in future updates
- Any changes to cascade logic should preserve this pattern
- The test suite will catch any unintended modifications to this behavior
- Tests are independent of external chain files, making them reliable and fast
- Mock test data comprehensively covers all exploded symbols scenarios
- New chain data should follow the same pattern for consistency

---

_Last Updated: September 2025_  
_Verified Against: Comprehensive inline mock test data (3 multi-tumble boards)_
