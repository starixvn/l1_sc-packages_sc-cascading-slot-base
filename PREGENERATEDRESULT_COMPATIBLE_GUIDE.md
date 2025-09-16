# Settlement Tumble Data Generation Guide

## Overview

This guide shows how to generate correct **settlement tumble data** that integrates with the cascading slot game's chain system. The data you generate will be stored in the database and processed by ChainManager when players are assigned chains.

## Quick Start

Generate settlement data in the correct format → Store in database → ChainManager retrieves via `getNextResult()` → RoundCalculator processes → Client receives results

## Table of Contents

- [Data Flow Architecture](#data-flow-architecture)
- [Settlement Data Format](#settlement-data-format)
- [Tumble Structure Patterns](#tumble-structure-patterns)
- [Database Storage Format](#database-storage-format)
- [Common Scenarios](#common-scenarios)
- [Free Spin Processing](#free-spin-processing)
  - [Free Spin Flow: Trigger → Execution](#free-spin-flow-trigger--execution)
- [Validation Rules](#validation-rules)
- [Integration Points](#integration-points)

## Data Flow Architecture

### Complete Integration Flow

```
Your Service → Generate Settlement Data → Database Storage → ChainManager.getNextResult() → ChainManager.convertChainBoardToResult() → RoundCalculator.processSpinning() → Client
```

**Your Role**: Generate correctly structured settlement tumble data  
**Database Role**: Store board and settlement data  
**ChainManager Role**: Retrieve and convert data for RoundCalculator  
**Result**: Seamless game processing

## Settlement Data Format

### Database Board Structure

Your service should generate data in this format for database storage:

```typescript
interface BoardData {
  board: number[]; // Array of 30 integers (0-10, representing initial symbols)
  multipliers: number[]; // Array of multiplier values
  settlementResult: {
    tumbles: TumbleData[]; // Array of tumble results
    freeSpins: {
      count: number;
      odds: number;
    };
    additionalFreeSpins: {
      count: number;
      odds: number;
    };
  };
}

interface TumbleData {
  icons: Record<string, IconData>; // Winning icons data
  originalBoard: string; // CSV string of board state
  newBoard: string; // CSV string of board after cascade
  explodedSymbols?: number[]; // Array of exploded symbols (optional)
  newSymbols?: number[]; // Array of replacement symbols (optional)
  multipliers: number[]; // Multiplier values for this tumble
  win: number; // Win amount for this tumble
}
```

### Key Data Requirements

- **originalBoard/newBoard**: CSV strings (e.g., "1,2,3,4,5,...")
- **explodedSymbols/newSymbols**: Number arrays with `-1` for unchanged positions
- **icons**: Object with symbol keys and win data
- **win**: Numeric win amount for the tumble

## Special Symbol Preservation During Cascades

### 🔑 Critical Rule: Multiplier & Free Spin Symbols Never Explode

**Special symbols are immune to cascade explosions and remain on the board through all tumbles:**

#### **Symbol 10 (Multiplier) Preservation**

```javascript
// From tumble-calculator.js - Special symbols excluded from win calculations
const occurences = boardArray.filter((x) => x !== defaultDefinition.specialSymbols.multiplier && x !== defaultDefinition.specialSymbols.freeSpins);
//              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//              Symbol 10 (multiplier) - NEVER explodes        Symbol 9 (free spins) - NEVER explodes
```

#### **Cascade Example: Symbol 10 Movement**

```javascript
// Tumble 1: Symbol 10 at position 9
"originalBoard": "8,2,4,4,0,7,0,5,7,10,9,2,3,9,1,8,2,7,6,0,3,5,0,2,4,8,1,0,4,0"
//                                  ^^^ Symbol 10 here

// After cascade: Symbol 10 moved to positions 2,3 (not exploded!)
"newBoard": "0,0,10,10,0,7,2,7,8,2,0,5,6,0,0,2,1,1,1,2,4,5,4,7,7,4,7,3,0,0"
//                 ^^  ^^^ Symbol 10s moved but preserved

"explodedSymbols": [8,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,8,2,-1,-1,-1,...]
//                                                    ^^^ Position 9 = -1 (NOT exploded!)

"multipliers": [13] // Generated value from original Symbol 10
```

#### **Why This Matters for Data Generation**

1. **Symbol 10 Behavior:**

   - ✅ **Never mark as exploded**: Don't include in `explodedSymbols` arrays
   - ✅ **Preserve through cascades**: Include in `newBoard` states
   - ✅ **Can change positions**: Due to falling mechanics during cascades
   - ✅ **Generates multiplier values**: Each Symbol 10 creates random values (2-25)

2. **Symbol 9 Behavior:**

   - ✅ **Never mark as exploded**: Don't include in `explodedSymbols` arrays
   - ✅ **Preserve for counting**: Must remain for free spin detection
   - ✅ **Final board counting**: Only final tumble's board state is used for free spin counting

3. **Multiplier Accumulation Logic:**
   ```javascript
   Tumble 1: 1x Symbol 10 → generates [13]
   Tumble 2: 2x Symbol 10 → generates [14] + keeps [13] = [14, 13]
   Final:    1x Symbol 10 → preserves [14, 13] (total = 27)
   ```

#### **Settlement Data Requirements**

**✅ DO:**

- Keep Symbol 10 and Symbol 9 on boards through all tumbles
- Include these symbols in `newBoard` states (they can move positions)
- Accumulate multiplier values in `multipliers` arrays
- Never mark Symbol 10 or Symbol 9 in `explodedSymbols`

**❌ DON'T:**

- Explode Symbol 10 or Symbol 9 during cascades
- Remove these symbols from `newBoard` states
- Mark these symbols in `explodedSymbols` arrays
- Lose multiplier values between tumbles

## Tumble Structure Patterns

### Pattern 1: Single Tumble (No Wins)

**Use case**: Board has no winning combinations

```javascript
// Example from corrected JSON - Board 2
{
  "board": [0, 6, 4, 3, 3, 0, 5, 2, 2, 2, 2, 3, 0, 2, 2, 1, 1, 3, 0, 8, 0, 1, 2, 4, 1, 5, 1, 1, 1, 6],
  "multipliers": [],
  "settlementResult": {
    "tumbles": [
      {
        "icons": {},  // Empty - no wins
        "originalBoard": "0,6,4,3,3,0,5,2,2,2,2,3,0,2,2,1,1,3,0,8,0,1,2,4,1,5,1,1,1,6",
        "newBoard": "0,6,4,3,3,0,5,2,2,2,2,3,0,2,2,1,1,3,0,8,0,1,2,4,1,5,1,1,1,6", // Same as original
        "multipliers": [],
        "win": 0  // No win
        // No explodedSymbols or newSymbols properties
      }
    ]
  }
}
```

### Pattern 2: Two Tumbles (With Cascade)

**Use case**: Board has winning combination that cascades once

````javascript
// Example from corrected JSON - Board 1
{
  "board": [6, 10, 5, 7, 8, 1, 6, 1, 0, 1, 9, 9, 6, 2, 0, 7, 0, 1, 0, 3, 2, 7, 8, 2, 0, 0, 0, 4, 0, 0],
  "multipliers": [18],
  "settlementResult": {
    "tumbles": [
      // 🔑 FIRST TUMBLE: Has wins and cascade data
      {
        "icons": {"0": {"count": 9, "odds": 5, "win": 0.25}},  // Winning icons
        "originalBoard": "6,10,5,7,8,1,6,1,0,1,9,9,6,2,0,7,0,1,0,3,2,7,8,2,0,0,0,4,0,0",
        "newBoard": "6,10,5,7,8,1,1,6,1,1,1,9,9,6,2,1,2,7,1,3,2,2,7,8,2,0,0,2,7,4", // Different after cascade
        "explodedSymbols": [-1,-1,-1,-1,-1,-1,-1,-1,0,-1,-1,-1,-1,-1,0,-1,0,-1,0,-1,-1,-1,-1,-1,0,0,0,-1,0,0], // Shows what exploded
        "newSymbols": [-1,-1,-1,-1,-1,1,-1,-1,-1,-1,1,-1,-1,-1,-1,1,2,-1,-1,-1,2,-1,-1,-1,-1,0,0,2,7,-1],      // Shows replacements
        "multipliers": [18],
        "win": 5  // Has win amount
      },
      // 🔑 SECOND TUMBLE: Final tumble, no more cascades
      {
        "icons": {},  // Empty - no more wins
        "originalBoard": "6,10,5,7,8,1,1,6,1,1,1,9,9,6,2,1,2,7,1,3,2,2,7,8,2,0,0,2,7,4", // Same as first's newBoard
        "newBoard": "6,10,5,7,8,1,1,6,1,1,1,9,9,6,2,1,2,7,1,3,2,2,7,8,2,0,0,2,7,4",      // No change
        "multipliers": [18],
        "win": 0  // No additional wins
        // No explodedSymbols or newSymbols - final tumble
      }
    ]
  }
}

## Database Storage Format

### Complete Board Document Structure

Your service should generate data following this structure for database storage:

```javascript
// Database document format
{
  "board": [6, 10, 5, 7, 8, 1, 6, 1, 0, 1, 9, 9, 6, 2, 0, 7, 0, 1, 0, 3, 2, 7, 8, 2, 0, 0, 0, 4, 0, 0],
  "multipliers": [18],
  "isFreeSpin": false,
  "accumulatedMultiplier": 0,
  "remainingFreeSpins": 0,
  "freeSpinsPlayed": 0,
  "freeSpinWins": 0,
  "settlementResult": {
    "tumbles": [
      // Tumble array following the patterns above
    ],
    "freeSpins": {"count": 0, "odds": 0},
    "additionalFreeSpins": {"count": 0, "odds": 0}
  },
  "totalTumbleWin": 5  // Sum of all tumble wins
}
````

### ChainManager Integration

The ChainManager retrieves your data via `getNextResult()` and converts it using `convertChainBoardToResult()`:

```javascript
// ChainManager.getNextResult() returns your board data
const currentBoard = playerChain.boards[playerChain.currentIndex];
const boardResult = this.convertChainBoardToResult(currentBoard);

// convertChainBoardToResult() processes your settlementResult.tumbles
// and converts them to the format RoundCalculator expects
```

## Common Scenarios

### Scenario 1: No-Win Board (From Corrected JSON - Board 2)

Generate this database format for boards with no winning combinations:

```javascript
{
  "board": [0, 6, 4, 3, 3, 0, 5, 2, 2, 2, 2, 3, 0, 2, 2, 1, 1, 3, 0, 8, 0, 1, 2, 4, 1, 5, 1, 1, 1, 6],
  "multipliers": [],
  "settlementResult": {
    "tumbles": [
      {
        "icons": {},  // Empty - no wins
        "originalBoard": "0,6,4,3,3,0,5,2,2,2,2,3,0,2,2,1,1,3,0,8,0,1,2,4,1,5,1,1,1,6",
        "newBoard": "0,6,4,3,3,0,5,2,2,2,2,3,0,2,2,1,1,3,0,8,0,1,2,4,1,5,1,1,1,6", // Same as original
        "multipliers": [],
        "win": 0
        // No explodedSymbols or newSymbols properties
      }
    ]
  },
  "totalTumbleWin": 0
}
```

### Scenario 2: Two-Tumble Cascade (From Corrected JSON - Board 1)

Generate this database format for boards with cascading wins:

```javascript
{
  "board": [6, 10, 5, 7, 8, 1, 6, 1, 0, 1, 9, 9, 6, 2, 0, 7, 0, 1, 0, 3, 2, 7, 8, 2, 0, 0, 0, 4, 0, 0],
  "multipliers": [18],
  "settlementResult": {
    "tumbles": [
      {
        "icons": {"0": {"count": 9, "odds": 5, "win": 0.25}},
        "originalBoard": "6,10,5,7,8,1,6,1,0,1,9,9,6,2,0,7,0,1,0,3,2,7,8,2,0,0,0,4,0,0",
        "newBoard": "6,10,5,7,8,1,1,6,1,1,1,9,9,6,2,1,2,7,1,3,2,2,7,8,2,0,0,2,7,4",
        "explodedSymbols": [-1,-1,-1,-1,-1,-1,-1,-1,0,-1,-1,-1,-1,-1,0,-1,0,-1,0,-1,-1,-1,-1,-1,0,0,0,-1,0,0],
        "newSymbols": [-1,-1,-1,-1,-1,1,-1,-1,-1,-1,1,-1,-1,-1,-1,1,2,-1,-1,-1,2,-1,-1,-1,-1,0,0,2,7,-1],
        "multipliers": [18],
        "win": 5
      },
      {
        "icons": {},
        "originalBoard": "6,10,5,7,8,1,1,6,1,1,1,9,9,6,2,1,2,7,1,3,2,2,7,8,2,0,0,2,7,4",
        "newBoard": "6,10,5,7,8,1,1,6,1,1,1,9,9,6,2,1,2,7,1,3,2,2,7,8,2,0,0,2,7,4",
        "multipliers": [18],
        "win": 0
        // No explodedSymbols or newSymbols - final tumble
      }
    ]
  },
  "totalTumbleWin": 5
}
```

## Free Spin Processing

### How Free Spins Are Processed in RoundCalculator

Free spins use **identical tumbling logic** as regular spins - no special processing needed:

#### **1. Same Cascade Mechanics**

```javascript
// Free spins follow same tumble loop as regular spins
const generatedResult = preGeneratedResult?.shift() ?? this.boardGenerator.generate();
// ... same cascade processing ...
while (this.settleTumble(round, totalMultiplier, maxWinPerRound)) {
  // ... identical tumble logic ...
}
this.countFreeSpin(round); // 🔑 Free spin counting happens AFTER tumbling
```

#### **2. Multiplier Calculation Difference**

```javascript
if (round.freeSpin) {
  // 🔑 CRITICAL: Multiplier only accumulates when there are WINS (totalTumbleWin > 0)
  round.totalMultiplier = round.totalTumbleWin > 0 ? totalMultiplier + round.multiplier : totalMultiplier;
  //                      ^^^^^^^^^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^^^^^^^^^^^^        ^^^^^^^^^^^^^^
  //                      If there are wins        ADD current to accumulated          Keep accumulated unchanged

  round.actualBetwin = round.multiplier > 0 ? mathRound(round.totalTumbleWin * round.totalMultiplier, 2) : round.totalTumbleWin;
} else {
  // Regular spin: Uses only current multiplier (never accumulates)
  round.actualBetwin = round.multiplier > 0 ? mathRound(round.totalTumbleWin * round.multiplier, 2) : round.totalTumbleWin;
}
```

**Key Multiplier Rules:**

- **Free Spin + Win**: `totalMultiplier = previousTotal + currentMultiplier`
- **Free Spin + No Win**: `totalMultiplier = previousTotal` (unchanged)
- **Regular Spin**: Always uses single `multiplier` (never accumulates)

#### **3. Automatic Free Spin Counting**

```javascript
countFreeSpin(round) {
    // 🎯 Uses FINAL board state (last tumble's originalBoard)
    const lastBoard = tumbles[tumbles.length - 1].originalBoard.split(",").map((x) => parseInt(x));

    // 🎯 Counts symbol 9 (free spin symbol from defaultDefinition.specialSymbols.freeSpins)
    const freeSpinCount = lastBoard.filter((x) => x === 9).length;

    // 🎯 Different odds for initial vs additional free spins
    const freeSpinOddsConfig = round.freeSpin ? freeSpins.additionalOdds : freeSpins.initialOdds;

    // 🎯 Sets final settlement result automatically
    settlementResult.freeSpins = {
        count: round.reachMaxWin ? 0 : freeSpinCount,
        odds: round.reachMaxWin ? 0 : Math.max(0, ...freeSpinOdds),
    };
}
```

### Free Spin Data Structure Requirements

#### **✅ Same PreGeneratedResult Format**

Free spins require **no special preGeneratedResult structure** - use identical format as regular spins:

```javascript
// Free spin preGeneratedResult - IDENTICAL to regular spins
[
  {
    newBoard: [6, 10, 5, 7, 8, 1, 6, 1, 0, 1, 9, 9, 6, 2, 0, 7, 0, 1, 0, 3, 2, 7, 8, 2, 9, 9, 9, 4, 9, 0], // Include symbol 9
    multipliers: [18],
    explodedSymbols: [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    newSymbols: [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  },
];
```

#### **🎯 Key Free Spin Requirements**

**1. Symbol 9 Placement**

- **Free Spin Symbol**: `9` (from `defaultDefinition.specialSymbols.freeSpins`)
- **Counting Logic**: Final board state determines free spin award
- **Strategy**: Include symbol `9` in positions where free spins should trigger

**2. Free Spin Odds Configuration**

```javascript
freeSpins: {
  initialOdds: [      // For regular spins → free spins
    { count: 4, odds: 1 },  // 4+ symbol 9s = 1 free spin
    { count: 5, odds: 2 },  // 5+ symbol 9s = 2 free spins
    { count: 6, odds: 3 },  // 6+ symbol 9s = 3 free spins
  ],
  additionalOdds: [   // For free spins → additional free spins
    { count: 5, odds: 1 },  // 5+ symbol 9s = 1 additional free spin
    { count: 6, odds: 2 },  // 6+ symbol 9s = 2 additional free spins
  ],
}
```

### Free Spin Database Settlement Data

#### **Pattern 3: Regular Spin Triggering Free Spins**

```javascript
{
  "board": [6,10,5,7,8,1,6,1,0,1,9,9,6,2,0,7,0,1,0,3,2,7,8,2,9,9,9,4,9,0], // Contains 5x symbol 9
  "multipliers": [],
  "isFreeSpin": false, // This is a regular spin
  "settlementResult": {
    "tumbles": [
      {
        "icons": {},  // No wins, just free spin trigger
        "originalBoard": "6,10,5,7,8,1,6,1,0,1,9,9,6,2,0,7,0,1,0,3,2,7,8,2,9,9,9,4,9,0", // Final state with 5x symbol 9
        "newBoard": "6,10,5,7,8,1,6,1,0,1,9,9,6,2,0,7,0,1,0,3,2,7,8,2,9,9,9,4,9,0",
        "multipliers": [],
        "win": 0
      }
    ],
    "freeSpins": {
      "count": 5,  // Automatically counted by RoundCalculator
      "odds": 2    // Determined by initialOdds configuration
    },
    "additionalFreeSpins": {
      "count": 0,  // Required structure for regular spins
      "odds": 0
    }
  },
  "totalTumbleWin": 0
}
```

#### **Pattern 4: Free Spin with Cascades**

```javascript
{
  "board": [0,0,0,7,8,1,6,1,0,1,9,9,6,2,0,7,0,1,0,3,2,7,8,2,9,9,0,4,0,0], // Winning 0s + symbol 9s
  "multipliers": [15],
  "isFreeSpin": true,  // This is a free spin
  "settlementResult": {
    "tumbles": [
      {
        "icons": {"0": {"count": 8, "odds": 2, "win": 1.0}},  // Winning combination
        "originalBoard": "0,0,0,7,8,1,6,1,0,1,9,9,6,2,0,7,0,1,0,3,2,7,8,2,9,9,0,4,0,0",
        "newBoard": "4,1,2,7,8,1,6,1,3,1,9,9,6,2,5,7,8,1,6,3,2,7,8,2,9,9,7,4,1,2", // Cascaded + preserved symbol 9s
        "explodedSymbols": [0,0,0,-1,-1,-1,-1,-1,0,-1,-1,-1,-1,-1,0,-1,0,-1,0,-1,-1,-1,-1,-1,-1,-1,0,-1,0,0],
        "newSymbols": [4,1,2,-1,-1,-1,-1,-1,3,-1,-1,-1,-1,-1,5,-1,8,-1,6,-1,-1,-1,-1,-1,-1,-1,7,-1,1,2],
        "multipliers": [15],
        "win": 10
      },
      {
        "icons": {},  // No more wins
        "originalBoard": "4,1,2,7,8,1,6,1,3,1,9,9,6,2,5,7,8,1,6,3,2,7,8,2,9,9,7,4,1,2", // Final state still has 4x symbol 9s
        "newBoard": "4,1,2,7,8,1,6,1,3,1,9,9,6,2,5,7,8,1,6,3,2,7,8,2,9,9,7,4,1,2",
        "multipliers": [15],
        "win": 0
      }
    ],
    "freeSpins": {
      "count": 4,  // 4 symbol 9s in final board
      "odds": 1    // From additionalOdds (this was already a free spin)
    }
  },
  "totalTumbleWin": 10
}
```

### Free Spin Flow: Trigger → Execution

#### **🔄 Complete Free Spin Sequence**

When a round triggers free spins, here's the complete flow:

**Step 1: Regular Spin Triggers Free Spins (`freeSpin = false`)**

```javascript
// Regular spin processing
round.freeSpin = false; // This is a regular spin

// After tumbling completes, countFreeSpin() runs:
const freeSpinOddsConfig = round.freeSpin ? freeSpins.additionalOdds : freeSpins.initialOdds;
// → Uses initialOdds since round.freeSpin = false

// Multiplier calculation for regular spin:
round.actualBetwin = round.multiplier > 0 ? mathRound(round.totalTumbleWin * round.multiplier, 2) : round.totalTumbleWin;
// → Uses SINGLE multiplier (not accumulated)

// Result: settlementResult.freeSpins = { count: 5, odds: 2 }
// → Client knows 2 free spins were awarded
```

**Step 2: Playing Free Spin Rounds (`freeSpin = true`)**

```javascript
// Free spin processing
round.freeSpin = true; // This is a free spin
const totalMultiplier = 15; // Accumulated from previous free spins

// Same tumbling logic, but different multiplier calculation:
if (round.freeSpin) {
  // Accumulates multipliers from all previous free spins
  round.totalMultiplier = round.totalTumbleWin > 0 ? totalMultiplier + round.multiplier : totalMultiplier;
  // Uses ACCUMULATED totalMultiplier
  round.actualBetwin = round.multiplier > 0 ? mathRound(round.totalTumbleWin * round.totalMultiplier, 2) : round.totalTumbleWin;
}

// Free spin can trigger ADDITIONAL free spins:
const freeSpinOddsConfig = round.freeSpin ? freeSpins.additionalOdds : freeSpins.initialOdds;
// → Uses additionalOdds since round.freeSpin = true (harder odds)
```

#### **📊 Odds Configuration Comparison**

From test-data.js configuration:

```javascript
freeSpins: {
  initialOdds: [        // Regular spin → free spins (EASIER)
    { count: 4, odds: 1 },  // 4+ symbol 9s = 1 free spin
    { count: 5, odds: 2 },  // 5+ symbol 9s = 2 free spins
    { count: 6, odds: 3 },  // 6+ symbol 9s = 3 free spins
  ],
  additionalOdds: [     // Free spin → additional free spins (HARDER)
    { count: 5, odds: 1 },  // 5+ symbol 9s = 1 additional free spin
    { count: 6, odds: 2 },  // 6+ symbol 9s = 2 additional free spins
  ],
}
```

**Key Differences:**

- **Initial**: 4 symbol 9s triggers free spins
- **Additional**: Need 5+ symbol 9s to trigger additional free spins
- **Additional odds are harder** - requires more symbols for same reward

#### **🎯 Database Settlement Data for Free Spin Flow**

**Scenario: Regular Spin → Triggers Free Spins**

```javascript
{
  "board": [6,10,5,7,8,1,6,1,0,1,9,9,6,2,0,7,0,1,0,3,2,7,8,2,9,9,9,4,9,0],
  "multipliers": [],
  "isFreeSpin": false,  // ← This is a regular spin
  "settlementResult": {
    "tumbles": [
      {
        "icons": {},
        "originalBoard": "6,10,5,7,8,1,6,1,0,1,9,9,6,2,0,7,0,1,0,3,2,7,8,2,9,9,9,4,9,0", // 5x symbol 9
        "newBoard": "6,10,5,7,8,1,6,1,0,1,9,9,6,2,0,7,0,1,0,3,2,7,8,2,9,9,9,4,9,0",
        "multipliers": [],
        "win": 0
      }
    ],
    "freeSpins": {
      "count": 5,    // RoundCalculator counted symbol 9s
      "odds": 2      // From initialOdds: 5 symbol 9s = 2 free spins
    }
  }
  // → Client receives: "You won 2 free spins!"
}
```

**Scenario: Free Spin Round (Playing the Awarded Free Spins)**

```javascript
{
  "board": [0,0,0,7,8,1,6,1,0,1,9,9,6,2,0,7,0,1,0,3,2,7,8,2,9,9,0,4,0,0],
  "multipliers": [8],
  "isFreeSpin": true,   // ← This is a free spin round
  "settlementResult": {
    "tumbles": [
      {
        "icons": {"0": {"count": 8, "odds": 2, "win": 1.0}},
        "originalBoard": "0,0,0,7,8,1,6,1,0,1,9,9,6,2,0,7,0,1,0,3,2,7,8,2,9,9,0,4,0,0",
        "newBoard": "4,1,2,7,8,1,6,1,3,1,9,9,6,2,5,7,8,1,6,3,2,7,8,2,9,9,7,4,1,2", // 4x symbol 9 after cascade
        "explodedSymbols": [0,0,0,-1,-1,-1,-1,-1,0,-1,-1,-1,-1,-1,0,-1,0,-1,0,-1,-1,-1,-1,-1,-1,-1,0,-1,0,0],
        "newSymbols": [4,1,2,-1,-1,-1,-1,-1,3,-1,-1,-1,-1,-1,5,-1,8,-1,6,-1,-1,-1,-1,-1,-1,-1,7,-1,1,2],
        "multipliers": [8],
        "win": 10
      },
      {
        "icons": {},
        "originalBoard": "4,1,2,7,8,1,6,1,3,1,9,9,6,2,5,7,8,1,6,3,2,7,8,2,9,9,7,4,1,2", // Final state: 4x symbol 9
        "newBoard": "4,1,2,7,8,1,6,1,3,1,9,9,6,2,5,7,8,1,6,3,2,7,8,2,9,9,7,4,1,2",
        "multipliers": [8],
        "win": 0
      }
    ],
    "freeSpins": {
      "count": 4,    // Only 4 symbol 9s in final state
      "odds": 0      // From additionalOdds: 4 symbol 9s = 0 additional free spins (need 5+)
    }
  }
  // → No additional free spins triggered
  // → But win calculated with accumulated totalMultiplier
}
```

### Free Spin Integration Rules

#### **💡 Key Question: What Happens When `freeSpin = true`?**

When the next round has `freeSpin = true`, here are the key differences:

**1. Multiplier Calculation Changes**

```javascript
// freeSpin = false (regular spin)
round.actualBetwin = round.totalTumbleWin * round.multiplier; // Single multiplier

// freeSpin = true (free spin)
round.totalMultiplier = totalMultiplier + round.multiplier; // Accumulates multipliers
round.actualBetwin = round.totalTumbleWin * round.totalMultiplier; // Uses accumulated total
```

**2. Free Spin Odds Change**

```javascript
// freeSpin = false → Uses initialOdds (easier: 4+ symbol 9s triggers)
// freeSpin = true  → Uses additionalOdds (harder: 5+ symbol 9s needed)
```

**3. Same Everything Else**

- ✅ **Identical tumbling logic** - cascades work the same way
- ✅ **Same preGeneratedResult format** - no structural changes needed
- ✅ **Same symbol counting** - still counts symbol 9s in final board
- ✅ **Same data generation** - use identical settlement patterns

**In summary**: Free spin rounds are more rewarding (accumulated multipliers) but harder to retrigger (stricter odds)!

#### **🔧 Critical Free Spin Guidelines**

1. **No Special preGeneratedResult Structure**: Use same format as regular spins
2. **Symbol 9 Strategy**: Include in final board positions to trigger free spins
3. **Preserve Through Cascades**: Don't mark symbol 9 as exploded if you want it to count
4. **Automatic Processing**: RoundCalculator handles all free spin counting and odds
5. **ChainManager Selection**: Uses `isFreeSpin` context to select appropriate boards

#### **🎯 Free Spin Symbol Placement Strategy**

```javascript
// ✅ CORRECT: Symbol 9s in final board trigger free spins
"originalBoard": "1,2,3,4,5,6,7,8,9,9,9,9,9,..." // 5 symbol 9s = 2 free spins

// ✅ CORRECT: Symbol 9s preserved through cascade
"explodedSymbols": [0,0,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,...] // Symbol 9s not exploded
"newSymbols": [4,1,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,...]      // Symbol 9s remain

// ❌ WRONG: Symbol 9s exploded, won't count for free spins
"explodedSymbols": [...,9,9,9,9,9,...] // Symbol 9s exploded = no free spins
```

### Free Spin Implementation Checklist

**Before Implementation:**

- [ ] Understand symbol `9` is the free spin trigger
- [ ] Review initialOdds vs additionalOdds configuration
- [ ] Plan symbol 9 placement strategy in final boards

**During Generation:**

- [ ] Use standard tumble structure (no special properties)
- [ ] Include symbol `9` in board positions for free spin triggers
- [ ] Ensure symbol `9` survives cascades when needed for counting
- [ ] Set correct `isFreeSpin` flag in database documents

**Integration Testing:**

- [ ] Test with different symbol `9` counts (4, 5, 6+) to verify odds
- [ ] Verify free spin counting uses final `originalBoard` state
- [ ] Confirm ChainManager selects free spin boards via `isFreeSpin` context
- [ ] Validate multiplier accumulation works correctly in free spins

## Validation Rules

### Critical Settlement Data Requirements

Ensure your settlement data follows these rules:

#### ✅ **Required Properties for Each Board**

- `board`: Array of 30 integers representing initial symbols
- `multipliers`: Array of numbers (can be empty)
- `settlementResult.tumbles`: Array of tumble objects
- `totalTumbleWin`: Sum of all tumble win amounts

#### ✅ **Required Properties for Each Tumble**

- `icons`: Object with winning symbols (empty for non-winning tumbles)
- `originalBoard`: CSV string of board state before processing
- `newBoard`: CSV string of board state after cascade (if any)
- `multipliers`: Array of multiplier values
- `win`: Numeric win amount

#### ✅ **Optional Properties for Winning Tumbles**

- `explodedSymbols`: Array of 30 integers showing exploded positions
- `newSymbols`: Array of 30 integers showing replacement symbols

#### ✅ **Data Format Rules**

- Board arrays: Always 30 elements, integers 0-10
- CSV strings: Use comma separation, no spaces
- Win amounts: Non-negative numbers
- Arrays: Use `[]` for empty, never `null` or `undefined`

#### ✅ **Special Symbol Rules**

- **Symbol 10 (Multiplier)**: Never include in `explodedSymbols`, always preserve in `newBoard`
- **Symbol 9 (Free Spins)**: Never include in `explodedSymbols`, always preserve in `newBoard`
- **Multiplier Accumulation**: Each Symbol 10 generates values, accumulate in `multipliers` arrays
- **Position Changes**: Special symbols can move during cascades but never disappear from explosions

## Integration Points

### Database to ChainManager Flow

```javascript
// 1. Your service generates and stores data in database
{
  "board": [...],
  "settlementResult": { "tumbles": [...] }
}

// 2. ChainManager retrieves via getNextResult()
async getNextResult(playerName, playerContext, roundContext) {
  const currentBoard = playerChain.boards[playerChain.currentIndex];
  return this.convertChainBoardToResult(currentBoard);
}

// 3. convertChainBoardToResult() converts for RoundCalculator
convertChainBoardToResult(chainBoard) {
  return chainBoard.settlementResult.tumbles.map(/* conversion logic */);
}
```

### Key Integration Rules

1. **Database Format**: Store settlement data exactly as shown in patterns
2. **CSV Strings**: Use comma-separated format for board states
3. **Cascade Data**: Include `explodedSymbols`/`newSymbols` only in winning tumbles
4. **Final Tumbles**: Must have no `explodedSymbols`/`newSymbols` properties
5. **Win Amounts**: Must match calculated icon wins

### Data Generation Checklist

**Before Implementation:**

- [ ] Review the corrected JSON examples
- [ ] Understand tumble cascade patterns
- [ ] Plan database schema for board storage

**During Generation:**

- [ ] Follow Pattern 1 for non-winning boards
- [ ] Follow Pattern 2 for cascade scenarios
- [ ] Validate all board arrays are exactly 30 elements
- [ ] Ensure CSV strings have no spaces
- [ ] **CRITICAL**: Never explode Symbol 10 (multiplier) or Symbol 9 (free spins)
- [ ] Preserve special symbols in all `newBoard` states through cascades
- [ ] Accumulate multiplier values from all Symbol 10s in `multipliers` arrays

**Before Database Storage:**

- [ ] Verify tumble structure matches patterns
- [ ] Check win amounts are calculated correctly
- [ ] Confirm final tumbles have empty cascade data
- [ ] Test integration with ChainManager retrieval

### Support

For integration issues:

1. Verify your settlement data matches the corrected JSON patterns exactly
2. Check tumble structure follows Pattern 1 or Pattern 2
3. Ensure database storage format includes all required properties
4. Test ChainManager retrieval with sample data

---

## Practical Chain Example

For a complete reference implementation, see `src/chain-output/practical-chain-example.json` which demonstrates:

### **🎯 All Settlement Patterns**

- **3-tumble cascade** with Symbol 10 preservation and free spins trigger
- **2-tumble cascade** with multiplier accumulation
- **No wins boards** with single tumble structure
- **Free spin rounds** with accumulated multipliers (27 → 35 → 47 → 72)
- **Additional free spins** triggered from free spin rounds

### **🔧 Key Mechanics Demonstrated**

- **Special symbol preservation**: Symbol 10 and 9 never in `explodedSymbols`
- **Multiplier accumulation**: `[13] → [14, 13] → [15, 22] → [25]`
- **Free spin odds**: `initialOdds` vs `additionalOdds` usage
- **Data structures**: Both `freeSpins` and `additionalFreeSpins` formats
- **Cascade patterns**: Proper `explodedSymbols`/`newSymbols` offset logic

### **📊 Chain Flow Example**

```
Regular Spin (3 tumbles) → Triggers 2 Free Spins →
Free Spin 1 (wins, multiplier: 27+8=35) →
Free Spin 2 (triggers 2 more, multiplier: 35+12=47) →
Continue pattern with compound multiplier growth...
```

This practical example serves as a **complete reference implementation** for services generating chain settlement data.

## Summary for Data Generation Services

This guide provides everything needed to generate correct settlement tumble data:

- **Complete database storage format** with required structure
- **Tumble structure patterns** for different scenarios
- **Free spin processing** with automatic counting and odds
- **Special symbol preservation** rules for Symbol 10 and 9
- **Integration flow** from database to game engine
- **Real examples** from corrected tease data and practical chain
- **Validation rules** to ensure data compatibility

Generate settlement data following these patterns, store in database, and ChainManager will handle the rest of the integration flow seamlessly.

---

_**Settlement Data Generation Guide**_  
_Last Updated: September 2025_  
_For Services Generating Chain Settlement Data_
