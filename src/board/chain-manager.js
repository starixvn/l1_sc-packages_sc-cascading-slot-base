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

        // Initialize chain configurations (can be overridden by gameConfigs)
        this.chainConfigs = { enabled: false, reload: false };
    }

    /**
     * Update chain configurations from gameConfigs and handle reloading if needed
     * @param {Object} newChainConfigs - Configuration object with enabled and reload properties
     */
    async updateChainConfigs(newChainConfigs) {
        const previousConfigs = { ...this.chainConfigs };
        this.chainConfigs = { ...this.chainConfigs, ...newChainConfigs };

        // Log configuration changes
        if (previousConfigs.enabled !== this.chainConfigs.enabled) {
            this.logService.logError(
                `[GameID: ${this.gameData.gameConfigs?.gameId}] Result chains ${this.chainConfigs.enabled ? "enabled" : "disabled"} via gameConfigs`
            );
        }

        // Handle reload: reload chains if both enabled and reload are true
        if (this.chainConfigs.enabled && this.chainConfigs.reload) {
            this.logService.logError(`[GameID: ${this.gameData.gameConfigs?.gameId}] Reloading result chains due to configuration`);
            await this.reloadChainData();
        }
    }

    /**
     * Check if result chains are enabled from gameConfigs
     * @returns {boolean} - True if chains are enabled
     */
    isChainEnabled() {
        return this.chainConfigs.enabled;
    }

    async loadChainData() {
        if (!this.isChainEnabled()) {
            return;
        }

        try {
            const resultChains = await this.resultChainRepository.find({}).lean().exec();

            for (const chain of resultChains) {
                if (chain.boardsData && chain.boardsData.length > 0) {
                    // Check if chain already exists to prevent duplicates during reload
                    const existingChain = this.availableChains.find((existing) => existing.name === chain.name);

                    if (!existingChain) {
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
            }
        } catch (error) {
            this.logService.logError(`[GameID: ${this.gameData.gameConfigs?.gameId}] Failed to load chain data:`, error);
        }
    }

    /**
     * Reload chain data - appends new chains without disrupting active player chains
     */
    async reloadChainData() {
        const previousChainCount = this.availableChains.length;

        // Load fresh chain data (will append to existing availableChains)
        await this.loadChainData();

        const newChainCount = this.availableChains.length - previousChainCount;
        this.logService.logError(
            `[GameID: ${this.gameData.gameConfigs?.gameId}] Reloaded chains: ${newChainCount} new chains added, ${this.availableChains.length} total available`
        );
    }

    async assignChain(playerName, playerContext = {}) {
        if (this.availableChains.length === 0) {
            this.logService.logWarning(`[GameID: ${this.gameData.gameConfigs?.gameId}] No chains available to assign to player ${playerName}`);
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
            this.logService.logError(
                `[GameID: ${this.gameData.gameConfigs?.gameId}] Failed to create persistent chain assignment for ${playerName}`,
                {
                    error: error.message,
                    playerId,
                    chainName: chain.name,
                    betLevel,
                    coinValue,
                    operatorId,
                    gameId,
                    chainId,
                    currency,
                }
            );
        }

        return true;
    }

    async getNextResult(playerName, playerContext = {}, roundContext = {}) {
        if (!this.isChainEnabled()) {
            return null;
        }

        const playerChain = this.gameData.playerChains[playerName];

        if (!playerChain) {
            return null;
        }

        if (playerChain.currentIndex >= playerChain.totalBoards) {
            return null;
        }

        const currentBoard = playerChain.boards[playerChain.currentIndex];
        const boardResult = this.convertChainBoardToResult(currentBoard);

        return boardResult;
    }

    /**
     * Update chain progress after a spin
     */
    async updateChainProgress({ playerId, playerName, betLevel, coinValue, roundBetAmount = 0, roundWinAmount = 0 }) {
        try {
            // Get current chain state from in-memory data
            const playerChain = this.gameData.playerChains[playerName];
            if (!playerChain) {
                this.logService.logWarning(`[GameID: ${this.gameData.gameConfigs?.gameId}] No chain found for player ${playerName}`);

                return null;
            }

            // Since we always process boards sequentially, just increment by 1
            playerChain.currentIndex += 1;

            // Build completion status based on the NEW progress
            const setOptions = {
                lastActivityAt: new Date(),
            };

            // Check if chain is completed after this increment
            if (playerChain.currentIndex >= playerChain.totalBoards) {
                setOptions.status = ASSIGNMENT_STATUS.COMPLETED;
                setOptions.completedAt = new Date();
                // Clean up completed chain from memory
                delete this.gameData.playerChains[playerName];
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
                this.logService.logWarning(`[GameID: ${this.gameData.gameConfigs?.gameId}] No active chain assignment found for player ${playerId}`);
                return null;
            }

            // Log completion if chain was completed
            if (updatedAssignment.status === ASSIGNMENT_STATUS.COMPLETED) {
                this.logService.logError(
                    `[GameID: ${this.gameData.gameConfigs?.gameId}] Chain completed: ${updatedAssignment.chainName} for player ${updatedAssignment.playerName}`,
                    {
                        assignmentId: updatedAssignment._id,
                        totalBoards: updatedAssignment.totalBoards,
                        totalWin: updatedAssignment.totalWinAmount,
                        totalBet: updatedAssignment.totalBetAmount,
                    }
                );
            }

            return updatedAssignment;
        } catch (error) {
            this.logService.logError(`[GameID: ${this.gameData.gameConfigs?.gameId}] Failed to update chain progress`, {
                error: error.message,
                playerId,
                playerName,
            });

            return null;
        }
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
        if (!this.isChainEnabled()) {
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
