// Status constants
const ASSIGNMENT_STATUS = {
    ACTIVE: "active",
    COMPLETED: "completed",
};

export default class ChainManager {
    constructor(gameData, logService, resultChainRepository, assignmentRepository, appConfigs) {
        this.gameData = gameData;
        this.logService = logService;
        this.resultChainRepository = resultChainRepository;
        this.assignmentRepository = assignmentRepository;
        this.appConfigs = appConfigs;

        this.gameData.playerChains = this.gameData.playerChains || {};
        this.availableChains = [];

        if (this.appConfigs.resultChains === undefined) {
            this.appConfigs.resultChains = { enabled: false };
        }
    }

    async loadChainData() {
        if (!this.appConfigs.resultChains?.enabled) {
            return;
        }

        try {
            const resultChains = await this.resultChainRepository.find({}).lean().exec();

            for (const chain of resultChains) {
                if (chain.boardsData && chain.boardsData.length > 0) {
                    this.availableChains.push({
                        name: chain.name,
                        boards: chain.boardsData,
                        metadata: {
                            name: chain.name,
                            createdAt: chain.createdAt,
                        },
                    });
                }
            }
        } catch (error) {
            this.logService.logError(error);
        }
    }

    async assignChain(playerName, playerContext = {}) {
        if (this.availableChains.length === 0) {
            this.logService.logWarning(`No chains available to assign to player ${playerName}`);
            return false;
        }

        const chain = this.availableChains[0];

        // Create in-memory assignment (for backward compatibility)
        this.gameData.playerChains[playerName] = {
            name: chain.name,
            boards: [...chain.boards],
            currentIndex: 0,
            totalBoards: chain.boards.length,
            assignedAt: new Date(),
            isFreeSpin: false,
            freeSpinChain: [],
        };

        // Create persistent assignment
        try {
            // Destructure required and optional fields from playerContext
            const { playerId, betLevel, coinValue, operatorId, gameId, chainId, currency } = playerContext;

            const assignmentData = {
                playerId,
                playerName,
                chainName: chain.name,
                currentBoardIndex: 0,
                totalBoards: chain.boards.length,
                assignedAt: new Date(),
                lastActivityAt: new Date(),
                status: ASSIGNMENT_STATUS.ACTIVE,
                totalWinAmount: 0,
                totalBetAmount: 0,
                betLevel,
                coinValue,
                operatorId,
                gameId,
                chainId,
                currency,
            };

            await this.assignmentRepository.create(assignmentData);
        } catch (error) {
            const { playerId, betLevel, coinValue, operatorId, gameId, chainId, currency } = playerContext;
            this.logService.logError(`Failed to create persistent chain assignment for ${playerName}`, {
                error: error.message,
                playerId,
                chainName: chain.name,
                betLevel,
                coinValue,
                operatorId,
                gameId,
                chainId,
                currency,
            });
        }

        return true;
    }

    async getNextResult(playerName, playerContext = {}, roundContext = {}) {
        if (!this.appConfigs.resultChains?.enabled) {
            return null;
        }

        const playerChain = this.gameData.playerChains[playerName];

        if (!playerChain) {
            return null;
        }

        if (playerChain.currentIndex >= playerChain.totalBoards) {
            delete this.gameData.playerChains[playerName];
            return null;
        }

        const currentBoard = playerChain.boards[playerChain.currentIndex];
        let boardResult = null;
        let newIndex = playerChain.currentIndex + 1;
        const isFreeSpin = roundContext.isFreeSpin || false;

        if (isFreeSpin) {
            const freeSpinBoard = this.findNextFreeSpinBoard(playerChain, playerChain.currentIndex);
            if (freeSpinBoard) {
                newIndex = freeSpinBoard.index + 1;
                boardResult = this.convertChainBoardToResult(freeSpinBoard.board);
            }
        }

        if (!boardResult) {
            boardResult = this.convertChainBoardToResult(currentBoard);
        }

        playerChain.currentIndex = newIndex;

        return boardResult;
    }

    /**
     * Update chain progress after a spin
     */
    async updateChainProgress({ playerId, betLevel, coinValue, roundBetAmount = 0, roundWinAmount = 0, currentBoardIndex, totalBoards }) {
        try {
            // Build completion status based on current progress
            const setOptions = {
                lastActivityAt: new Date(),
            };

            // Check if chain will be completed after this increment
            const newBoardIndex = currentBoardIndex + 1;
            if (newBoardIndex === totalBoards) {
                setOptions.status = ASSIGNMENT_STATUS.COMPLETED;
                setOptions.completedAt = new Date();
            }

            const updatedAssignment = await this.assignmentRepository.findOneAndUpdate(
                {
                    playerId,
                    betLevel,
                    coinValue,
                    status: ASSIGNMENT_STATUS.ACTIVE,
                },
                {
                    $inc: {
                        currentBoardIndex: 1,
                        totalBetAmount: roundBetAmount,
                        totalWinAmount: roundWinAmount,
                    },
                    $set: {
                        ...setOptions,
                    },
                },
                {
                    new: true,
                }
            );

            if (!updatedAssignment) {
                this.logService.logWarning(`No active chain assignment found for player ${playerId}`);
                return null;
            }

            // Log completion if chain was completed
            if (updatedAssignment.status === ASSIGNMENT_STATUS.COMPLETED) {
                this.logService.logInfo(`Chain completed: ${updatedAssignment.chainName} for player ${updatedAssignment.playerName}`, {
                    assignmentId: updatedAssignment._id,
                    totalBoards: updatedAssignment.totalBoards,
                    totalWin: updatedAssignment.totalWinAmount,
                    totalBet: updatedAssignment.totalBetAmount,
                });
            }

            return updatedAssignment;
        } catch (error) {
            this.logService.logError("Failed to update chain progress", {
                error: error.message,
                playerId,
            });
            return null;
        }
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
            const tumbles = chainBoard.settlementResult.tumbles;
            const result = [];

            for (let i = 0; i < tumbles.length; i++) {
                const tumble = tumbles[i];
                const preGeneratedItem = {
                    newBoard: tumble.originalBoard ? tumble.originalBoard.split(",").map((x) => parseInt(x)) : chainBoard.board,
                    multipliers: tumble.multipliers || chainBoard.multipliers || [],
                    explodedSymbols: [],
                    newSymbols: [],
                };

                // Settlement data from current tumble goes to the NEXT preGeneratedResult item
                // This is because cascade data describes what happens AFTER the current tumble
                if (i > 0) {
                    const previousTumble = tumbles[i - 1];
                    preGeneratedItem.explodedSymbols = previousTumble.explodedSymbols || [];
                    preGeneratedItem.newSymbols = previousTumble.newSymbols || [];
                }

                result.push(preGeneratedItem);
            }

            return result;
        }

        return [
            {
                newBoard: chainBoard.board,
                multipliers: chainBoard.multipliers || [],
                explodedSymbols: [],
                newSymbols: [],
            },
        ];
    }

    shouldAssignChain(playerName) {
        if (!this.appConfigs.resultChains?.enabled) {
            return false;
        }
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
