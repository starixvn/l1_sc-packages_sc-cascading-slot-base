# Settlement Data Flow: ChainManager → processSpinning

This document traces the complete flow of settlement data (exploded symbols) from chain data through to the final client response.

## Overview

```
ChainManager → preGeneratedResult → RoundCalculator → SettleGameRoundConsumer → Client
```

## Step-by-Step Data Flow

### 1. Chain Data Source

**Location**: JSON files in `src/chain-output/`

```javascript
// Example chain board data
{
  "board": [1,1,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8],
  "settlementResult": {
    "tumbles": [
      {
        "originalBoard": "1,1,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8",
        "icons": { "1": { "count": 3, "odds": 5, "win": 15 } },
        "explodedSymbols": [-1,-1,-1,1,1,1,-1,-1,-1,...],  // 🔹 Winning tumble has data
        "newSymbols": [2,3,4,-1,-1,-1,-1,-1,-1,...]        // 🔹 New symbols to drop
      },
      {
        "originalBoard": "2,3,4,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8",
        "icons": { "2": { "count": 3, "odds": 3.33, "win": 10 } },
        "explodedSymbols": [-1,-1,-1,2,2,2,-1,-1,-1,...],  // 🔹 Winning tumble has data
        "newSymbols": [5,6,7,-1,-1,-1,-1,-1,-1,...]        // 🔹 New symbols to drop
      },
      {
        "originalBoard": "5,6,7,5,6,7,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8",
        "icons": {},
        "explodedSymbols": [],  // 🔹 Final tumble: empty (no more wins)
        "newSymbols": []        // 🔹 Final tumble: empty (no more cascades)
      }
    ]
  }
}
```

### 2. ChainManager.getNextResult()

**File**: `src/board/chain-manager.js`

```javascript
async getNextResult(playerName, playerContext = {}, roundContext = {}) {
    // ... chain selection logic ...

    const currentBoard = playerChain.boards[playerChain.currentIndex];
    let boardResult = this.convertChainBoardToResult(currentBoard); // 🔄 Convert format

    return boardResult; // 🚀 Returns preGeneratedResult format
}
```

### 3. ChainManager.convertChainBoardToResult()

**Format Conversion**: Chain data → RoundCalculator compatible format

```javascript
convertChainBoardToResult(chainBoard) {
    if (chainBoard.settlementResult && chainBoard.settlementResult.tumbles) {
        return chainBoard.settlementResult.tumbles.map((tumble) => ({
            newBoard: tumble.originalBoard ? tumble.originalBoard.split(",").map((x) => parseInt(x)) : chainBoard.board,
            multipliers: tumble.multipliers || chainBoard.multipliers || [],
            icons: tumble.icons || {},
            explodedSymbols: tumble.explodedSymbols || [],  // 🔹 Direct mapping
            newSymbols: tumble.newSymbols || [],            // 🔹 Direct mapping
        }));
    }

    return [{
        newBoard: chainBoard.board,
        multipliers: chainBoard.multipliers || [],
        icons: {},
        explodedSymbols: [],  // 🔹 Default empty
        newSymbols: [],       // 🔹 Default empty
    }];
}
```

**Output Format** (preGeneratedResult):

```javascript
[
  {
    newBoard: [1,1,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8],
    multipliers: [1],
    icons: { "1": { "count": 3, "odds": 5, "win": 15 } },
    explodedSymbols: [-1,-1,-1,1,1,1,-1,-1,-1,...],  // ✅ RoundCalculator format
    newSymbols: [2,3,4,-1,-1,-1,-1,-1,-1,...]        // ✅ RoundCalculator format
  },
  {
    newBoard: [2,3,4,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8],
    multipliers: [1],
    icons: { "2": { "count": 3, "odds": 3.33, "win": 10 } },
    explodedSymbols: [-1,-1,-1,2,2,2,-1,-1,-1,...],
    newSymbols: [5,6,7,-1,-1,-1,-1,-1,-1,...]
  },
  {
    newBoard: [5,6,7,5,6,7,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8],
    multipliers: [1],
    icons: {},
    explodedSymbols: [],  // ✅ Empty for final tumble
    newSymbols: []        // ✅ Empty for final tumble
  }
]
```

### 4. SettleGameRoundConsumer.processSpinning()

**File**: `src/event-consumers/settle-game-round-consumer.js`

```javascript
async processSpinning(player, round) {
    // ... setup code ...

    const preGeneratedResult = await this.selectPreGeneratedResult(player, round);
    // 🔹 preGeneratedResult comes from ChainManager.getNextResult()

    round = this.roundCalculator.processSpinning(
        round,
        currentTotalMultiplier,
        maxWinPerRound,
        preGeneratedResult  // 🚀 Pass chain data to RoundCalculator
    );

    // ... rest of processing ...
}
```

### 5. RoundCalculator.processSpinning()

**File**: `src/board/round-calculator.js`

```javascript
processSpinning(round, totalMultiplier = 0, maxWinPerRound = Number.MAX_VALUE, preGeneratedResult = null) {
    // First tumble setup
    const generatedResult = preGeneratedResult?.shift() ?? this.boardGenerator.generate();
    // 🔹 .shift() removes first tumble from preGeneratedResult array

    round.result = generatedResult.newBoard.join(",");

    const firstTumble = {
        originalBoard: round.result,
        newBoard: round.result,
        multipliers: generatedResult.multipliers,
    };

    const tumbles = [firstTumble];
    round.settlementResult = { tumbles };

    // Cascade processing loop
    while (this.settleTumble(round, totalMultiplier, maxWinPerRound)) {
        const lastTumble = tumbles[tumbles.length - 1];

        const refilledResult =
            preGeneratedResult?.shift() ??  // 🔹 Get next tumble from chain
            this.boardGenerator.explodeAndRefill(
                lastTumble.originalBoard.split(",").map((x) => parseInt(x)),
                Object.keys(lastTumble.icons).map((x) => parseInt(x)),
                lastTumble.multipliers
            );

        // 🔹 Now these properties exist and are accessible!
        lastTumble.newBoard = refilledResult.newBoard.join(",");
        lastTumble.explodedSymbols = refilledResult.explodedSymbols;  // ✅ Works!
        lastTumble.newSymbols = refilledResult.newSymbols;            // ✅ Works!

        const nextTumble = {
            icons: {},
            originalBoard: lastTumble.newBoard,
            newBoard: lastTumble.newBoard,
            multipliers: refilledResult.multipliers,
            win: 0,
        };

        tumbles.push(nextTumble);
    }

    return round;
}
```

**Critical Fix**: The `refilledResult` object now has `explodedSymbols` and `newSymbols` properties that RoundCalculator can access!

### 6. Round Result Structure

After `processSpinning`, the round contains:

```javascript
round.settlementResult = {
    tumbles: [
        {
            originalBoard: "1,1,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8",
            newBoard: "2,3,4,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8",
            multipliers: [1],
            icons: { "1": { "count": 3, "odds": 5, "win": 15 } },
            explodedSymbols: [-1,-1,-1,1,1,1,-1,-1,-1,...],  // ✅ Preserved from chain
            newSymbols: [2,3,4,-1,-1,-1,-1,-1,-1,...]        // ✅ Preserved from chain
        },
        {
            originalBoard: "2,3,4,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8",
            newBoard: "5,6,7,5,6,7,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8",
            multipliers: [1],
            icons: { "2": { "count": 3, "odds": 3.33, "win": 10 } },
            explodedSymbols: [-1,-1,-1,2,2,2,-1,-1,-1,...],  // ✅ Preserved from chain
            newSymbols: [5,6,7,-1,-1,-1,-1,-1,-1,...]        // ✅ Preserved from chain
        },
        {
            originalBoard: "5,6,7,5,6,7,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8",
            newBoard: "5,6,7,5,6,7,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8",
            multipliers: [1],
            icons: {},
            explodedSymbols: [],  // ✅ Empty final tumble (cascade stops)
            newSymbols: []        // ✅ Empty final tumble (no new symbols)
        }
    ]
}
```

### 7. SettleGameRoundConsumer.collectRoundResult()

**Format Transformation**: Internal → Client format

```javascript
collectRoundResult(player, round, betResult) {
    return {
        finish: {
            // ... other properties ...
            tumbles: round.settlementResult.tumbles.map((tumble) => ({
                icons: tumble.icons,
                win: tumble.win,
                result: tumble.newBoard,
                settlement: {
                    explode: tumble.explodedSymbols,  // 🔄 Transform to client format
                    new: tumble.newSymbols,           // 🔄 Transform to client format
                },
                multipliers: tumble.multipliers,
            })),
            // ... other properties ...
        },
    };
}
```

### 8. Final Client Response

**Client receives**:

```javascript
{
    finish: {
        tumbles: [
            {
                icons: { "1": { "count": 3, "odds": 5, "win": 15 } },
                win: 15,
                result: "2,3,4,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8",
                settlement: {
                    explode: [-1,-1,-1,1,1,1,-1,-1,-1,...],  // 🎯 Client format
                    new: [2,3,4,-1,-1,-1,-1,-1,-1,...]       // 🎯 Client format
                }
            },
            {
                icons: { "2": { "count": 3, "odds": 3.33, "win": 10 } },
                win: 10,
                result: "5,6,7,5,6,7,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8",
                settlement: {
                    explode: [-1,-1,-1,2,2,2,-1,-1,-1,...],
                    new: [5,6,7,-1,-1,-1,-1,-1,-1,...]
                }
            },
            {
                icons: {},
                win: 0,
                result: "5,6,7,5,6,7,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8",
                settlement: {
                    explode: [],  // 🎯 Empty final tumble
                    new: []       // 🎯 Empty final tumble
                }
            }
        ]
    }
}
```

## Key Points

### ✅ **What Works Now**

1. **Format Compatibility**: `ChainManager` returns `explodedSymbols`/`newSymbols` that `RoundCalculator` can access
2. **Data Preservation**: Settlement data flows intact from chain storage to client response
3. **Layered Transformation**: Each component gets the format it needs
4. **Clear Separation**: Internal processing vs client response formats

### 🔄 **Format Transformations**

| Component               | Format                         | Purpose                       |
| ----------------------- | ------------------------------ | ----------------------------- |
| Chain Data              | `explodedSymbols`/`newSymbols` | Storage format                |
| ChainManager            | `explodedSymbols`/`newSymbols` | RoundCalculator compatibility |
| RoundCalculator         | `explodedSymbols`/`newSymbols` | Internal processing           |
| SettleGameRoundConsumer | `settlement: {explode, new}`   | Clean client API              |

### 🚨 **Previous Issue (Fixed)**

**Before**: `ChainManager` returned `settlement: {explode, new}` format, but `RoundCalculator` expected `explodedSymbols`/`newSymbols` properties directly.

**After**: `ChainManager` returns the format `RoundCalculator` expects, and transformation to client format happens only at the final response layer.

## Maintenance Notes

- Keep `ChainManager.convertChainBoardToResult()` returning `explodedSymbols`/`newSymbols` format
- Client format transformation should only happen in `SettleGameRoundConsumer`
- Any changes to settlement data structure need to be reflected in all layers
- The empty final tumble pattern (`explodedSymbols: []`, `newSymbols: []`) is expected and correct
