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
- [Validation Rules](#validation-rules)
- [Common Scenarios](#common-scenarios)
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

## Summary for Data Generation Services

This guide provides everything needed to generate correct settlement tumble data:

- **Complete database storage format** with required structure
- **Tumble structure patterns** for different scenarios
- **Integration flow** from database to game engine
- **Real examples** from corrected tease data
- **Validation rules** to ensure data compatibility

Generate settlement data following these patterns, store in database, and ChainManager will handle the rest of the integration flow seamlessly.

---

_**Settlement Data Generation Guide**_  
_Last Updated: September 2025_  
_For Services Generating Chain Settlement Data_
