// Status constants
const ASSIGNMENT_STATUS = {
    ACTIVE: "active",
    COMPLETED: "completed",
};

export default class UserChainConsumer {
    /**
     * @param {Object} dependencies - Destructured dependencies for proxy injection
     * @param {SlotGameData} dependencies.gameData
     * @param {ChainManager} dependencies.resultChainManager
     * @param {mongoose.Model} dependencies.assignmentRepository
     * @param {logger} dependencies.logService
     */
    constructor({ gameData, resultChainManager, assignmentRepository, logService }) {
        this.gameData = gameData;
        this.chainManager = resultChainManager;
        this.assignmentRepository = assignmentRepository;
        this.logService = logService;
    }

    /**
     * Load active player chain assignments from database and restore them to memory
     */
    async loadActiveChains() {
        try {
            const activeAssignments = await this.assignmentRepository.find({ status: ASSIGNMENT_STATUS.ACTIVE }).lean().exec();

            for (const assignment of activeAssignments) {
                // Find the corresponding chain data
                const chain = this.chainManager.availableChains.find((c) => c.name === assignment.chainName);

                if (chain) {
                    // Restore player chain to memory
                    this.gameData.playerChains[assignment.playerName] = {
                        name: assignment.chainName,
                        boards: [...chain.boards],
                        currentIndex: assignment.currentBoardIndex,
                        totalBoards: assignment.totalBoards,
                        assignedAt: assignment.assignedAt,
                        isFreeSpin: false,
                        freeSpinChain: [],
                        // Store additional context for filtering
                        betLevel: assignment.betLevel,
                        coinValue: assignment.coinValue,
                        playerId: assignment.playerId,
                    };
                }
            }
        } catch (error) {
            this.logService.logError(`Failed to load active chains:`, error);
        }
    }

    async assignChain(playerName, playerContext = {}) {
        const { betLevel, coinValue } = playerContext;

        // Create composite key for multiple chains per player
        const chainKey = `${playerName}-${betLevel}-${coinValue}`;

        // Check if player already has an active chain for this bet configuration
        if (this.gameData.playerChains[chainKey]) {
            return false;
        }

        // Simple random selection from all available chains
        if (this.chainManager.availableChains.length === 0) {
            return false;
        }

        const randomIndex = Math.floor(Math.random() * this.chainManager.availableChains.length);
        const chain = this.chainManager.availableChains[randomIndex];

        // Create in-memory assignment with composite key
        this.gameData.playerChains[chainKey] = {
            name: chain.name,
            boards: [...chain.boards],
            currentIndex: 0,
            totalBoards: chain.boards.length,
            assignedAt: new Date(),
            betLevel,
            coinValue,
            playerId: playerContext.playerId,
            playerName,
        };

        // Create persistent assignment
        try {
            // Destructure required and optional fields from playerContext
            const { playerId, operatorId, gameId, chainId, currency } = playerContext;

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
            const { playerId, operatorId, gameId, chainId, currency } = playerContext;
            this.logService.logError(`Failed to create chain assignment for ${playerName}: ${error.message}`);
        }

        return true;
    }

    /**
     * Update chain progress after a spin
     */
    async updateChainProgress({ playerId, playerName, betLevel, coinValue, roundBetAmount = 0, roundWinAmount = 0 }) {
        try {
            // Create composite key for multiple chains per player
            const chainKey = `${playerName}-${betLevel}-${coinValue}`;

            // Get current chain state from in-memory data
            const playerChain = this.gameData.playerChains[chainKey];
            if (!playerChain) {
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
                delete this.gameData.playerChains[chainKey];
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
                return null;
            }

            // Chain completion is handled silently

            return updatedAssignment;
        } catch (error) {
            this.logService.logError(`Failed to update chain progress for ${playerName}: ${error.message}`);

            return null;
        }
    }

    /**
     * Find chains that have been used with specific betLevel and coinValue
     */
    async findChainsByBet(betLevel, coinValue, status = ASSIGNMENT_STATUS.ACTIVE) {
        try {
            const statusFilter = Array.isArray(status) ? { $in: status } : status;

            const assignments = await this.assignmentRepository
                .find(
                    {
                        betLevel,
                        coinValue,
                        status: statusFilter,
                    },
                    { chainName: 1, _id: 0 }
                )
                .lean()
                .exec();

            // Extract unique chain names
            return [...new Set(assignments.map((a) => a.chainName))];
        } catch (error) {
            this.logService.logError(`Failed to find chains by bet params: ${error.message}`);
            return [];
        }
    }
}
