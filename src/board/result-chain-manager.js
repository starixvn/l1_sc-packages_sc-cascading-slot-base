import fs from "fs";
import path from "path";

export default class ChainManager {
    constructor(gameData, logService) {
        this.gameData = gameData;
        this.logService = logService;

        this.gameData.playerChains = this.gameData.playerChains || {};
        this.availableChains = [];
        this.loadChainData();
    }

    loadChainData() {
        try {
            const chainFilePath = path.join(process.cwd(), "src/chain-output/wave-100boards-1757053424315.json");
            const chainData = JSON.parse(fs.readFileSync(chainFilePath, "utf8"));

            if (chainData.boards && chainData.boards.length > 0) {
                this.availableChains.push({
                    name: chainData.metadata.name,
                    boards: chainData.boards,
                    metadata: chainData.metadata,
                });
            }
        } catch (error) {
            this.logService.logWarning("Failed to load chain data, will fallback to normal generation: " + error.message);
        }
    }

    assignChain(playerName) {
        if (this.availableChains.length === 0) {
            this.logService.logWarning(`No chains available to assign to player ${playerName}`);
            return false;
        }

        const chain = this.availableChains[0];

        this.gameData.playerChains[playerName] = {
            name: chain.name,
            boards: [...chain.boards],
            currentIndex: 0,
            totalBoards: chain.boards.length,
            assignedAt: new Date(),
            isFreeSpin: false,
            freeSpinChain: [],
        };

        return true;
    }

    getNextResult(playerName, isFreeSpin = false) {
        const playerChain = this.gameData.playerChains[playerName];

        if (!playerChain) {
            return null;
        }

        if (playerChain.currentIndex >= playerChain.totalBoards) {
            delete this.gameData.playerChains[playerName];
            return null;
        }

        const currentBoard = playerChain.boards[playerChain.currentIndex];

        if (isFreeSpin) {
            const freeSpinBoard = this.findNextFreeSpinBoard(playerChain, playerChain.currentIndex);
            if (freeSpinBoard) {
                playerChain.currentIndex = freeSpinBoard.index + 1;
                return this.convertChainBoardToResult(freeSpinBoard.board);
            }
        }

        playerChain.currentIndex++;
        return this.convertChainBoardToResult(currentBoard);
    }

    findNextFreeSpinBoard(playerChain, startIndex) {
        for (let i = startIndex; i < playerChain.boards.length; i++) {
            const board = playerChain.boards[i];
            if (board.isFreeSpin === true || board.remainingFreeSpins > 0) {
                return { board, index: i };
            }
        }
        return null;
    }

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

    shouldAssignChain(playerName) {
        return !this.gameData.playerChains[playerName];
    }

    getChainStatus(playerName) {
        const playerChain = this.gameData.playerChains[playerName];

        if (!playerChain) {
            return { hasChain: false };
        }

        return {
            hasChain: true,
            chainName: playerChain.name,
            progress: `${playerChain.currentIndex}/${playerChain.totalBoards}`,
            assignedAt: playerChain.assignedAt,
        };
    }
}
